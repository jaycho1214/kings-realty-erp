import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * WP C1 — 원장(Ledger) backbone + 환전업체(Exchange vendor).
 *
 * - exchange_vendor: 권종별 환전 거래처 마스터.
 * - payment: 입금 시 권종/환전업체 기록(receipt 추적).
 * - ledger_entry: 임차인별 원장으로 확장 — direction(receipt/disbursement),
 *   tenant/lease, 통화/권종/환율/환전업체, related charge/payable, memo.
 *   기존 landlord 정산 사용(entry_type=expense)과 호환되도록 모두 nullable 추가.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("exchange_vendor")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("denominations", "text") // comma-separated USD denoms, e.g. "100,50,20"
    .addColumn("default_rate", "decimal")
    .addColumn("phone", "varchar")
    .addColumn("memo", "text")
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .alterTable("payment")
    .addColumn("exchange_vendor_id", "integer", (col) =>
      col.references("exchange_vendor.id"),
    )
    .addColumn("denomination", "integer")
    .execute();

  await db.schema
    .alterTable("ledger_entry")
    .addColumn("tenant_id", "integer", (col) => col.references("tenant.id"))
    .addColumn("lease_id", "integer", (col) => col.references("lease.id"))
    .addColumn("direction", "varchar") // 'receipt' | 'disbursement'
    .addColumn("currency", "varchar") // 'USD' | 'KRW'
    .addColumn("denomination", "integer")
    .addColumn("exchange_rate", "decimal")
    .addColumn("exchange_vendor_id", "integer", (col) =>
      col.references("exchange_vendor.id"),
    )
    .addColumn("memo", "text")
    .execute();

  await db.schema
    .createIndex("idx_ledger_entry_tenant")
    .on("ledger_entry")
    .column("tenant_id")
    .execute();

  const typedDb = db as Kysely<Record<string, Record<string, unknown>>>;
  await typedDb
    .insertInto("exchange_vendor")
    .values([
      { name: "명동 환전소", denominations: "100,50", default_rate: 1380 },
      {
        name: "이태원 환전소",
        denominations: "100,50,20,10",
        default_rate: 1375,
      },
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("ledger_entry")
    .dropColumn("tenant_id")
    .dropColumn("lease_id")
    .dropColumn("direction")
    .dropColumn("currency")
    .dropColumn("denomination")
    .dropColumn("exchange_rate")
    .dropColumn("exchange_vendor_id")
    .dropColumn("memo")
    .execute();
  await db.schema
    .alterTable("payment")
    .dropColumn("exchange_vendor_id")
    .dropColumn("denomination")
    .execute();
  await db.schema.dropTable("exchange_vendor").ifExists().execute();
}
