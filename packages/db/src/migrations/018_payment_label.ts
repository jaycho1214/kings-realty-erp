import type { Kysely } from "kysely";

/**
 * payment.label — the specific line-item name shown in 납부내역 (전기요금, 수도요금,
 * 인터넷, REALTY FEE …). payment_type stays the coarse category (utility/rent/service/
 * deposit); label carries the precise item so a bundle's lines don't all read "공과금".
 * Populated by /payments/new (the collector line's label) and backfilled from the
 * legacy import's "항목:" notes.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("payment").addColumn("label", "varchar").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("payment").dropColumn("label").execute();
}
