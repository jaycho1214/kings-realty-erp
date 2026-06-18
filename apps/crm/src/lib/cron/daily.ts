import { getDb } from "@kingsrealty/db";
import { seoulDateString, seoulYMD, firstOfMonth } from "@/lib/date";
import {
  generateRentChargesForMonth,
  generateRecurringChargesForMonth,
  markOverdueCharges,
} from "@/lib/charges";
import { generateContractExpiryNotifications } from "@/lib/notifications";

export interface DailyJobResult {
  archivedTenants: number;
  softDeletedTenants: number;
  rentChargesCreated: number;
  recurringChargesCreated: number;
  chargesMarkedOverdue: number;
  expiryNotifications: number;
  errors: string[];
}

/**
 * Daily maintenance jobs. Idempotent — safe to run more than once a day.
 *
 * WP B1:
 *  1. Safety net: stamp archived_at on any moved-out (status=inactive) tenant
 *     that is missing it. Moving a tenant out already archives them; this only
 *     backfills rows set inactive by import/bulk paths so the retention clock
 *     starts. (archived_at is the internal 보관→휴지통 clock, not a separate view.)
 *  2. Soft-delete tenants that have been archived for 6+ months (recoverable
 *     trash; permanent purge stays a manual admin action).
 *  3. Generate this month's rent charges and flag overdue ones.
 *  4. Contract-expiry (D-60/30/7) notifications.
 *
 * Each step is isolated in its own try/catch: a transient failure in one job
 * must NOT abort the rest. This matters most for the expiry notifications,
 * which match on an exact date with no catch-up — if a thrown earlier step
 * skipped them, that day's D-60/30/7 milestone would be lost forever.
 */
export async function runDailyJobs(): Promise<DailyJobResult> {
  const db = getDb();
  const today = seoulDateString();
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const result: DailyJobResult = {
    archivedTenants: 0,
    softDeletedTenants: 0,
    rentChargesCreated: 0,
    recurringChargesCreated: 0,
    chargesMarkedOverdue: 0,
    expiryNotifications: 0,
    errors: [],
  };

  const run = async (name: string, job: () => Promise<void>) => {
    try {
      await job();
    } catch (err) {
      console.error(`[cron/daily] ${name} failed`, err);
      result.errors.push(name);
    }
  };

  await run("archiveMovedOut", async () => {
    const archived = await db
      .updateTable("tenant")
      .set({ archived_at: now })
      .where("status", "=", "inactive")
      .where("archived_at", "is", null)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    result.archivedTenants = Number(archived.numUpdatedRows);
  });

  await run("softDeleteArchived", async () => {
    const deleted = await db
      .updateTable("tenant")
      .set({ deleted_at: now })
      .where("archived_at", "is not", null)
      .where("deleted_at", "is", null)
      .where("archived_at", "<", sixMonthsAgo)
      .executeTakeFirst();
    result.softDeletedTenants = Number(deleted.numUpdatedRows);
  });

  await run("generateRentCharges", async () => {
    const { year, month } = seoulYMD();
    result.rentChargesCreated = await generateRentChargesForMonth(
      firstOfMonth(year, month),
    );
  });

  await run("generateRecurringCharges", async () => {
    const { year, month } = seoulYMD();
    result.recurringChargesCreated = await generateRecurringChargesForMonth(
      firstOfMonth(year, month),
    );
  });

  await run("markOverdue", async () => {
    result.chargesMarkedOverdue = await markOverdueCharges(today);
  });

  await run("expiryNotifications", async () => {
    result.expiryNotifications =
      await generateContractExpiryNotifications(today);
  });

  return result;
}
