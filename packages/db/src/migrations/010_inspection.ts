import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * WP D2 — 입주/퇴거 점검(Inspection). Housing Office + 직원(+임차인) 동행 점검 기록.
 * participants/checklist/signature 는 JSON 문자열(text)로 저장. 사진은 document
 * (entity_type='inspection') 로 첨부한다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("inspection")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("lease_id", "integer", (col) =>
      col.notNull().references("lease.id").onDelete("cascade"),
    )
    .addColumn("property_id", "integer", (col) =>
      col.notNull().references("property.id"),
    )
    .addColumn("type", "varchar", (col) => col.notNull()) // move_in | move_out
    .addColumn("inspected_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("participants", "text") // JSON
    .addColumn("checklist", "text") // JSON
    .addColumn("signature", "text") // JSON
    .addColumn("summary", "text")
    .addColumn("created_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_inspection_lease")
    .on("inspection")
    .column("lease_id")
    .execute();
  await db.schema
    .createIndex("idx_inspection_property")
    .on("inspection")
    .column("property_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("inspection").ifExists().execute();
}
