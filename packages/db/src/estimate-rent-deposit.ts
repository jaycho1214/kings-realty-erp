/**
 * Best-effort 월세/보증금 estimates for leases the source can't pin down exactly.
 * Runs AFTER fix-rent-deposit.ts (which handles the cleanly-derivable cases).
 *
 *   월세  — only for leases with NO pure-rent row and NO explicit memo rent:
 *           • rent+utility rows (1 month + only utilities) → median total, flagged "공과금 포함(추정)"
 *           • else a "보증금 + 1 month" move-in row → total/2 (보증금=월세 convention)
 *           • else left as-is, flagged "확인 필요"
 *   보증금 — wherever a 보증금 signal exists (sales line or memo) and deposit=0 → set = 1 month's rent.
 *
 * Every estimated field is flagged in lease.notes so it is never mistaken for source-exact.
 *
 * Usage:  tsx src/estimate-rent-deposit.ts          # dry run
 *         tsx src/estimate-rent-deposit.ts --write    # apply
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
const UTIL = /전기|가스|수도|인터넷|아파트공과금|집주인관리공과금|정수기/;

function load(file: string, hdrs: string[]): Record<string, string>[] {
  const wb = XLSX.readFile(file);
  const a: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  return a.slice(2).filter((r) => r.some((c) => String(c).trim())).map((r) => {
    const o: Record<string, string> = {};
    hdrs.forEach((h, i) => (o[h] = String(r[i] ?? "").trim()));
    return o;
  });
}
const items = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const hasPureRent = (rows: Record<string, string>[]) => rows.some((r) => { const it = items(r.items); return it.length && it.every(isMonth); });
const memoRent = (m: string) => {
  for (const re of [/월세\s*([\d,]{7,})/, /(\d{1,2})월세\s*[,]?\s*([\d,]{7,})/, /BALANCE\s*[:\s]*([\d,]{7,})/i, /([\d,]{7,})\s*원?\s*(?:내야|받기|받아)/, /([\d,]{7,})\s*월?\s*\(일시불\)/]) {
    const x = m.match(re); if (x) { const v = num(x[x.length - 1]); if (v >= 500_000 && v <= 15_000_000) return v; }
  }
  return null;
};
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const isCleanBundled = (s: string) => { const it = items(s); const mo = it.filter(isMonth); const ot = it.filter((x) => !isMonth(x)); return mo.length === 1 && ot.length >= 1 && ot.every((o) => UTIL.test(o)); };
/** "보증금 + N rent months" (nothing else) → N, so rent = total/(N+1) under 보증금=월세. 0 if not that shape. */
const depPlusMonths = (s: string): number => { const it = items(s); const mo = it.filter(isMonth); const ot = it.filter((x) => !isMonth(x)); return ot.length === 1 && ot[0] === "보증금" && mo.length >= 1 ? mo.length : 0; };
const hasDepSignal = (rows: Record<string, string>[], memo: string) => /보증금/.test(memo) || rows.some((r) => /보증금/.test(r.items));
const addFlag = (notes: string | null, flag: string) => (notes && notes.includes(flag) ? notes : notes ? `${notes} | ${flag}` : flag);

