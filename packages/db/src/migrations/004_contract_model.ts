import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * WP A3 — 매물 상태/퇴거일 + 계약(Contract) 모델 정합.
 *
 * - property.moveout_date: status=move_out 시 기록.
 * - lease: 임대인측 보증금/월세, realty_fee(+통화), auto_renew. 기존
 *   deposit_krw/monthly_rent_krw 는 임차인측으로 의미 고정.
 * - realty_fee_default: 시딩 기본값(USD 300 / KRW 500,000). 계약 생성 시 복사.
 *
 * 상태 enum 은 varchar 이므로 추가 값(move_out / draft / renewed)은 마이그레이션
 * 없이 UI 에서 도입한다(기존 데이터 보존, 값 변형 없음).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("property")
    .addColumn("moveout_date", "date")
    .execute();

  await db.schema
    .alterTable("lease")
    .addColumn("landlord_deposit_krw", "decimal")
    .addColumn("landlord_rent_krw", "decimal")
    .addColumn("realty_fee", "decimal")
    .addColumn("realty_fee_currency", "varchar")
    .addColumn("auto_renew", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  await db.schema
    .createTable("realty_fee_default")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("currency", "varchar", (col) => col.notNull().unique())
    .addColumn("amount", "decimal", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  const typedDb = db as Kysely<Record<string, Record<string, unknown>>>;
  await typedDb
    .insertInto("realty_fee_default")
    .values([
      { currency: "USD", amount: 300 },
      { currency: "KRW", amount: 500000 },
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("realty_fee_default").ifExists().execute();
  await db.schema
    .alterTable("lease")
    .dropColumn("landlord_deposit_krw")
    .dropColumn("landlord_rent_krw")
    .dropColumn("realty_fee")
    .dropColumn("realty_fee_currency")
    .dropColumn("auto_renew")
    .execute();
  await db.schema.alterTable("property").dropColumn("moveout_date").execute();
}
