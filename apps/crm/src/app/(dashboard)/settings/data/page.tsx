import { getDb, sql } from "@kingsrealty/db";
import { DataSettings } from "./_components/data-settings";

export default async function DataSettingsPage() {
  const db = getDb();

  const [
    utilityTypes,
    baseLocations,
    serviceCategories,
    utilityUsage,
    tenantBaseUsage,
    familyBaseUsage,
    serviceCategoryUsage,
    exchangeVendors,
    ohaRates,
    realtyFeeDefaults,
  ] = await Promise.all([
    db
      .selectFrom("utility_type")
      .select(["id", "name", "is_default", "created_at"])
      .orderBy("is_default", "desc")
      .orderBy("name", "asc")
      .execute(),
    db
      .selectFrom("base_location")
      .select(["id", "name", "name_ko", "sort_order"])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("service_category")
      .select([
        "id",
        "value",
        "label",
        "is_default",
        "sort_order",
        "created_at",
      ])
      .orderBy("sort_order", "asc")
      .orderBy("label", "asc")
      .execute(),
    db
      .selectFrom("utility_bill")
      .select([
        "utility_type_id",
        ({ fn }) => fn.countAll<number>().as("count"),
      ])
      .groupBy("utility_type_id")
      .execute(),
    db
      .selectFrom("tenant")
      .select([
        "base_location_id",
        ({ fn }) => fn.countAll<number>().as("count"),
      ])
      .where("base_location_id", "is not", null)
      .where("deleted_at", "is", null)
      .groupBy("base_location_id")
      .execute(),
    db
      .selectFrom("tenant_family_member")
      .select([
        "base_location_id",
        ({ fn }) => fn.countAll<number>().as("count"),
      ])
      .where("base_location_id", "is not", null)
      .groupBy("base_location_id")
      .execute(),
    db
      .selectFrom("service_request")
      .select(["category", ({ fn }) => fn.countAll<number>().as("count")])
      .groupBy("category")
      .execute(),
    db
      .selectFrom("exchange_vendor")
      .select(["id", "name", "denominations", "default_rate", "phone"])
      .where("is_active", "=", true)
      .orderBy("name", "asc")
      .execute(),
    db
      .selectFrom("oha_rate")
      .select([
        "id",
        "rank",
        "dependent_status",
        "region",
        "amount",
        "currency",
        "effective_from",
        "effective_to",
      ])
      .orderBy(sql`"effective_to" asc nulls first`)
      .orderBy("rank", "asc")
      .orderBy("dependent_status", "asc")
      .execute(),
    db
      .selectFrom("realty_fee_default")
      .select(["currency", "amount"])
      .orderBy("currency", "asc")
      .execute(),
  ]);

  const utilityUsageMap: Record<string, number> = {};
  for (const row of utilityUsage) {
    utilityUsageMap[row.utility_type_id] = Number(row.count);
  }

  const baseLocationUsageMap: Record<string, number> = {};
  for (const row of tenantBaseUsage) {
    if (row.base_location_id) {
      baseLocationUsageMap[row.base_location_id] =
        (baseLocationUsageMap[row.base_location_id] ?? 0) + Number(row.count);
    }
  }
  for (const row of familyBaseUsage) {
    if (row.base_location_id) {
      baseLocationUsageMap[row.base_location_id] =
        (baseLocationUsageMap[row.base_location_id] ?? 0) + Number(row.count);
    }
  }

  const serviceCategoryUsageMap: Record<string, number> = {};
  for (const row of serviceCategoryUsage) {
    serviceCategoryUsageMap[row.category] = Number(row.count);
  }

  return (
    <DataSettings
      utilityTypes={utilityTypes}
      utilityUsageMap={utilityUsageMap}
      baseLocations={baseLocations}
      baseLocationUsageMap={baseLocationUsageMap}
      serviceCategories={serviceCategories}
      serviceCategoryUsageMap={serviceCategoryUsageMap}
      exchangeVendors={exchangeVendors}
      ohaRates={ohaRates}
      realtyFeeDefaults={realtyFeeDefaults}
    />
  );
}
