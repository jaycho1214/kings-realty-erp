import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * WP E2 — 알림(notification) + 계약 만료 알림.
 *
 * target_user_id NULL = 전 직원 공용. dedup_key 로 동일 알림 재생성 방지(멱등).
 * 계약 만료 D-60/30/7 알림은 일일 크론이 생성한다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("notification")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("type", "varchar", (col) => col.notNull())
    .addColumn("target_user_id", "integer", (col) => col.references("user.id"))
    .addColumn("ref_entity_type", "varchar")
    .addColumn("ref_entity_id", "integer")
    .addColumn("title", "varchar", (col) => col.notNull())
    .addColumn("message", "text")
    .addColumn("due_date", "date")
    .addColumn("dedup_key", "varchar", (col) => col.unique())
    .addColumn("is_read", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_notification_unread")
    .on("notification")
    .columns(["is_read", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("notification").ifExists().execute();
}
