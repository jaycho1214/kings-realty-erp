import { getDb, sql } from "@kingsrealty/db";

// Accepts the shared pool or a transaction (Transaction<DB> ⊂ Kysely<DB>), so the
// rent def can be synced inside a lease-creation transaction or standalone.
type Executor = ReturnType<typeof getDb>;

/** First-of-month "YYYY-MM-01" for a Date, read in UTC to match the date column. */
function firstOfMonthUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Register/sync a tenant's steady monthly 월세 as a `recurring_charge` (type
 * 'rent'), so rent flows through the same generator as every other 정기 청구
 * instead of a separate lease-based path. The irregular move-in period (선불금
 * / proration) is handled at payment time, NOT here — this only bills the full
 * monthly rent for each month within the lease term.
 *
 * One rent def per tenant (the recurring generator attributes it to the tenant's
 * current active/renewed lease). Idempotent: updates the existing def's amount /
 * end_month / active and deactivates any duplicates; `start_month` is set once on
 * creation and preserved (so the transition backfill's cutover month sticks).
 */
export async function syncTenantRentDef(
  db: Executor,
  input: {
    tenantId: number;
    monthlyRentKrw: string;
    startDate: Date;
    endDate: Date;
    active: boolean;
    createdBy?: number | null;
    /** Override the first billing month (transition backfill cutover). */
    startMonth?: string;
  },
): Promise<void> {
  const existing = await db
    .selectFrom("recurring_charge")
    .select("id")
    .where("tenant_id", "=", input.tenantId)
    .where("type", "=", "rent")
    .orderBy("id", "asc")
    .execute();

  const endMonth = firstOfMonthUTC(input.endDate);

  if (existing.length === 0) {
    await db
      .insertInto("recurring_charge")
      .values({
        tenant_id: input.tenantId,
        label: "월세",
        type: "rent",
        amount: String(input.monthlyRentKrw),
        currency: "KRW",
        due_day: 10,
        active: input.active,
        start_month: input.startMonth ?? firstOfMonthUTC(input.startDate),
        end_month: endMonth,
        created_by: input.createdBy ?? null,
      })
      .execute();
    return;
  }

  await db
    .updateTable("recurring_charge")
    .set({
      amount: String(input.monthlyRentKrw),
      end_month: endMonth,
      active: input.active,
      updated_at: new Date(),
    })
    .where("id", "=", existing[0].id)
    .execute();

  // Collapse any accidental duplicates to a single active rent def.
  if (existing.length > 1) {
    await db
      .updateTable("recurring_charge")
      .set({ active: false, updated_at: new Date() })
      .where(
        "id",
        "in",
        existing.slice(1).map((e) => e.id),
      )
      .execute();
  }
}

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
 * Flip billed, unpaid charges past their due date to 미납(overdue). Returns count.
 *
 * Note: 월세 is no longer generated via a separate lease-based path — it is
 * registered as a `recurring_charge` (type 'rent') at lease creation and flows
 * through `generateRecurringChargesForMonth` like every other 정기 청구. See
 * `syncTenantRentDef`.
 */
export async function markOverdueCharges(today: string): Promise<number> {
  const db = getDb();
  const res = await db
    .updateTable("charge_item")
    .set({ status: "overdue", updated_at: new Date() })
    .where("status", "=", "billed")
    .where("paid_by_payment_id", "is", null)
    .where("due_date", "is not", null)
    // Compare date-to-date (today is a Seoul "YYYY-MM-DD"). `new Date(today)`
    // would be UTC-midnight and drift against the date column off a UTC server;
    // `::date` keeps it a pure date compare, matching recomputeChargeStatus.
    .where("due_date", "<", sql<Date>`${today}::date`)
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
 * Reconcile unpaid charges against already-recorded payments.
 *
 * A charge is normally settled at collection time by linking the payment
 * (`paid_by_payment_id`). But payments recorded WITHOUT that link — imported
 * rows, or collection that bypassed the charge picker — leave the charge
 * stranded as 미납/연체 forever even though the money was received. This matches
 * a charge to the recorded (status = 'paid') payments for the same (lease,
 * billing_month, type) and, when they fully cover its amount, settles it.
 * Pending/overdue payment rows are money NOT yet collected, so they are
 * excluded — otherwise an expected-but-unpaid payment would settle the charge.
 *
 * Binary settlement (matches the charge model — see migration 016): only a
 * FULLY-covered charge flips to paid; a partial payment leaves it outstanding.
 * The charge is linked to the most recent covering payment for traceability.
 * Scoped to KRW charges (compared against payment.amount_krw); USD charges are
 * left for manual handling. Idempotent. Returns the number of charges settled.
 *
 * A 선불금(prepayment) is prepaid rent (move-in proration + first month), so it
 * counts toward a 월세(rent) charge for the same month — normalizing prepayment
 * to rent lets the first month settle whether it was paid as 선불금 or plain rent.
 */
export async function reconcileCharges(): Promise<number> {
  const db = getDb();
  const settled = await sql<{ id: number }>`
    update charge_item ci
    set paid_by_payment_id = pmt.payment_id,
        status = 'paid',
        updated_at = now()
    from (
      select p.lease_id,
             p.billing_month,
             case when p.payment_type = 'prepayment' then 'rent'
                  else p.payment_type end as match_type,
             sum(p.amount_krw) as paid_krw,
             max(p.id) as payment_id
      from payment p
      where p.status = 'paid'
      group by p.lease_id, p.billing_month,
               case when p.payment_type = 'prepayment' then 'rent'
                    else p.payment_type end
    ) pmt
    where ci.paid_by_payment_id is null
      and ci.status in ('billed', 'overdue')
      and ci.amount is not null
      and ci.currency = 'KRW'
      and ci.lease_id = pmt.lease_id
      and ci.billing_month = pmt.billing_month
      and ci.type = pmt.match_type
      and pmt.paid_krw >= ci.amount
    returning ci.id
  `.execute(db);
  return settled.rows.length;
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
        when status in ('waived', 'void') then status
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
