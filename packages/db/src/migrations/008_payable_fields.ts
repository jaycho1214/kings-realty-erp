import type { Kysely } from "kysely";

/**
 * WP C3 — 대납(Payable) 보강. utility_bill 을 대납 항목으로 확장:
 *  - bearer: 비용 부담 주체 (tenant 임차인 / landlord 임대인 / office 중개)
 *  - payee:  청구 기관/수취인
 *  - status: 납부대기(pending) / 납부완료(paid) / 보류(hold)
 *  - paid_date: 실제 납부일
 *
 * 기존 paid_to_company(bool)/paid_to_company_date 와 공존하며, 납부 처리 시 함께 갱신한다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("utility_bill")
    .addColumn("bearer", "varchar", (col) => col.notNull().defaultTo("tenant"))
    .addColumn("payee", "varchar")
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("pending"))
    .addColumn("paid_date", "date")
    .execute();

  await db.schema
    .createIndex("idx_utility_bill_status")
    .on("utility_bill")
    .column("status")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("utility_bill")
    .dropColumn("bearer")
    .dropColumn("payee")
    .dropColumn("status")
    .dropColumn("paid_date")
    .execute();
}
