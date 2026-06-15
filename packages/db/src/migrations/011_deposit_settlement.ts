import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * WP D3 — 보증금 정산(Deposit settlement, 수동). 퇴거 시 차감 항목을 직원이
 * 수동 입력·확정한다. deductions 는 JSON 문자열([{amount, reason}])로 저장.
 * 확정은 admin/accounting 권한, 환급은 원장 출금으로 연결된다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("deposit_settlement")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("lease_id", "integer", (col) =>
      col.notNull().references("lease.id").onDelete("cascade").unique(),
    )
    .addColumn("deposit_amount", "decimal", (col) => col.notNull())
    .addColumn("deductions", "text") // JSON [{amount, reason}]
    .addColumn("deduction_total", "decimal", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("refund_amount", "decimal", (col) => col.notNull().defaultTo(0))
    .addColumn("refund_method", "varchar")
    .addColumn("refunded_date", "date")
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("draft"))
    .addColumn("confirmed_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("deposit_settlement").ifExists().execute();
}
