import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * task_link — 할 일 카드에 매물/임대인/세입자를 다중 연결(없음/단일/복수).
 * source 추천이 만든 `task.ref_entity_*`(원본 출처 링크)와는 별개로, 운영자가
 * 자유롭게 붙이는 연결을 담는다. entity_type ∈ property|landlord|tenant.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("task_link")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("task_id", "integer", (col) =>
      col.notNull().references("task.id").onDelete("cascade"),
    )
    .addColumn("entity_type", "varchar", (col) => col.notNull())
    .addColumn("entity_id", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("uq_task_link", ["task_id", "entity_type", "entity_id"])
    .execute();

  await db.schema
    .createIndex("idx_task_link_task")
    .on("task_link")
    .column("task_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("task_link").ifExists().execute();
}
