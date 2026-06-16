import { getDb } from "@kingsrealty/db";

/**
 * Generate monthly 월세(rent) charges for every active/renewed lease that does
 * not yet have one for `billingMonth` (first-of-month, "YYYY-MM-01").
 * Idempotent — safe to call repeatedly (also backed by a unique index).
 * Returns the number of charges created.
 */
export async function generateRentChargesForMonth(
  billingMonth: string,
): Promise<number> {
  const db = getDb();

  const leases = await db
    .selectFrom("lease")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .select([
      "lease.id as lease_id",
      "lease.tenant_id as tenant_id",
      "lease.monthly_rent_krw as monthly_rent_krw",
    ])
    .where("lease.status", "in", ["active", "renewed"])
    .where("tenant.deleted_at", "is", null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("charge_item")
            .select("charge_item.id")
            .whereRef("charge_item.lease_id", "=", "lease.id")
            .where("charge_item.type", "=", "rent")
            .where("charge_item.billing_month", "=", new Date(billingMonth)),
        ),
      ),
    )
    .execute();

  if (leases.length === 0) return 0;

  const dueDate = `${billingMonth.slice(0, 8)}10`; // 10th of the billing month

  await db
    .insertInto("charge_item")
    .values(
      leases.map((l) => ({
        tenant_id: l.tenant_id,
        lease_id: l.lease_id,
        type: "rent",
        recurrence: "monthly",
        billing_month: billingMonth,
        amount: String(l.monthly_rent_krw),
        currency: "KRW",
        due_date: dueDate,
        status: "billed",
      })),
    )
    .execute();

  return leases.length;
}

/** Flip billed charges past their due date to 미납(overdue). Returns count. */
export async function markOverdueCharges(today: string): Promise<number> {
  const db = getDb();
  const res = await db
    .updateTable("charge_item")
    .set({ status: "overdue", updated_at: new Date() })
    .where("status", "=", "billed")
    .where("due_date", "is not", null)
    .where("due_date", "<", new Date(today))
    .executeTakeFirst();
  return Number(res.numUpdatedRows);
}
