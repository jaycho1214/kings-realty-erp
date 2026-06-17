import type { Kysely } from "kysely";

/**
 * property_equipment → appliance 레지스트리.
 *
 * 매물별 "장비(paid_by + 월비용)" 테이블을 비품(appliance) 레지스트리로 승격한다:
 * 소유(집주인/킹스/세입자), 브랜드/모델, A/S 연락처, 상태. 월 비용/납부자는
 * recurring_charge 가 담당하므로 paid_by/monthly_cost_krw 는 제거한다. 사진은
 * document(entity_type='appliance'), A/S 는 service_request.appliance_id 로 연결.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // 1) Rename the (empty) table and its index.
  await db.schema
    .alterTable("property_equipment")
    .renameTo("appliance")
    .execute();
  await db.schema
    .dropIndex("idx_property_equipment_property")
    .ifExists()
    .execute();
  await db.schema
    .createIndex("idx_appliance_property")
    .on("appliance")
    .column("property_id")
    .execute();

  // 2) Drop the monthly-money columns (now recurring_charge's job).
  await db.schema
    .alterTable("appliance")
    .dropColumn("paid_by")
    .dropColumn("monthly_cost_krw")
    .execute();

  // 3) Registry fields.
  await db.schema
    .alterTable("appliance")
    .addColumn("owner", "varchar", (col) => col.notNull().defaultTo("landlord"))
    .addColumn("brand", "varchar")
    .addColumn("model_number", "varchar")
    .addColumn("as_contact", "varchar")
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("normal"))
    .execute();

  // 4) A/S link: a repair request can point at a specific appliance.
  await db.schema
    .alterTable("service_request")
    .addColumn("appliance_id", "integer", (col) =>
      col.references("appliance.id").onDelete("set null"),
    )
    .execute();
  await db.schema
    .createIndex("idx_service_request_appliance")
    .on("service_request")
    .column("appliance_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("idx_service_request_appliance")
    .ifExists()
    .execute();
  await db.schema
    .alterTable("service_request")
    .dropColumn("appliance_id")
    .execute();

  await db.schema
    .alterTable("appliance")
    .dropColumn("owner")
    .dropColumn("brand")
    .dropColumn("model_number")
    .dropColumn("as_contact")
    .dropColumn("status")
    .execute();
  await db.schema
    .alterTable("appliance")
    .addColumn("paid_by", "varchar", (col) => col.notNull().defaultTo("office"))
    .addColumn("monthly_cost_krw", "decimal", (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();

  await db.schema.dropIndex("idx_appliance_property").ifExists().execute();
  await db.schema
    .alterTable("appliance")
    .renameTo("property_equipment")
    .execute();
  await db.schema
    .createIndex("idx_property_equipment_property")
    .on("property_equipment")
    .column("property_id")
    .execute();
}
