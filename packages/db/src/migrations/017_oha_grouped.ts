import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * OHA 기준표를 계급 그룹 단위(KRW)로 재구성한다.
 *
 * 012 의 예시 데이터(계급별·USD)를 실제 OHA Rates 시트(2025-01-16 시행, KRW)에
 * 맞춰 그룹 코드(E1-E4 / E5-O4 / W5-O5 / O6-O10 + UTILITY/MIHA)로 교체한다.
 * `rank` 컬럼을 `code` 로 rename 하고, 그룹×부양상태 당 1행만 유지한다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const typedDb = db as Kysely<Record<string, Record<string, unknown>>>;

  // 1) Drop placeholder rows.
  await typedDb.deleteFrom("oha_rate").execute();

  // 2) rank -> code, recreate lookup index, default currency KRW.
  await db.schema.alterTable("oha_rate").renameColumn("rank", "code").execute();
  await db.schema.dropIndex("idx_oha_rate_lookup").ifExists().execute();
  await db.schema
    .createIndex("idx_oha_rate_lookup")
    .on("oha_rate")
    .columns(["code", "dependent_status"])
    .execute();
  await sql`ALTER TABLE oha_rate ALTER COLUMN currency SET DEFAULT 'KRW'`.execute(
    db,
  );

  // 3) Seed real grouped rates (KRW), effective 2025-01-16.
  const amounts: Record<string, { without: number; with: number }> = {
    "E1-E4": { without: 2909999, with: 3233333 },
    "E5-O4": { without: 3172788, with: 3525320 },
    "W5-O5": { without: 3600000, with: 4000000 },
    "O6-O10": { without: 4298400, with: 4776000 },
    UTILITY: { without: 780367, with: 1040490 },
    MIHA: { without: 334776, with: 334776 },
  };
  const rows: Record<string, unknown>[] = [];
  for (const [code, amt] of Object.entries(amounts)) {
    for (const dep of ["without", "with"] as const) {
      rows.push({
        code,
        dependent_status: dep,
        region: "Default",
        amount: String(amt[dep]),
        currency: "KRW",
        effective_from: "2025-01-16",
      });
    }
  }
  await typedDb.insertInto("oha_rate").values(rows).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const typedDb = db as Kysely<Record<string, Record<string, unknown>>>;
  await typedDb.deleteFrom("oha_rate").execute();
  await db.schema.dropIndex("idx_oha_rate_lookup").ifExists().execute();
  await db.schema.alterTable("oha_rate").renameColumn("code", "rank").execute();
  await db.schema
    .createIndex("idx_oha_rate_lookup")
    .on("oha_rate")
    .columns(["rank", "dependent_status"])
    .execute();
  await sql`ALTER TABLE oha_rate ALTER COLUMN currency SET DEFAULT 'USD'`.execute(
    db,
  );
}
