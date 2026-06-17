/**
 * Re-derive 월세 (monthly rent) and 보증금 (deposit) for imported leases from the
 * authoritative signals in the source spreadsheets, and correct lease + property.
 *
 *   월세  = mode of PURE rent rows (items are only "YYYY년N월"; per-month = total/months).
 *          Fallbacks: explicit rent in the memo, then split of a deposit+1-month row.
 *   보증금 = deposit-only sales row → "보증금" in memo → (deposit+1-month row total − rent).
 *          0 only when the source has no 보증금 signal (선불금/prepaid arrangements).
 *
 * Usage:  tsx src/fix-rent-deposit.ts            # dry run (no writes)
 *         tsx src/fix-rent-deposit.ts --write     # apply corrections
 */
import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import XLSX from "xlsx";
import type { DB } from "./types";

const WRITE = process.argv.includes("--write");
const CUSTOMERS = process.env.CUSTOMERS || "/Users/jay/Downloads/Customers.xlsx";
const SALES = process.env.SALES || "/Users/jay/Downloads/Sales.xlsx";

const num = (s: unknown) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const isMonth = (x: string) => /^\d{4}년\s*\d{1,2}월$/.test(x.trim());

function load(file: string, hdrs: string[]): Record<string, string>[] {
  const wb = XLSX.readFile(file);
  const a: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  return a.slice(2).filter((r) => r.some((c) => String(c).trim())).map((r) => {
    const o: Record<string, string> = {};
    hdrs.forEach((h, i) => (o[h] = String(r[i] ?? "").trim()));
    return o;
  });
}

/** Monthly rent = mode of per-month amounts from pure rent rows (handles proration + multi-month). */
function deriveRent(rows: Record<string, string>[]): { rent: number; src: string } | null {
  const per: number[] = [];
  for (const r of rows) {
    const it = r.items.split(",").map((x) => x.trim()).filter(Boolean);
    if (it.length && it.every(isMonth)) {
      const t = num(r.amount);
      if (t > 0) per.push(Math.round(t / it.length));
    }
  }
  if (!per.length) return null;
  const f: Record<number, number> = {};
  per.forEach((a) => (f[a] = (f[a] || 0) + 1));
  const best = Object.entries(f).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0];
  return { rent: Number(best[0]), src: `pure-rent×${per.length}` };
}

function memoRent(memo: string): number | null {
  const m = String(memo);
  for (const re of [/월세\s*[:\s]*([\d,]{7,})/, /([\d,]{7,})\s*원?\s*(?:내야|받기|받아)/, /([\d,]{7,})\s*월?\(일시불\)/]) {
    const x = m.match(re);
    if (x) {
      const v = num(x[1]);
      if (v >= 500_000 && v <= 15_000_000) return v;
    }
  }
  return null;
}

function deriveDeposit(rows: Record<string, string>[], memo: string, rent: number): { dep: number; src: string } {
  // 1) deposit-only sales row
  const depOnly = rows
    .filter((r) => {
      const it = r.items.split(",").map((x) => x.trim()).filter(Boolean);
      return it.length === 1 && it[0] === "보증금";
    })
    .map((r) => num(r.amount))
    .filter((v) => v > 0);
  if (depOnly.length) return { dep: depOnly[0], src: "deposit-only-row" };
  // 2) memo
  const mm = String(memo).match(/보증금\s*[:\s]*([\d,]+)/);
  if (mm && num(mm[1]) > 0) return { dep: num(mm[1]), src: "memo" };
  // 3) "보증금 + single rent month" bundled row → total − rent
  for (const r of rows) {
    const it = r.items.split(",").map((x) => x.trim()).filter(Boolean);
    const months = it.filter(isMonth);
    if (it.includes("보증금") && months.length === 1 && it.length === 2 && rent > 0) {
      const dep = num(r.amount) - rent;
      if (dep > 0) return { dep, src: "bundled(total−rent)" };
    }
  }
  return { dep: 0, src: "none" };
}

