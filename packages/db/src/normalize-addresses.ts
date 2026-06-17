/**
 * Normalize imported property addresses the way the app does it: run each legacy
 * 지번 address through Postcodify (the same API as components/address-search.tsx) and
 * store the canonical 도로명 address + English.
 *
 *   address    = ko_common + ko_doro      (도로명)
 *   address_en = en_doro + ", " + en_common
 *   address_detail (floor/unit) is preserved untouched.
 *
 * Only EXACT 지번 matches (same 동 + 번지 as the query) are applied; near-misses
 * (e.g. 202-8 → 202-2) and no-result rows are reported and left unchanged.
 *
 * Usage:  tsx src/normalize-addresses.ts          # dry run (calls API, writes nothing)
 *         tsx src/normalize-addresses.ts --write   # apply exact matches
 */
import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types";

const WRITE = process.argv.includes("--write");
const API_URL = "https://api.poesis.kr/post/search.php";
const CONCURRENCY = 4;

interface PCResult {
  postcode5: string; ko_common: string; ko_doro: string; ko_jibeon: string;
  en_common: string; en_doro: string; en_jibeon: string; building_name: string;
}

async function searchAddress(q: string): Promise<PCResult[]> {
  const u = new URL(API_URL);
  u.searchParams.set("v", "3.5.0");
  u.searchParams.set("q", q);
  u.searchParams.set("ref", "kingsrealty.vercel.app");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.error) return [];
      return (d.results || []) as PCResult[];
    } catch {
      await new Promise((res) => setTimeout(res, 400));
    }
  }
  return [];
}

/** Pull "동 번지" from a legacy address. e.g. "신촌동241-3 1층" → {dong:"신촌동", bunji:"241-3"}. */
function extractJibeon(address: string): { dong: string; bunji: string } | null {
  const m = address.match(/([가-힣]{2,}동)\s*(\d{1,4}(?:-\d{1,3})?)/);
  return m ? { dong: m[1], bunji: m[2] } : null;
}
/** City/gu/do tokens (e.g. ["성남시","수정구"]) — needed to disambiguate dong names shared across cities. */
function extractRegions(address: string): string[] {
  const m = address.match(/[가-힣]{1,3}(?:특별자치시|특별자치도|특별시|광역시|시|군|구|도)/g) || [];
  return [...new Set(m)];
}
/** Trailing 번지 of a Postcodify ko_jibeon: "창곡동 582-1" → "582-1". */
function bunjiOf(jibeon: string): string | null {
  const m = jibeon.match(/(\d{1,4}(?:-\d{1,3})?)\s*$/);
  return m ? m[1] : null;
}
/** Does the legacy address already contain this 도로명 (road name + number)? */
function roadMatches(address: string, koDoro: string): boolean {
  const road = koDoro.split(/\s+/)[0];
  const numm = koDoro.match(/\d+(?:-\d+)?/);
  return !!road && address.includes(road) && (!numm || address.includes(numm[0]));
}

interface Plan {
  id: number; original: string; detail: string | null; query: string;
  status: "exact" | "near" | "none" | "skip";
  newAddress?: string; newEn?: string; building?: string; gotJibeon?: string;
}

async function plan(p: { id: number; address: string; address_detail: string | null }): Promise<Plan> {
  const original = p.address;
  if (!original || original === "주소 미등록")
    return { id: p.id, original, detail: p.address_detail, query: "", status: "skip" };

  const jb = extractJibeon(original);
  const regions = extractRegions(original);
  // expected 시/구 (ignore 도 — legacy often omits it) used to reject wrong-city matches
  const expectedSiGu = regions.filter((r) => /(?:시|구)$/.test(r));
  const query = jb ? [...regions, jb.dong, jb.bunji].join(" ") : original;
  const results = await searchAddress(query);
  if (!results.length)
    return { id: p.id, original, detail: p.address_detail, query, status: "none" };

  const norm = (r: PCResult) => ({
    newAddress: `${r.ko_common} ${r.ko_doro}`.trim(),
    newEn: `${r.en_doro}, ${r.en_common}`.trim(),
    building: r.building_name || undefined,
    gotJibeon: r.ko_jibeon,
  });
  // compare on the core so legacy "서울시" matches official "서울특별시"; 구 names compared whole
  const regionOk = (r: PCResult) =>
    expectedSiGu.length === 0 ||
    expectedSiGu.every((t) => r.ko_common.includes(/시$/.test(t) ? t.replace(/시$/, "") : t));

  if (jb) {
    const exact = results.find((r) => r.ko_jibeon.includes(jb.dong) && bunjiOf(r.ko_jibeon) === jb.bunji && regionOk(r));
    if (exact) return { id: p.id, original, detail: p.address_detail, query, status: "exact", ...norm(exact) };
    const near = results.find((r) => r.ko_jibeon.includes(jb.dong) && regionOk(r)) || results.find((r) => r.ko_jibeon.includes(jb.dong)) || results[0];
    return { id: p.id, original, detail: p.address_detail, query, status: "near", ...norm(near) };
  }
  // road-style original (no bare 동 번지): accept if region matches AND the road appears in the original
  const roadHit = results.find((r) => regionOk(r) && roadMatches(original, r.ko_doro));
  if (roadHit) return { id: p.id, original, detail: p.address_detail, query, status: "exact", ...norm(roadHit) };
  return { id: p.id, original, detail: p.address_detail, query, status: "near", ...norm(results[0]) };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });
  try {
    const props = await db.selectFrom("property").select(["id", "address", "address_detail"]).orderBy("id").execute();
    console.log(`Normalizing ${props.length} property addresses via Postcodify (${WRITE ? "WRITE" : "DRY RUN"})…\n`);

    const plans = await mapLimit(props, CONCURRENCY, plan);
    const by = { exact: 0, near: 0, none: 0, skip: 0 };
    for (const pl of plans) by[pl.status]++;

    console.log("── EXACT matches (will apply) ──");
    for (const pl of plans.filter((p) => p.status === "exact"))
      console.log(`  #${pl.id}  ${pl.original}${pl.detail ? "  ["+pl.detail+"]" : ""}\n        → ${pl.newAddress}  |  ${pl.newEn}${pl.building ? "  ("+pl.building+")" : ""}`);

    console.log("\n── NEAR / unverified (left unchanged, review) ──");
    for (const pl of plans.filter((p) => p.status === "near"))
      console.log(`  #${pl.id}  q="${pl.query}"  got 지번 "${pl.gotJibeon}"  → ${pl.newAddress}`);

    console.log("\n── NO RESULT (left unchanged) ──");
    for (const pl of plans.filter((p) => p.status === "none"))
      console.log(`  #${pl.id}  q="${pl.query}"  (${pl.original})`);

    console.log(`\nSummary: exact=${by.exact}  near=${by.near}  none=${by.none}  skip=${by.skip}  (total ${props.length})`);

    if (!WRITE) {
      console.log("\nDRY RUN — nothing written. Re-run with --write to apply EXACT matches.");
      await db.destroy();
      return;
    }

    let applied = 0;
    for (const pl of plans.filter((p) => p.status === "exact")) {
      await db.updateTable("property").set({ address: pl.newAddress!, address_en: pl.newEn! }).where("id", "=", pl.id).execute();
      applied++;
    }
    console.log(`\n✓ Applied ${applied} normalized addresses (address + address_en). Near/none rows untouched.`);
    await db.destroy();
  } catch (e) {
    await db.destroy();
    throw e;
  }
}

main().catch((e) => {
  console.error("Normalize failed:", e);
  process.exit(1);
});
