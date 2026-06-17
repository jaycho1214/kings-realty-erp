/**
 * Backfill property.address_jibeon (지번 주소) for existing rows by looking up each
 * current 도로명 `address` in Postcodify and storing `ko_common + ko_jibeon`.
 *
 * Usage:  tsx src/populate-address-jibeon.ts          # dry run
 *         tsx src/populate-address-jibeon.ts --write    # apply
 */
import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types";

const WRITE = process.argv.includes("--write");
const API_URL = "https://api.poesis.kr/post/search.php";
const CONCURRENCY = 4;

interface PCResult { ko_common: string; ko_doro: string; ko_jibeon: string }

async function search(q: string): Promise<PCResult[]> {
  const u = new URL(API_URL);
  u.searchParams.set("v", "3.5.0");
  u.searchParams.set("q", q);
  u.searchParams.set("ref", "kingsrealty.vercel.app");
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.error) return [];
      return (d.results || []) as PCResult[];
    } catch { await new Promise((res) => setTimeout(res, 400)); }
  }
  return [];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });
  const props = await db.selectFrom("property").select(["id", "address"]).orderBy("id").execute();
  console.log(`Backfilling 지번 for ${props.length} properties (${WRITE ? "WRITE" : "DRY RUN"})…\n`);

  const plans = await mapLimit(props, CONCURRENCY, async (p) => {
    const addr = (p.address || "").trim();
    if (!addr || addr === "주소 미등록") return { id: p.id, addr, jibeon: null as string | null, status: "skip" };
    const results = await search(addr);
    if (!results.length) return { id: p.id, addr, jibeon: null, status: "none" };
    // prefer the result whose 도로명 exactly equals the stored address
    const exact = results.find((r) => `${r.ko_common} ${r.ko_doro}`.trim() === addr);
    const pick = exact || results.find((r) => addr.includes(r.ko_doro.split(/\s+/)[0])) || results[0];
    const jibeon = `${pick.ko_common} ${pick.ko_jibeon}`.trim();
    return { id: p.id, addr, jibeon, status: exact ? "exact" : "fuzzy" };
  });

  const by = { exact: 0, fuzzy: 0, none: 0, skip: 0 } as Record<string, number>;
  for (const pl of plans) {
    by[pl.status]++;
    if (pl.status !== "skip") console.log(`  #${String(pl.id).padStart(3)} [${pl.status.padEnd(5)}] ${pl.addr}  ⇒  지번: ${pl.jibeon ?? "(none — left null)"}`);
  }
  console.log(`\nSummary: exact=${by.exact} fuzzy=${by.fuzzy} none=${by.none} skip=${by.skip} (total ${props.length})`);

  if (!WRITE) { console.log("\nDRY RUN — nothing written. Re-run with --write to apply."); await db.destroy(); return; }
  let n = 0;
  for (const pl of plans) {
    if (pl.jibeon) { await db.updateTable("property").set({ address_jibeon: pl.jibeon }).where("id", "=", pl.id).execute(); n++; }
  }
  console.log(`\n✓ Set address_jibeon on ${n} properties.`);
  await db.destroy();
}

main().catch((e) => { console.error("Backfill failed:", e); process.exit(1); });
