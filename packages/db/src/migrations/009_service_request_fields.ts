import type { Kysely } from "kysely";

/**
 * WP D1 — AS(유지보수) 보강.
 *  - bearer: 비용 부담 주체 (landlord 임대인 / tenant 임차인 / office 중개)
 *  - location, assignee, scheduled_date, completed_date
 *  - estimated_cost / actual_cost (기존 cost_krw 는 호환 유지)
 *  - postpone_reason (수리연기 사유)
 *
 * 상태 6단계(접수/수리대기중/수리중/수리완료/수리연기/개인처리결정)는 varchar 라
 * 마이그레이션 없이 UI 에서 도입한다(기존 값 보존).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("service_request")
    .addColumn("bearer", "varchar")
    .addColumn("location", "varchar")
    .addColumn("assignee", "varchar")
    .addColumn("scheduled_date", "date")
    .addColumn("completed_date", "date")
    .addColumn("estimated_cost", "decimal")
    .addColumn("actual_cost", "decimal")
    .addColumn("postpone_reason", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("service_request")
    .dropColumn("bearer")
    .dropColumn("location")
    .dropColumn("assignee")
    .dropColumn("scheduled_date")
    .dropColumn("completed_date")
    .dropColumn("estimated_cost")
    .dropColumn("actual_cost")
    .dropColumn("postpone_reason")
    .execute();
}
