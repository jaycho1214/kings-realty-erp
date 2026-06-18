import type { Kysely } from "kysely";

/**
 * 공동 임대인(가족)의 주민등록번호를 저장하기 위한 컬럼. 대표 임대인의
 * landlord.rrn_encrypted 와 동일하게 암호화하여 보관한다(평문 저장 금지).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("landlord_family_member")
    .addColumn("rrn_encrypted", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("landlord_family_member")
    .dropColumn("rrn_encrypted")
    .execute();
}
