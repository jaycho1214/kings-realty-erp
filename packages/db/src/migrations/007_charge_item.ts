import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * WP C2 — 청구(charge_item). 결정 #5에 따라 주로 월세 등 정기 항목에 사용:
 * 월 자동생성 + 미납/연체 추적. 공과금·일회성은 원장+번들 수금으로 처리한다.
 *
 * status: unbilled(미청구) / billed(청구됨) / paid(수납완료) / partial(부분납) / overdue(미납)
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("charge_item")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenant.id").onDelete("cascade"),
    )
    .addColumn("lease_id", "integer", (col) => col.references("lease.id"))
    .addColumn("type", "varchar", (col) => col.notNull())
    .addColumn("recurrence", "varchar", (col) =>
      col.notNull().defaultTo("monthly"),
    ) // one_time | monthly
    .addColumn("billing_month", "date")
    .addColumn("amount", "decimal", (col) => col.notNull())
    .addColumn("currency", "varchar", (col) => col.notNull().defaultTo("KRW"))
    .addColumn("due_date", "date")
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("billed"))
    .addColumn("memo", "text")
    .addColumn("created_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_charge_item_tenant")
    .on("charge_item")
    .column("tenant_id")
    .execute();
  await db.schema
    .createIndex("idx_charge_item_status")
    .on("charge_item")
    .column("status")
    .execute();
  // One rent charge per lease per billing month (idempotent monthly generation).
  // Postgres treats NULLs as distinct, so one_time charges (null lease/month)
  // are unaffected.
  await db.schema
    .createIndex("uq_charge_item_rent_month")
    .on("charge_item")
    .columns(["lease_id", "type", "billing_month"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("charge_item").ifExists().execute();
}
