import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * 할 일(Task) 칸반 보드.
 *  - task: 공유 보드 카드. status(workflow) 와 planned_date(계획 버킷)를 분리,
 *    due_date 는 하드 마감일(배지 전용). source=manual|suggestion, suggestion_key
 *    로 추천 dedup, ref_entity_* 로 원본(lease/tenant/service_request/charge) 딥링크.
 *  - task_assignee: 담당자 N:M (service_request_assignee 패턴).
 *  - task_suggestion_dismissal: 추천 무시/스누즈(팀 전체 공유), dedup_key 유니크.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("task")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("title", "varchar", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("todo"))
    .addColumn("planned_date", "date")
    .addColumn("due_date", "date")
    .addColumn("sort_order", "double precision", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("source", "varchar", (col) => col.notNull().defaultTo("manual"))
    .addColumn("suggestion_key", "varchar")
    .addColumn("ref_entity_type", "varchar")
    .addColumn("ref_entity_id", "integer")
    .addColumn("created_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("task_assignee")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("task_id", "integer", (col) =>
      col.notNull().references("task.id").onDelete("cascade"),
    )
    .addColumn("user_id", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("uq_task_assignee", ["task_id", "user_id"])
    .execute();

  await db.schema
    .createTable("task_suggestion_dismissal")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("dedup_key", "varchar", (col) => col.notNull().unique())
    .addColumn("dismissed_until", "date")
    .addColumn("dismissed_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_task_status")
    .on("task")
    .column("status")
    .execute();
  await db.schema
    .createIndex("idx_task_planned_date")
    .on("task")
    .column("planned_date")
    .execute();
  await db.schema
    .createIndex("idx_task_suggestion_key")
    .on("task")
    .column("suggestion_key")
    .where("suggestion_key", "is not", null)
    .execute();
  await db.schema
    .createIndex("idx_task_assignee_task")
    .on("task_assignee")
    .column("task_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("task_suggestion_dismissal").ifExists().execute();
  await db.schema.dropTable("task_assignee").ifExists().execute();
  await db.schema.dropTable("task").ifExists().execute();
}
