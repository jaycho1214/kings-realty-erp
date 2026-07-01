import { type Kysely } from "kysely";

/**
 * 매물별 출입 비밀번호. 현관(공동/로비) 비밀번호와 세대(집) 도어락 비밀번호를
 * 평문으로 저장한다(민감 PII 아님 — 열람 편의 우선, UI에서 마스킹만 한다).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("property")
    .addColumn("front_door_password", "varchar")
    .execute();
  await db.schema
    .alterTable("property")
    .addColumn("unit_password", "varchar")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("property")
    .dropColumn("front_door_password")
    .execute();
  await db.schema
    .alterTable("property")
    .dropColumn("unit_password")
    .execute();
}
