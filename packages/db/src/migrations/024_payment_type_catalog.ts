import { sql, type Kysely } from "kysely";

/**
 * bill_preset 를 결제/청구 "유형" 카탈로그의 단일 진실 공급원으로 만든다.
 *  - variant(뱃지 색) + is_builtin(코드가 직접 쓰는 구조적 키 보호) 컬럼 추가
 *  - 유형당 1행 불변식을 위해 중복 type 정리(인터넷 utility→internet) 후 unique 인덱스
 *  - 코드가 직접 기록하는 키를 builtin 으로 시드:
 *    결제측 rent/deposit/service, 청구/정기측 realty_fee/custom
 * utility_type / utility_bill 은 건드리지 않는다(별개의 대납 기능).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("bill_preset")
    .addColumn("variant", "varchar", (c) => c.notNull().defaultTo("outline"))
    .addColumn("is_builtin", "boolean", (c) => c.notNull().defaultTo(false))
    .execute();

  // 중복 type 해소: 인터넷(현재 type=utility) 을 자체 type 으로 분리
  await sql`update bill_preset set type = 'internet' where type = 'utility' and label = '인터넷'`.execute(
    db,
  );

  // 유형당 1행 불변식. 다른 사전 중복이 있으면 이 단계에서 실패한다 —
  // 그 경우: select type,count(*) from bill_preset group by type having count(*)>1; 로 먼저 정리.
  await db.schema
    .createIndex("uq_bill_preset_type")
    .on("bill_preset")
    .column("type")
    .unique()
    .execute();

  // 코드가 직접 기록하는 구조적 유형을 builtin 으로 시드(이미 있으면 무시)
  await sql`
    insert into bill_preset (label, type, default_amount, default_currency, default_due_day, is_variable, sort_order, variant, is_builtin)
    select v.label, v.type, null, 'KRW', 10, false,
           coalesce((select max(sort_order) from bill_preset), 0) + v.ord, 'outline', true
    from (values
      ('월세','rent',1), ('보증금','deposit',2), ('기타','service',3),
      ('중개수수료','realty_fee',4), ('기타','custom',5)
    ) as v(label, type, ord)
    where not exists (select 1 from bill_preset b where b.type = v.type)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from bill_preset where is_builtin = true and type in ('rent','deposit','service','realty_fee','custom')`.execute(
    db,
  );
  await db.schema.dropIndex("uq_bill_preset_type").ifExists().execute();
  await sql`update bill_preset set type = 'utility' where type = 'internet' and label = '인터넷'`.execute(
    db,
  );
  await db.schema
    .alterTable("bill_preset")
    .dropColumn("is_builtin")
    .dropColumn("variant")
    .execute();
}
