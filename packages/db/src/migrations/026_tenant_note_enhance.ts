import type { Kysely } from "kysely";

/**
 * 세입자 메모 고도화: 답글 스레드(parent_id), 해결 상태(resolved_at/by),
 * 수정 시각(updated_at). content 는 이제 정화된 HTML(rich text)을 저장한다.
 * 기존 평문 메모는 그대로 텍스트로 렌더된다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenant_note")
    .addColumn("parent_id", "integer", (col) =>
      col.references("tenant_note.id").onDelete("cascade"),
    )
    .addColumn("resolved_at", "timestamptz")
    .addColumn("resolved_by", "integer", (col) => col.references("user.id"))
    .addColumn("updated_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("idx_tenant_note_tenant")
    .on("tenant_note")
    .columns(["tenant_id", "parent_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_tenant_note_tenant").ifExists().execute();
  await db.schema
    .alterTable("tenant_note")
    .dropColumn("parent_id")
    .dropColumn("resolved_at")
    .dropColumn("resolved_by")
    .dropColumn("updated_at")
    .execute();
}