async function main() {
  const cust = load(CUSTOMERS, ["name", "group", "phone", "address", "memo", "rank"]);
  const sales = load(SALES, ["date", "customer", "seller", "items", "qty", "amount", "total", "bank", "owner", "ophone", "start", "end", "fam", "extra", "apt", "disc"]);
  const memoBy = new Map(cust.map((c) => [norm(c.name), c.memo]));
  const byT = new Map<string, Record<string, string>[]>();
  for (const s of sales) { const k = norm(s.customer); if (!k) continue; if (!byT.has(k)) byT.set(k, []); byT.get(k)!.push(s); }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });
  const leases = await db.selectFrom("lease").innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .select(["lease.id as lid", "lease.property_id as pid", "tenant.name", "lease.monthly_rent_krw as rent", "lease.deposit_krw as dep", "lease.notes as notes"]).execute();

  const rentChanges: any[] = [], depChanges: any[] = [];
  for (const l of leases) {
    const rows = byT.get(norm(l.name)) || [];
    const memo = memoBy.get(norm(l.name)) || "";
    let rent = num(l.rent), notes = l.notes, rentFlag = "", rentReliable = true;
    // best-effort rent ONLY for leases the clean pass couldn't resolve
    if (!hasPureRent(rows) && memoRent(memo) == null) {
      const clean = rows.filter((r) => isCleanBundled(r.items)).map((r) => num(r.amount)).filter((v) => v > 0);
      const depRow = rows.map((r) => ({ n: depPlusMonths(r.items), t: num(r.amount) })).find((x) => x.n > 0);
      if (clean.length) { rent = median(clean); rentFlag = "월세 공과금 포함 추정치"; }
      else if (depRow) { rent = Math.round(depRow.t / (depRow.n + 1)); rentFlag = "월세·보증금 분리 추정(보증금=월세 가정)"; }
      else { rentReliable = false; rentFlag = num(l.rent) > 0 ? "월세 추정 불가 — 확인 필요(공과금 포함 가능)" : "원자료 부족 — 월세 미상"; }
      if (rentFlag) notes = addFlag(notes, rentFlag);
      if (rent !== num(l.rent) || rentFlag) rentChanges.push({ ...l, newRent: rent, flag: rentFlag, notes });
    }
    // 보증금 = 1 month rent wherever a deposit signal exists, none stored, and the rent is trustworthy
    if (num(l.dep) === 0 && rent > 0 && rentReliable && hasDepSignal(rows, memo)) {
      const dflag = "보증금=월세 1개월 가정(원자료 분리불가)";
      notes = addFlag(notes, dflag);
      depChanges.push({ ...l, newDep: rent, flag: dflag, notes });
    }
  }

  console.log(`\n=== 월세 best-effort (${rentChanges.length}) ===`);
  for (const c of rentChanges) console.log(`  ${c.name.padEnd(26)} ${num(c.rent).toLocaleString().padStart(11)} → ${c.newRent.toLocaleString().padStart(11)}  [${c.flag}]`);
  console.log(`\n=== 보증금 = 1-month-rent (${depChanges.length}) ===`);
  for (const c of depChanges) console.log(`  ${c.name.padEnd(26)} 0 → ${c.newDep.toLocaleString().padStart(11)}`);
  console.log(`\nSummary: ${rentChanges.length} rent flagged/estimated, ${depChanges.length} deposits set to 1-month rent`);

  if (!WRITE) { console.log("\nDRY RUN — nothing written. Re-run with --write to apply."); await db.destroy(); return; }

  // merge per-lease note updates (rent + deposit flags) so we write notes once
  const noteByLease = new Map<number, string | null>();
  for (const c of rentChanges) noteByLease.set(c.lid, c.notes);
  for (const c of depChanges) noteByLease.set(c.lid, c.notes);
  for (const c of rentChanges) if (c.newRent !== num(c.rent)) {
    await db.updateTable("lease").set({ monthly_rent_krw: String(c.newRent) }).where("id", "=", c.lid).execute();
    await db.updateTable("property").set({ monthly_rent_krw: String(c.newRent) }).where("id", "=", c.pid).execute();
  }
  for (const c of depChanges) {
    await db.updateTable("lease").set({ deposit_krw: String(c.newDep) }).where("id", "=", c.lid).execute();
    await db.updateTable("property").set({ deposit_krw: String(c.newDep) }).where("id", "=", c.pid).execute();
  }
  for (const [lid, notes] of noteByLease) await db.updateTable("lease").set({ notes }).where("id", "=", lid).execute();
  console.log(`\n✓ Applied: ${rentChanges.filter((c) => c.newRent !== num(c.rent)).length} rent values, ${depChanges.length} deposits, ${noteByLease.size} note flags.`);
  await db.destroy();
}

main().catch((e) => { console.error("Estimate failed:", e); process.exit(1); });
