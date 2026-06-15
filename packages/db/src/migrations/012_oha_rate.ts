import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * WP E1 — OHA 기준표 + 임차인 부양가족/군 ID.
 *
 * oha_rate: 계급·부양가족·지역별 월 한도(이력 관리: effective_from~effective_to).
 * tenant: dependent_status(with/without), dependent_count, military_id.
 *
 * 주의: 시딩 금액은 **예시값**이다. 실제 OHA 금액표를 받으면 마스터 UI 에서 수정한다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("oha_rate")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("rank", "varchar", (col) => col.notNull())
    .addColumn("dependent_status", "varchar", (col) => col.notNull()) // with | without
    .addColumn("region", "varchar", (col) => col.notNull().defaultTo("Default"))
    .addColumn("amount", "decimal", (col) => col.notNull())
    .addColumn("currency", "varchar", (col) => col.notNull().defaultTo("USD"))
    .addColumn("effective_from", "date", (col) => col.notNull())
    .addColumn("effective_to", "date")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_oha_rate_lookup")
    .on("oha_rate")
    .columns(["rank", "dependent_status"])
    .execute();

  await db.schema
    .alterTable("tenant")
    .addColumn("dependent_status", "varchar")
    .addColumn("dependent_count", "integer")
    .addColumn("military_id", "varchar")
    .execute();

  // Seed example rates (placeholder amounts — edit via the master UI).
  const ranks = [
    "E-1",
    "E-2",
    "E-3",
    "E-4",
    "E-5",
    "E-6",
    "E-7",
    "E-8",
    "E-9",
    "O-1",
    "O-2",
    "O-3",
    "O-4",
    "O-5",
    "O-6",
    "W-1",
    "W-2",
    "W-3",
  ];
  const rows: Record<string, unknown>[] = [];
  ranks.forEach((rank, i) => {
    const base = 1500 + i * 120;
    for (const dep of ["with", "without"] as const) {
      rows.push({
        rank,
        dependent_status: dep,
        region: "Default",
        amount: dep === "with" ? base + 250 : base,
        currency: "USD",
        effective_from: "2026-01-01",
      });
    }
  });

  const typedDb = db as Kysely<Record<string, Record<string, unknown>>>;
  await typedDb.insertInto("oha_rate").values(rows).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenant")
    .dropColumn("dependent_status")
    .dropColumn("dependent_count")
    .dropColumn("military_id")
    .execute();
  await db.schema.dropTable("oha_rate").ifExists().execute();
}
