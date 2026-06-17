import type { Kysely } from "kysely";

/**
 * 매물 주소에 지번 주소(address_jibeon)를 추가한다.
 * 기존 `address` 는 도로명 주소(ko_common + ko_doro), 신규 컬럼은 지번 주소(ko_common + ko_jibeon).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("property")
    .addColumn("address_jibeon", "varchar")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("property").dropColumn("address_jibeon").execute();
}
