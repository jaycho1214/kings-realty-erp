/**
 * Re-divide bundled payments so each line item carries its real amount instead of
 * the importer's crude even-split. Operates on the CURRENT DB (after rent/deposit
 * corrections), uniformly across all tenants. Every bundle's total is preserved exactly.
 *
 * Per bundle: REALTY FEE → 150; rent months → lease.monthly_rent; a single 보증금 line →
 * lease.deposit; explicit per-utility amounts parsed from 추가금액/memo → their line;
 * the remainder goes to the one leftover line, or is even-split across leftover UTILITY
 * lines. Bundles with ≥2 unrecoverable non-utility lines (선불금/기타…) or any ≤0 line are
 * left untouched. Also fixes leases whose monthly_rent is a prorated partial (rent < deposit×0.9).
 *
 * Usage:  tsx src/re-divide-payments.ts          # dry run
 *         tsx src/re-divide-payments.ts --write    # apply
 */
import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types";

const WRITE = process.argv.includes("--write");
const num = (s: unknown) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const isMonth = (x: string) => /\d{4}년\s*\d{1,2}월/.test(x);
const UTIL_KEYS = ["전기", "가스", "수도", "인터넷", "아파트공과금", "정수기"] as const;

function utilKey(item: string): string | null {
  if (/가스|gas/i.test(item)) return "가스";
  if (/전기|elec/i.test(item)) return "전기";
  if (/수도|water/i.test(item)) return "수도";
  if (/아파트공과금|집주인관리공과금|관리비/.test(item)) return "아파트공과금";
  if (/인터넷/.test(item)) return "인터넷";
  if (/정수기/.test(item)) return "정수기";
  return null;
}
const isRecoverableUnknown = (item: string) => !!utilKey(item); // utilities can be even-split; 선불금/기타/훅업 cannot

/** Extract explicit per-utility amounts from 추가금액 + memo (best-effort; absent in most rows). */
function parseUtilAmounts(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const t = String(text);
  const put = (k: string, v: number) => { if (v >= 1000 && out[k] == null) out[k] = v; };
  const pats: [RegExp, string][] = [
    [/인터넷\s*([\d,]{4,})/, "인터넷"], [/(?:^|[\s,/])인\s*([\d,]{4,})/, "인터넷"],
    [/전기\s*([\d,]{4,})/, "전기"], [/(?:^|[\s,/])전\s*([\d,]{4,})/, "전기"],
    [/수도\s*([\d,]{4,})/, "수도"], [/가스\s*([\d,]{4,})/, "가스"],
    [/아파트공과금\s*([\d,]{4,})/, "아파트공과금"], [/관(?:리비)?\s*([\d,]{4,})/, "아파트공과금"],
    [/정수기\s*([\d,]{4,})/, "정수기"],
  ];
  for (const [re, k] of pats) { const m = t.match(re); if (m) put(k, num(m[1])); }
  return out;
}

interface Pay { id: number; type: string; item: string; amt: number; notes: string }