async function main() {
  const customers = load(CUSTOMERS, ["name", "group", "phone", "address", "memo", "rank"]);
  const sales = load(SALES, ["date", "customer", "seller", "items", "qty", "amount", "total", "bank", "owner", "ophone", "start", "end", "fam", "extra", "apt", "disc"]);
  const memoByName = new Map(customers.map((c) => [norm(c.name), c.memo]));
  const byTenant = new Map<string, Record<string, string>[]>();
  for (const s of sales) {
    const k = norm(s.customer);
    if (!k) continue;
    if (!byTenant.has(k)) byTenant.set(k, []);
    byTenant.get(k)!.push(s);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });

  const leases = await db
    .selectFrom("lease")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .select(["lease.id as lease_id", "lease.property_id", "tenant.name", "lease.monthly_rent_krw as rent", "lease.deposit_krw as dep"])
    .execute();

  const rentChanges: any[] = [], depChanges: any[] = [], rentUnresolved: any[] = [];
  for (const l of leases) {
    const rows = byTenant.get(norm(l.name)) || [];
    const oldRent = num(l.rent), oldDep = num(l.dep);
    let newRent = oldRent, rentSrc = "kept";
    const dr = deriveRent(rows);
    if (dr) { newRent = dr.rent; rentSrc = dr.src; }
    else {
      const mr = memoRent(memoByName.get(norm(l.name)) || "");
      if (mr) { newRent = mr; rentSrc = "memo"; }
      else if (oldRent === 0) rentUnresolved.push(l.name);
    }
    const dd = deriveDeposit(rows, memoByName.get(norm(l.name)) || "", newRent);
    const newDep = dd.dep;
    if (newRent !== oldRent) rentChanges.push({ name: l.name, oldRent, newRent, src: rentSrc, lease_id: l.lease_id, property_id: l.property_id });
    if (newDep !== oldDep) depChanges.push({ name: l.name, oldDep, newDep, src: dd.src, lease_id: l.lease_id, property_id: l.property_id });
  }

  console.log(`\n=== 월세 corrections (${rentChanges.length}) ===`);
  for (const c of rentChanges) console.log(`  ${c.name.padEnd(28)} ${c.oldRent.toLocaleString().padStart(12)} → ${c.newRent.toLocaleString().padStart(12)}  [${c.src}]`);
  if (rentUnresolved.length) console.log(`  UNRESOLVED rent (left as-is): ${rentUnresolved.join(", ")}`);
  console.log(`\n=== 보증금 corrections (${depChanges.length}) ===`);
  for (const c of depChanges) console.log(`  ${c.name.padEnd(28)} ${c.oldDep.toLocaleString().padStart(12)} → ${c.newDep.toLocaleString().padStart(12)}  [${c.src}]`);
  const depSet = depChanges.filter((c) => c.newDep > 0).length;
  console.log(`\nSummary: rent changed ${rentChanges.length}, deposit changed ${depChanges.length} (${depSet} set to a value), rent unresolved ${rentUnresolved.length}`);

  if (!WRITE) {
    console.log("\nDRY RUN — nothing written. Re-run with --write to apply.");
    await db.destroy();
    return;
  }
  for (const c of rentChanges) {
    await db.updateTable("lease").set({ monthly_rent_krw: String(c.newRent) }).where("id", "=", c.lease_id).execute();
    await db.updateTable("property").set({ monthly_rent_krw: String(c.newRent) }).where("id", "=", c.property_id).execute();
  }
  for (const c of depChanges) {
    await db.updateTable("lease").set({ deposit_krw: String(c.newDep) }).where("id", "=", c.lease_id).execute();
    await db.updateTable("property").set({ deposit_krw: String(c.newDep) }).where("id", "=", c.property_id).execute();
  }
  console.log(`\n✓ Applied: ${rentChanges.length} rent, ${depChanges.length} deposit (lease + property).`);
  await db.destroy();
}

main().catch((e) => {
  console.error("Fix failed:", e);
  process.exit(1);
});
