import type { Kysely } from "kysely";

/**
 * WP B1 — 임차인 라이프사이클 (자동 보관 + 6개월 후 소프트 삭제).
 *
 * - archived_at: 퇴거(inactive) + 계약 종료일 경과 시 자동 보관된 시각.
 * - deleted_at: 보관 6개월 경과 시 소프트 삭제된 시각(휴지통). 영구삭제는 admin 수동.
 *
 * status(active/inactive) 는 그대로 두고 라이프사이클은 타임스탬프로 표현한다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenant")
    .addColumn("archived_at", "timestamptz")
    .addColumn("deleted_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("idx_tenant_archived_at")
    .on("tenant")
    .column("archived_at")
    .execute();
  await db.schema
    .createIndex("idx_tenant_deleted_at")
    .on("tenant")
    .column("deleted_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenant")
    .dropColumn("archived_at")
    .dropColumn("deleted_at")
    .execute();
}
