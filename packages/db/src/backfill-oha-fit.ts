/**
 * Fit legacy tenant data to the new OHA-by-rank feature (migrations 015–017).
 *
 * 1) Normalize tenant.rank to the app's canonical dashed format (tenant-form RANK_GROUPS):
 *    E5→E-5, O3→O-3, WO1→W-1, CW2→W-2, CW3→W-3. So ranks match the form dropdown AND
 *    resolve via rankToGroupCode (which previously returned null for WO1/CW2/CW3 → no OHA).
 *    Civilians (GS*, CONTRACTOR) and blanks are left as-is (correctly no OHA group).
 * 2) Backfill dependent_status (needed by getOhaLimit) only where NULL:
 *    has a family member, or memo says 부부/신혼 → "with"; memo says 싱글/single → "without".
 *    Genuinely-unknown single soldiers stay NULL (staff can set).
 *
 * Usage:  tsx src/backfill-oha-fit.ts          # dry run
 *         tsx src/backfill-oha-fit.ts --write    # apply
 */
import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types";

const WRITE = process.argv.includes("--write");

/** Map a legacy rank to the canonical dashed military grade, or return it unchanged. */
function normRank(raw: string | null): string | null {
  if (!raw) return null;
  const r = raw.trim().toUpperCase();
  let m: RegExpMatchArray | null;
  if ((m = r.match(/^E-?([1-9])$/))) return `E-${m[1]}`;
  if ((m = r.match(/^O-?([1-9]0?)$/))) return `O-${m[1]}`;
  if ((m = r.match(/^W-?([1-5])$/))) return `W-${m[1]}`; // bare W-grade
  if ((m = r.match(/^WO-?([1-5])$/))) return `W-${m[1]}`; // Warrant Officer 1 → W-1
  if ((m = r.match(/^CW-?([1-5])$/))) return `W-${m[1]}`; // Chief Warrant Officer 2 → W-2
  return r; // GS12 / CONTRACTOR / etc. — civilian, leave unchanged
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) });

  const tenants = await db
    .selectFrom("tenant")
    .leftJoin("tenant_family_member as f", "f.tenant_id", "tenant.id")
    .select((eb) => [
      "tenant.id as id", "tenant.name", "tenant.rank", "tenant.dependent_status", "tenant.notes",
      eb.fn.count("f.id").as("fam"),
    ])
    .groupBy(["tenant.id", "tenant.name", "tenant.rank", "tenant.dependent_status", "tenant.notes"])
    .execute();

  const rankChanges: { id: number; name: string; old: string; nw: string }[] = [];
  const depChanges: { id: number; name: string; nw: string; why: string }[] = [];
  for (const t of tenants) {
    const nr = normRank(t.rank);
    if (nr !== t.rank && nr) rankChanges.push({ id: t.id, name: t.name, old: t.rank ?? "(null)", nw: nr });
    if (!t.dependent_status) {
      const notes = t.notes ?? "";
      let nw: string | null = null, why = "";
      if (Number(t.fam) > 0) { nw = "with"; why = "가족 구성원 있음"; }
      else if (/부부|신혼/.test(notes)) { nw = "with"; why = "메모: 부부/신혼"; }
      else if (/싱글|single/i.test(notes)) { nw = "without"; why = "메모: 싱글"; }
      if (nw) depChanges.push({ id: t.id, name: t.name, nw, why });
    }
  }

  console.log(`\n=== Rank normalization (${rankChanges.length}) ===`);
  const byMap: Record<string, number> = {};
  for (const c of rankChanges) byMap[`${c.old}→${c.nw}`] = (byMap[`${c.old}→${c.nw}`] || 0) + 1;
  for (const [k, n] of Object.entries(byMap).sort()) console.log(`  ${k.padEnd(14)} ×${n}`);
  console.log(`  (warrant officers WO1/CW2/CW3 now resolve to an OHA group)`);
  console.log(`\n=== dependent_status backfill (${depChanges.length}; only where NULL) ===`);
  const w = depChanges.filter((c) => c.nw === "with").length, wo = depChanges.filter((c) => c.nw === "without").length;
  console.log(`  with: ${w}  ·  without: ${wo}  ·  still NULL after: ${tenants.filter((t) => !t.dependent_status).length - depChanges.length}`);

  if (!WRITE) { console.log("\nDRY RUN — nothing written."); await db.destroy(); return; }
  await db.transaction().execute(async (tx) => {
    for (const c of rankChanges) await tx.updateTable("tenant").set({ rank: c.nw }).where("id", "=", c.id).execute();
    for (const c of depChanges) await tx.updateTable("tenant").set({ dependent_status: c.nw }).where("id", "=", c.id).execute();
  });
  console.log(`\n✓ Applied: ${rankChanges.length} rank normalizations, ${depChanges.length} dependent_status backfills.`);
  await db.destroy();
}
main().catch((e) => { console.error("Failed:", e); process.exit(1); });
