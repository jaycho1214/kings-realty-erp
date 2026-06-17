/**
 * Backfill payment.label from the legacy import's "항목: X" notes, so utility/service
 * payments show their specific item (전기요금 / 수도요금 / 인터넷 / REALTY FEE) in 납부내역
 * instead of the coarse "공과금". Sets label only for utility/service (rent/deposit read
 * fine from their type), and strips the now-redundant "항목: …" segment out of notes.
 *
 * Usage:  tsx src/backfill-payment-label.ts        # dry run
 *         tsx src/backfill-payment-label.ts --write  # apply
 */
import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types";

const WRITE = process.argv.includes("--write");

function stripItemSegment(notes: string): string | null {
  // remove "항목: X" wherever it sits among " | "-joined parts
  const cleaned = notes
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s && !/^항목:/.test(s))
    .join(" | ");
  return cleaned || null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: url }),
    }),
  });

  const rows = await db
    .selectFrom("payment")
    .select(["id", "payment_type", "notes", "label"])
    .where("notes", "like", "항목:%")
    .execute();
  const updates: { id: number; label: string | null; notes: string | null }[] =
    [];
  for (const r of rows) {
    if (r.label) continue; // already set (e.g. app-created)
    const m = /항목:\s*([^|]+)/.exec(r.notes || "");
    const item = m?.[1]?.trim() || null;
    const label =
      item && (r.payment_type === "utility" || r.payment_type === "service")
        ? item
        : null;
    const notes = stripItemSegment(r.notes || "");
    updates.push({ id: r.id, label, notes });
  }

  const byLabel: Record<string, number> = {};
  for (const u of updates)
    if (u.label) byLabel[u.label] = (byLabel[u.label] || 0) + 1;
  console.log(
    `Payments touched: ${updates.length} (notes decluttered); labels set: ${updates.filter((u) => u.label).length}`,
  );
  console.log("Top labels:");
  for (const [k, n] of Object.entries(byLabel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12))
    console.log(`  ${k.padEnd(22)} ×${n}`);

  if (!WRITE) {
    console.log("\nDRY RUN — nothing written.");
    await db.destroy();
    return;
  }
  await db.transaction().execute(async (tx) => {
    for (const u of updates)
      await tx
        .updateTable("payment")
        .set({ label: u.label, notes: u.notes })
        .where("id", "=", u.id)
        .execute();
  });
  console.log(
    `\n✓ Applied label + notes cleanup to ${updates.length} payments.`,
  );
  await db.destroy();
}
main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
