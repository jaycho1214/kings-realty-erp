import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * AS 담당자/외부 업체 구조화.
 *  - service_request_assignee: 담당자(우리 직원) N:M (calendar_event_attendee 패턴)
 *  - service_vendor: 외부 업체(이름+전화) 누적 목록 — 폼 자동완성/전화 자동입력
 *  - service_request.vendor_id: 외부 처리 업체 FK
 *  - service_request.landlord_self: 임대인 직접 처리 여부
 *
 * 기존 자유입력 assignee 컬럼은 보존(legacy 표시) — 더 이상 폼에서 쓰지 않는다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("service_vendor")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar", (col) => col.notNull().unique())
    .addColumn("phone", "varchar")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("service_request_assignee")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("service_request_id", "integer", (col) =>
      col.notNull().references("service_request.id").onDelete("cascade"),
    )
    .addColumn("user_id", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("uq_service_request_assignee", [
      "service_request_id",
      "user_id",
    ])
    .execute();

  await db.schema
    .alterTable("service_request")
    .addColumn("vendor_id", "integer", (col) =>
      col.references("service_vendor.id"),
    )
    .addColumn("landlord_self", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();

  await db.schema
    .createIndex("idx_service_request_assignee_sr")
    .on("service_request_assignee")
    .column("service_request_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("service_request")
    .dropColumn("vendor_id")
    .dropColumn("landlord_self")
    .execute();
  await db.schema.dropTable("service_request_assignee").ifExists().execute();
  await db.schema.dropTable("service_vendor").ifExists().execute();
}
