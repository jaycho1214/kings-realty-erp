import { getDb, sql } from "@kingsrealty/db";

/**
 * Due date for a billing month + a definition's `due_day`, clamped to the last
 * day of the month (so due_day 31 in February lands on the 28th/29th).
 * `billingMonth` is "YYYY-MM-01".
 */
function dueDateForMonth(billingMonth: string, dueDay: number): string {
  const [y, m] = billingMonth.split("-").map(Number); // year, month (1-based)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(dueDay || 1, 1), lastDay);
  return `${billingMonth.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

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
    // The NOT EXISTS pre-check makes this idempotent for sequential calls, but a
    // concurrent/retried run (e.g. a cron retry) can pass the check and then hit
    // the unique index. DO NOTHING keeps it a safe no-op instead of aborting the
    // whole batch with a unique-violation.
    .onConflict((oc) => oc.doNothing())
    .execute();

  return leases.length;
}

/** Flip billed, unpaid charges past their due date to 미납(overdue). Returns count. */
export async function markOverdueCharges(today: string): Promise<number> {
  const db = getDb();
  const res = await db
    .updateTable("charge_item")
    .set({ status: "overdue", updated_at: new Date() })
    .where("status", "=", "billed")
    .where("paid_by_payment_id", "is", null)
    .where("due_date", "is not", null)
    .where("due_date", "<", new Date(today))
    .executeTakeFirst();
  return Number(res.numUpdatedRows);
}

/**
 * Materialize this month's charges from every active `recurring_charge` whose
 * tenant is active and has an active/renewed lease. Idempotent — skips a
 * definition that already has a charge for `billingMonth` (also backed by the
 * unique index on (recurring_charge_id, billing_month)). A definition with a
 * null `amount` (variable) generates an `unbilled` placeholder excluded from
 * 미납 until an amount is entered. Returns the number of charges created.
 */
export async function generateRecurringChargesForMonth(
  billingMonth: string,
  tenantId?: number,
): Promise<number> {
  const db = getDb();
  const monthDate = new Date(billingMonth);

  let query = db
    .selectFrom("recurring_charge as rc")
    .innerJoin("tenant as t", "t.id", "rc.tenant_id")
    .select((eb) => [
      "rc.id as recurring_charge_id",
      "rc.tenant_id as tenant_id",
      "rc.type as type",
      "rc.label as label",
      "rc.amount as amount",
      "rc.currency as currency",
      "rc.due_day as due_day",
      "rc.start_month as start_month",
      "rc.end_month as end_month",
      eb
        .selectFrom("lease")
        .select("lease.id")
        .whereRef("lease.tenant_id", "=", "rc.tenant_id")
        .where("lease.status", "in", ["active", "renewed"])
        .orderBy("lease.start_date", "desc")
        .limit(1)
        .as("lease_id"),
    ])
    .where("rc.active", "=", true)
    .where("t.status", "=", "active")
    .where("t.deleted_at", "is", null)
    .where("t.archived_at", "is", null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("charge_item")
            .select("charge_item.id")
            .whereRef("charge_item.recurring_charge_id", "=", "rc.id")
            .where("charge_item.billing_month", "=", monthDate),
        ),
      ),
    );

  if (tenantId != null) {
    query = query.where("rc.tenant_id", "=", tenantId);
  }

  const defs = await query.execute();

  const rows = defs.filter((d) => {
    if (!d.lease_id) return false; // no current lease → don't bill
    if (d.start_month && new Date(d.start_month) > monthDate) return false;
    if (d.end_month && new Date(d.end_month) < monthDate) return false;
    return true;
  });
  if (rows.length === 0) return 0;

  await db
    .insertInto("charge_item")
    .values(
      rows.map((d) => ({
        tenant_id: d.tenant_id,
        lease_id: d.lease_id as number,
        recurring_charge_id: d.recurring_charge_id,
        type: d.type,
        recurrence: "monthly",
        billing_month: billingMonth,
        amount: d.amount == null ? null : String(d.amount),
        currency: d.currency,
        due_date: dueDateForMonth(billingMonth, d.due_day),
        status: d.amount == null ? "unbilled" : "billed",
        memo: d.label,
      })),
    )
    // Idempotent under concurrency/retries: the unique index on
    // (recurring_charge_id, billing_month) would otherwise throw and abort the
    // batch if a racing run inserted the same rows between the check and here.
    .onConflict((oc) => oc.doNothing())
    .execute();

  return rows.length;
}

/**
 * Recompute the derived status of the given charges from their settlement +
 * due date. Called after a payment is allocated, edited, or deleted so 미납
 * never goes stale. No-op for an empty list.
 */
export async function recomputeChargeStatus(
  chargeIds: number[],
  today: string,
): Promise<void> {
  if (chargeIds.length === 0) return;
  const db = getDb();
  await db
    .updateTable("charge_item")
    .set({
      status: sql<string>`case
        when paid_by_payment_id is not null then 'paid'
        when amount is null then 'unbilled'
        when due_date is not null and due_date < ${today}::date then 'overdue'
        else 'billed'
      end`,
      updated_at: new Date(),
    })
    .where("id", "in", chargeIds)
    .execute();
}