/** Compute target amounts for a bundle, or null to leave it untouched. Preserves total exactly. */
function divide(pays: Pay[], rent: number, dep: number, extraMemo: string): Map<number, number> | null {
  const total = pays.reduce((a, p) => a + p.amt, 0);
  const target = new Map<number, number>();
  let remaining = total;
  const set = (p: Pay, v: number) => { target.set(p.id, v); remaining -= v; };
  const left = () => pays.filter((p) => !target.has(p.id));

  for (const p of pays) if (/realty\s*fee/i.test(p.item)) { if (remaining < 150) return null; set(p, 150); }
  for (const p of pays) if (p.type === "rent" && isMonth(p.item) && !target.has(p.id)) {
    if (rent <= 0 || remaining < rent) return null; // partial/move-in or unknown rent → bail
    set(p, rent);
  }
  const depLines = pays.filter((p) => p.item.trim() === "보증금");
  if (depLines.length === 1 && dep > 0 && remaining >= dep && !target.has(depLines[0].id)) set(depLines[0], dep);

  const parsed = parseUtilAmounts(extraMemo);
  for (const p of left()) { const k = utilKey(p.item); if (k && parsed[k] && remaining >= parsed[k]) set(p, parsed[k]); }

  const un = left();
  if (un.length === 0) { if (remaining !== 0) return null; }
  else if (un.length === 1) set(un[0], remaining);
  else {
    if (!un.every((p) => isRecoverableUnknown(p.item))) return null; // ≥2 unknown non-utility lines → unsplittable
    const rem0 = remaining; // snapshot: set() mutates `remaining`, so the last-item calc must use the pre-loop value
    const per = Math.round(rem0 / un.length);
    un.forEach((p, i) => set(p, i === un.length - 1 ? rem0 - per * (un.length - 1) : per));
  }
  if ([...target.values()].some((v) => v <= 0)) return null;
  if ([...target.values()].reduce((a, b) => a + b, 0) !== total) return null;
  return target;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });

  const rows = await db.selectFrom("payment")
    .innerJoin("lease", "lease.id", "payment.lease_id")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .select(["payment.id as pid", "payment.bundle_id as bundle", "payment.payment_type as type", "payment.amount_krw as amt",
      "payment.notes as notes", "lease.id as lid", "lease.property_id as prop", "tenant.name as tname",
      "lease.monthly_rent_krw as rent", "lease.deposit_krw as dep", "tenant.notes as memo"])
    .where("payment.bundle_id", "is not", null).execute();

  // group by bundle
  const bundles = new Map<string, typeof rows>();
  for (const r of rows) { const b = r.bundle as string; if (!bundles.has(b)) bundles.set(b, []); bundles.get(b)!.push(r); }

  // rent fixes (partial-month): rent < deposit*0.9
  const rentFix = new Map<number, { lid: number; prop: number; name: string; old: number; nw: number }>();
  for (const r of rows) {
    const rent = num(r.rent), dep = num(r.dep);
    if (dep > 0 && rent > 0 && rent < dep * 0.9 && !rentFix.has(r.lid))
      rentFix.set(r.lid, { lid: r.lid, prop: r.prop, name: r.tname, old: rent, nw: dep });
  }

  const structural: any[] = [], utilOnly: any[] = [];
  const payUpdates: { id: number; amt: number }[] = [];
  let unresolved = 0;
  for (const [bid, ps] of bundles) {
    const r0 = ps[0];
    const rent = rentFix.has(r0.lid) ? rentFix.get(r0.lid)!.nw : num(r0.rent);
    const dep = num(r0.dep);
    const extraMemo = (ps.map((p) => /추가:\s*([^|]+)/.exec(p.notes || "")?.[1] || "").join(" ") + " " + (r0.memo || ""));
    const items: Pay[] = ps.map((p) => ({ id: p.pid, type: p.type, item: /항목:\s*([^|]+)/.exec(p.notes || "")?.[1]?.trim() || p.type, amt: num(p.amt), notes: p.notes || "" }));
    const t = divide(items, rent, dep, extraMemo);
    if (!t) { unresolved++; continue; }
    const changes = items.filter((p) => t.get(p.id) !== p.amt);
    if (!changes.length) continue;
    // structural = a rent / 보증금 / 선불금 line moved; else pure utility rebalance
    const isStructural = changes.some((p) => p.type === "rent" || /보증금|선불금/.test(p.item)) || rentFix.has(r0.lid);
    const rec = { bid, tenant: r0.tname, lines: changes.map((p) => ({ item: p.item, old: p.amt, nw: t.get(p.id)! })) };
    (isStructural ? structural : utilOnly).push(rec);
    for (const p of items) if (t.get(p.id) !== p.amt) payUpdates.push({ id: p.id, amt: t.get(p.id)! });
  }

  console.log(`\n=== RENT fixes (partial-month): ${rentFix.size} ===`);
  for (const f of rentFix.values()) console.log(`  ${f.name}  ${f.old.toLocaleString()} → ${f.nw.toLocaleString()}`);
  console.log(`\n=== STRUCTURAL bundle fixes (rent/deposit/선불금 separated): ${structural.length} ===`);
  for (const s of structural.slice(0, 18)) console.log(`  ${s.tenant.padEnd(24)} ${s.lines.map((l: any) => `${l.item}:${l.old.toLocaleString()}→${l.nw.toLocaleString()}`).join("  ")}`);
  if (structural.length > 18) console.log(`  …and ${structural.length - 18} more`);
  console.log(`\n=== UTILITY-only rebalances: ${utilOnly.length}   ·   left untouched (unrecoverable): ${unresolved} ===`);
  console.log(`Total payment line updates: ${payUpdates.length}`);

  if (!WRITE) { console.log("\nDRY RUN — nothing written."); await db.destroy(); return; }
  await db.transaction().execute(async (tx) => {
    for (const f of rentFix.values()) {
      await tx.updateTable("lease").set({ monthly_rent_krw: String(f.nw) }).where("id", "=", f.lid).execute();
      await tx.updateTable("property").set({ monthly_rent_krw: String(f.nw) }).where("id", "=", f.prop).execute();
    }
    for (const u of payUpdates) await tx.updateTable("payment").set({ amount_krw: String(u.amt), amount_paid: String(u.amt) }).where("id", "=", u.id).execute();
  });
  console.log(`\n✓ Applied ${rentFix.size} rent fixes + ${payUpdates.length} payment line updates (bundle totals preserved).`);
  await db.destroy();
}
main().catch((e) => { console.error("Failed:", e); process.exit(1); });
