import { getDb } from "@kingsrealty/db";
import { addDays } from "@/lib/date";

const MILESTONES = [60, 30, 7];

/**
 * Create contract-expiry notifications at D-60 / D-30 / D-7 for active/renewed
 * leases. Idempotent via `dedup_key` (one notification per lease per milestone).
 * Returns the number of notifications created.
 */
export async function generateContractExpiryNotifications(
  today: string,
): Promise<number> {
  const db = getDb();
  let created = 0;

  for (const days of MILESTONES) {
    const target = addDays(today, days);
    const leases = await db
      .selectFrom("lease")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .select(["lease.id as lease_id", "tenant.name as tenant_name"])
      .where("lease.status", "in", ["active", "renewed"])
      .where("tenant.deleted_at", "is", null)
      .where("lease.end_date", "=", new Date(target))
      .execute();

    for (const l of leases) {
      const res = await db
        .insertInto("notification")
        .values({
          type: "contract_expiry",
          ref_entity_type: "lease",
          ref_entity_id: l.lease_id,
          title: `계약 만료 D-${days}: ${l.tenant_name}`,
          message: `${l.tenant_name} 님의 계약이 ${target}에 만료됩니다.`,
          due_date: target,
          dedup_key: `contract_expiry:${l.lease_id}:${target}:${days}`,
        })
        .onConflict((oc) => oc.column("dedup_key").doNothing())
        .executeTakeFirst();
      created += Number(res.numInsertedOrUpdatedRows ?? 0);
    }
  }

  return created;
}
