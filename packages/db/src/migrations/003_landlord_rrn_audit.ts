import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * WP A2 — 임대인 추가 필드 + 주민등록번호(RRN) + 감사 로그.
 *
 * - landlord: address, business_type(개인/사업자), account_holder(예금주),
 *   rrn_encrypted(AES-256-GCM ciphertext, base64). 평문은 절대 저장하지 않는다.
 * - audit_log: 민감 액션(RRN 열람, 정산 확정 등) 기록용 범용 테이블.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("landlord")
    .addColumn("address", "varchar")
    .addColumn("business_type", "varchar") // 'individual' | 'business'
    .addColumn("account_holder", "varchar")
    .addColumn("rrn_encrypted", "text")
    .execute();

  await db.schema
    .createTable("audit_log")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("actor_id", "integer", (col) => col.references("user.id"))
    .addColumn("action", "varchar", (col) => col.notNull())
    .addColumn("entity_type", "varchar", (col) => col.notNull())
    .addColumn("entity_id", "integer")
    .addColumn("detail", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_audit_log_entity")
    .on("audit_log")
    .columns(["entity_type", "entity_id"])
    .execute();
  await db.schema
    .createIndex("idx_audit_log_actor")
    .on("audit_log")
    .column("actor_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("audit_log").ifExists().execute();
  await db.schema
    .alterTable("landlord")
    .dropColumn("address")
    .dropColumn("business_type")
    .dropColumn("account_holder")
    .dropColumn("rrn_encrypted")
    .execute();
}
