import { sql, type Kysely } from "kysely";

/**
 * 선불금을 독립 결제 유형(`prepayment`)으로 정규화한다.
 *
 * 그동안 선불금은 여러 곳에 흩어져 있었다: utility_type 기본값, charge_item 의
 * `prepayment`(세입자 청구 모델), 그리고 레거시 임포트에서 "prepaid rent"로
 * 월세(rent)에 합쳐진 결제. 정작 결제 폼의 유형 드롭다운이 읽는 bill_preset
 * 카탈로그에는 선불금이 없어서, /payments/new 의 "+ 새 유형"으로 추가하면
 * type=label("선불금")인 임시 행이 생기고, 결제는 KNOWN_PAYMENT_TYPES 정규화로
 * service 로 저장됐다.
 *
 * 이 마이그레이션은 선불금을 charge_item 과 동일한 `prepayment` 키로 통일한다:
 *  - bill_preset 의 임시 행 type 을 prepayment 로 교정(없으면 기본 프리셋 시드)
 *  - 임시 경로로 저장된 결제(payment_type=service, label=선불금)를 prepayment 로 교정
 *
 * 레거시 prepaid-rent(payment_type=rent, label=선불금)는 의도적으로 월세로 분류된
 * 기록이므로 건드리지 않는다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // 임시 bill_preset 행 교정(ad-hoc 추가 시 type 이 label 과 같았다)
  await sql`update bill_preset set type = 'prepayment' where type = '선불금'`.execute(
    db,
  );

  // 기본 프리셋 시드 — 교정 후에도 없으면(신규 DB 포함) 빠른 등록용으로 추가
  await sql`
    insert into bill_preset (label, type, default_amount, default_currency, default_due_day, is_variable, sort_order)
    select '선불금', 'prepayment', null, 'KRW', 10, false,
           coalesce((select max(sort_order) from bill_preset), 0) + 1
    where not exists (select 1 from bill_preset where type = 'prepayment')
  `.execute(db);

  // 임시 경로로 저장된 결제 교정(레거시 rent 분류는 보존)
  await sql`update payment set payment_type = 'prepayment' where payment_type = 'service' and label = '선불금'`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`update payment set payment_type = 'service' where payment_type = 'prepayment' and label = '선불금'`.execute(
    db,
  );
  await sql`update bill_preset set type = '선불금' where type = 'prepayment'`.execute(
    db,
  );
}
