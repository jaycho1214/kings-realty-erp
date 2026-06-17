import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * 정기 청구(recurring_charge) + 미납 자동 추론 보강.
 *
 * - recurring_charge: 세입자별 정기 청구 정의(관리비/주차/인터넷 등). amount=null 이면
 *   변동(월마다 금액 입력) — 매월 cron 이 charge_item 을 자동 생성한다. 월세는 기존
 *   lease 기반 경로를 유지(여기 정의에 포함하지 않음).
 * - charge_item 확장:
 *     recurring_charge_id  생성된 청구의 정의 출처(추적/멱등)
 *     paid_by_payment_id   이 청구를 수납한 payment (수납 시 연결, 삭제 시 자동 해제)
 *     amount  nullable 화   변동 정기청구의 "금액 미정" placeholder 표현
 *   상태는 더 이상 수기 입력이 아니라 파생값: paid_by_payment_id 있으면 paid,
 *   금액 없으면 unbilled(미청구), 마감 경과 미납이면 overdue(미납), 그 외 billed(청구됨).
 *   partial(부분납)은 폐기 — 청구는 미납/수납완료 이분.
 * - bill_preset: 정기 청구 빠른 등록용 기본 프리셋 카탈로그(설정에서 관리).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("recurring_charge")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("tenant_id", "integer", (col) =>
      col.notNull().references("tenant.id").onDelete("cascade"),
    )
    .addColumn("label", "varchar", (col) => col.notNull())
    .addColumn("type", "varchar", (col) => col.notNull().defaultTo("custom"))
    .addColumn("amount", "decimal") // null = 변동(월마다 금액 입력)
    .addColumn("currency", "varchar", (col) => col.notNull().defaultTo("KRW"))
    .addColumn("due_day", "integer", (col) => col.notNull().defaultTo(10))
    .addColumn("active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("start_month", "date")
    .addColumn("end_month", "date")
    .addColumn("memo", "text")
    .addColumn("created_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_recurring_charge_tenant")
    .on("recurring_charge")
    .column("tenant_id")
    .execute();
  await db.schema
    .createIndex("idx_recurring_charge_active")
    .on("recurring_charge")
    .column("active")
    .execute();

  await db.schema
    .createTable("bill_preset")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("label", "varchar", (col) => col.notNull())
    .addColumn("type", "varchar", (col) => col.notNull().defaultTo("custom"))
    .addColumn("default_amount", "decimal")
    .addColumn("default_currency", "varchar", (col) =>
      col.notNull().defaultTo("KRW"),
    )
    .addColumn("default_due_day", "integer", (col) =>
      col.notNull().defaultTo(10),
    )
    .addColumn("is_variable", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // charge_item 확장
  await db.schema
    .alterTable("charge_item")
    .addColumn("recurring_charge_id", "integer", (col) =>
      col.references("recurring_charge.id").onDelete("set null"),
    )
    .addColumn("paid_by_payment_id", "integer", (col) =>
      col.references("payment.id").onDelete("set null"),
    )
    .execute();

  // 변동 정기청구의 금액 미정 placeholder 를 위해 amount 를 nullable 로
  await db.schema
    .alterTable("charge_item")
    .alterColumn("amount", (col) => col.dropNotNull())
    .execute();

  // 정기 정의별 월 1건(멱등 생성). NULL 은 서로 distinct 로 취급되어 월세/일회성 무관.
  await db.schema
    .createIndex("uq_charge_item_recurring_month")
    .on("charge_item")
    .columns(["recurring_charge_id", "billing_month"])
    .unique()
    .execute();
  await db.schema
    .createIndex("idx_charge_item_paid_by")
    .on("charge_item")
    .column("paid_by_payment_id")
    .execute();

  // partial(부분납) 폐기 → billed 로 정리
  await sql`update charge_item set status = 'billed' where status = 'partial'`.execute(
    db,
  );

  // 기본 프리셋 시드
  await sql`
    insert into bill_preset (label, type, default_amount, default_currency, default_due_day, is_variable, sort_order)
    values
      ('관리비', 'management', null, 'KRW', 10, false, 1),
      ('주차',   'parking',    null, 'KRW', 10, false, 2),
      ('인터넷', 'utility',    null, 'KRW', 10, false, 3),
      ('공과금', 'utility',    null, 'KRW', 25, true,  4)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("uq_charge_item_recurring_month")
    .ifExists()
    .execute();
  await db.schema.dropIndex("idx_charge_item_paid_by").ifExists().execute();
  await db.schema
    .alterTable("charge_item")
    .dropColumn("recurring_charge_id")
    .dropColumn("paid_by_payment_id")
    .execute();
  // amount 를 다시 not null 로(미정 placeholder 가 남아있으면 먼저 정리 필요)
  await db.schema
    .alterTable("charge_item")
    .alterColumn("amount", (col) => col.setNotNull())
    .execute();
  await db.schema.dropTable("bill_preset").ifExists().execute();
  await db.schema.dropTable("recurring_charge").ifExists().execute();
}
