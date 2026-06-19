"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requirePermission } from "@/lib/authz";
import {
  recomputeChargeStatus,
  resettleChargeTuple,
  normalizeChargeType,
} from "@/lib/charges";
import { seoulDateString } from "@/lib/date";

export async function createPayment(formData: FormData) {
  const session = await requireUser();

  const db = getDb();

  const lease_id = Number(formData.get("lease_id") as string);
  const payment_type = formData.get("payment_type") as string;
  const billing_month = new Date(
    (formData.get("billing_month") as string) + "-01",
  );
  const amount_krw = formData.get("amount_krw") as string;
  const currency_paid = formData.get("currency_paid") as string;
  const amount_paid = formData.get("amount_paid") as string;
  const exchange_rate_id_raw =
    (formData.get("exchange_rate_id") as string) || null;
  const exchange_rate_id = exchange_rate_id_raw
    ? Number(exchange_rate_id_raw)
    : null;
  const payment_method = formData.get("payment_method") as string;
  const payment_date = new Date(formData.get("payment_date") as string);

  if (!Number.isInteger(lease_id) || lease_id <= 0) {
    throw new Error("계약을 선택해주세요.");
  }
  if (
    Number.isNaN(billing_month.getTime()) ||
    Number.isNaN(payment_date.getTime())
  ) {
    throw new Error("청구 월과 납부일을 올바르게 입력해주세요.");
  }

  const status = (formData.get("status") as string) || "pending";
  const notes = (formData.get("notes") as string) || null;

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("payment")
      .values({
        lease_id,
        payment_type,
        billing_month,
        amount_krw,
        currency_paid,
        amount_paid,
        exchange_rate_id,
        payment_method,
        payment_date,
        status,
        notes,
        received_by: Number(session.user.id),
      })
      .execute();
    // A standalone payment may cover an outstanding charge — settle it.
    await resettleChargeTuple(
      trx,
      lease_id,
      billing_month,
      normalizeChargeType(payment_type),
      seoulDateString(),
    );
  });

  revalidatePath("/payments");
  revalidatePath("/");
  redirect("/payments");
}

interface PaymentWriteValues {
  lease_id: number;
  payment_type: string;
  billing_month: Date;
  amount_krw: string;
  currency_paid: string;
  amount_paid: string;
  exchange_rate_id: number | null;
  payment_method: string;
  payment_date: Date;
  status: string;
  notes: string | null;
}

/**
 * Update a payment row and re-derive the settlement of every charge tuple it
 * touches — its OLD (lease, month, charge type) and its NEW one — so editing a
 * charge-linked payment (month, type, amount, status, lease) never leaves a
 * charge stranded as paid/unpaid against stale values. One transaction.
 */
async function writePaymentUpdate(
  id: number,
  values: PaymentWriteValues,
): Promise<void> {
  const db = getDb();
  const today = seoulDateString();
  await db.transaction().execute(async (trx) => {
    const before = await trx
      .selectFrom("payment")
      .select(["lease_id", "billing_month", "payment_type"])
      .where("id", "=", id)
      .executeTakeFirst();

    await trx
      .updateTable("payment")
      .set({ ...values, updated_at: new Date() })
      .where("id", "=", id)
      .execute();

    // Re-settle the affected tuples (old + new), deduped so an unchanged tuple
    // is only resettled once.
    const tuples = new Map<
      string,
      { leaseId: number; billingMonth: Date; type: string }
    >();
    const add = (leaseId: number, bm: Date, paymentType: string) => {
      const type = normalizeChargeType(paymentType);
      tuples.set(`${leaseId}|${bm.getTime()}|${type}`, {
        leaseId,
        billingMonth: bm,
        type,
      });
    };
    if (before) {
      add(before.lease_id, new Date(before.billing_month), before.payment_type);
    }
    add(values.lease_id, values.billing_month, values.payment_type);
    for (const t of tuples.values()) {
      await resettleChargeTuple(trx, t.leaseId, t.billingMonth, t.type, today);
    }
  });
}

export async function updatePayment(id: number, formData: FormData) {
  await requireUser();

  const lease_id = Number(formData.get("lease_id") as string);
  const payment_type = formData.get("payment_type") as string;
  const billing_month = new Date(
    (formData.get("billing_month") as string) + "-01",
  );
  const amount_krw = formData.get("amount_krw") as string;
  const currency_paid = formData.get("currency_paid") as string;
  const amount_paid = formData.get("amount_paid") as string;
  const exchange_rate_id_raw =
    (formData.get("exchange_rate_id") as string) || null;
  const exchange_rate_id = exchange_rate_id_raw
    ? Number(exchange_rate_id_raw)
    : null;
  const payment_method = formData.get("payment_method") as string;
  const payment_date = new Date(formData.get("payment_date") as string);

  if (!Number.isInteger(lease_id) || lease_id <= 0) {
    throw new Error("계약을 선택해주세요.");
  }
  if (
    Number.isNaN(billing_month.getTime()) ||
    Number.isNaN(payment_date.getTime())
  ) {
    throw new Error("청구 월과 납부일을 올바르게 입력해주세요.");
  }

  const status = (formData.get("status") as string) || "pending";
  const notes = (formData.get("notes") as string) || null;

  await writePaymentUpdate(id, {
    lease_id,
    payment_type,
    billing_month,
    amount_krw,
    currency_paid,
    amount_paid,
    exchange_rate_id,
    payment_method,
    payment_date,
    status,
    notes,
  });

  revalidatePath("/payments");
  revalidatePath("/");
  redirect(`/payments/${id}`);
}

const PAYMENT_STATUSES = new Set(["paid", "pending", "overdue"]);
const PAYMENT_TYPES = new Set([
  "rent",
  "utility",
  "management",
  "parking",
  "deposit",
  "service",
]);

/**
 * Edit a payment from a tenant's 납부 내역 tab using the same form as creating
 * one. Identical to `updatePayment` except it stays on the tenant page instead
 * of redirecting to the payment detail, so the edit dialog can just close on
 * success.
 */
export async function updateTenantPayment(
  id: number,
  tenantId: number,
  formData: FormData,
) {
  await requireUser();

  const lease_id = Number(formData.get("lease_id") as string);
  const payment_type = formData.get("payment_type") as string;
  const billing_month = new Date(
    (formData.get("billing_month") as string) + "-01",
  );
  const amount_krw = formData.get("amount_krw") as string;
  const currency_paid = formData.get("currency_paid") as string;
  const amount_paid = formData.get("amount_paid") as string;
  const exchange_rate_id_raw =
    (formData.get("exchange_rate_id") as string) || null;
  const exchange_rate_id = exchange_rate_id_raw
    ? Number(exchange_rate_id_raw)
    : null;
  const payment_method = formData.get("payment_method") as string;
  const payment_date = new Date(formData.get("payment_date") as string);
  const status = (formData.get("status") as string) || "pending";
  const notes = (formData.get("notes") as string) || null;

  if (!Number.isInteger(lease_id) || lease_id <= 0) {
    throw new Error("계약을 선택해주세요.");
  }
  if (!PAYMENT_TYPES.has(payment_type)) {
    throw new Error("올바르지 않은 수납 유형입니다.");
  }
  if (!PAYMENT_STATUSES.has(status)) {
    throw new Error("올바르지 않은 상태입니다.");
  }
  if (
    Number.isNaN(billing_month.getTime()) ||
    Number.isNaN(payment_date.getTime())
  ) {
    throw new Error("청구 월과 납부일을 올바르게 입력해주세요.");
  }

  await writePaymentUpdate(id, {
    lease_id,
    payment_type,
    billing_month,
    amount_krw,
    currency_paid,
    amount_paid,
    exchange_rate_id,
    payment_method,
    payment_date,
    status,
    notes,
  });

  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/payments");
  revalidatePath(`/payments/${id}`);
  revalidatePath("/");
}

/**
 * Edit a payment from a property's 수납 내역 tab. Identical to
 * `updateTenantPayment` except it revalidates the property page instead of the
 * tenant page, so the edit dialog can just close on success.
 */
export async function updatePropertyPayment(
  id: number,
  propertyId: number,
  formData: FormData,
) {
  await requireUser();

  const lease_id = Number(formData.get("lease_id") as string);
  const payment_type = formData.get("payment_type") as string;
  const billing_month = new Date(
    (formData.get("billing_month") as string) + "-01",
  );
  const amount_krw = formData.get("amount_krw") as string;
  const currency_paid = formData.get("currency_paid") as string;
  const amount_paid = formData.get("amount_paid") as string;
  const exchange_rate_id_raw =
    (formData.get("exchange_rate_id") as string) || null;
  const exchange_rate_id = exchange_rate_id_raw
    ? Number(exchange_rate_id_raw)
    : null;
  const payment_method = formData.get("payment_method") as string;
  const payment_date = new Date(formData.get("payment_date") as string);
  const status = (formData.get("status") as string) || "pending";
  const notes = (formData.get("notes") as string) || null;

  if (!Number.isInteger(lease_id) || lease_id <= 0) {
    throw new Error("계약을 선택해주세요.");
  }
  if (!PAYMENT_TYPES.has(payment_type)) {
    throw new Error("올바르지 않은 수납 유형입니다.");
  }
  if (!PAYMENT_STATUSES.has(status)) {
    throw new Error("올바르지 않은 상태입니다.");
  }
  if (
    Number.isNaN(billing_month.getTime()) ||
    Number.isNaN(payment_date.getTime())
  ) {
    throw new Error("청구 월과 납부일을 올바르게 입력해주세요.");
  }

  await writePaymentUpdate(id, {
    lease_id,
    payment_type,
    billing_month,
    amount_krw,
    currency_paid,
    amount_paid,
    exchange_rate_id,
    payment_method,
    payment_date,
    status,
    notes,
  });

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/payments");
  revalidatePath(`/payments/${id}`);
  revalidatePath("/");
}

export async function toggleBillPaid(id: number) {
  const session = await requireUser();

  const db = getDb();

  const payment = await db
    .selectFrom("payment")
    .select(["bill_paid"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

  const nowPaid = !payment.bill_paid;

  await db
    .updateTable("payment")
    .set({
      bill_paid: nowPaid,
      bill_paid_at: nowPaid ? new Date() : null,
      bill_paid_by: nowPaid ? Number(session.user.id) : null,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();

  revalidatePath("/payments");
  revalidatePath(`/payments/${id}`);
}

export async function toggleBundleBillPaid(bundleId: string) {
  const session = await requireUser();

  const db = getDb();

  // Check if any in bundle are unpaid → mark all paid; otherwise mark all unpaid
  const payments = await db
    .selectFrom("payment")
    .select(["id", "bill_paid"])
    .where("bundle_id", "=", bundleId)
    .execute();

  const anyUnpaid = payments.some((p) => !p.bill_paid);
  const nowPaid = anyUnpaid;

  await db
    .updateTable("payment")
    .set({
      bill_paid: nowPaid,
      bill_paid_at: nowPaid ? new Date() : null,
      bill_paid_by: nowPaid ? Number(session.user.id) : null,
      updated_at: new Date(),
    })
    .where("bundle_id", "=", bundleId)
    .execute();

  revalidatePath("/payments");
  revalidatePath(`/payments/bundle/${bundleId}`);
}

export async function deletePayment(id: number) {
  await requirePermission("payment", "delete");

  const db = getDb();
  const today = seoulDateString();

  await db.transaction().execute(async (trx) => {
    // Charges this payment settled. The FK nulls their paid_by_payment_id on
    // delete; capture their tuples first so we can re-derive settlement after.
    const linked = await trx
      .selectFrom("charge_item")
      .select(["id", "lease_id", "billing_month", "type"])
      .where("paid_by_payment_id", "=", id)
      .execute();

    await trx.deleteFrom("payment").where("id", "=", id).execute();

    // Revert every linked charge from paid (incl. non-KRW, which resettle skips).
    await recomputeChargeStatus(
      linked.map((r) => r.id),
      today,
      trx,
    );

    // Then re-settle each affected tuple, so a charge still fully covered by
    // another payment re-links instead of wrongly dropping to unpaid.
    const tuples = new Map<
      string,
      { leaseId: number; billingMonth: Date; type: string }
    >();
    for (const c of linked) {
      if (c.lease_id == null || c.billing_month == null) continue;
      const bm = new Date(c.billing_month);
      tuples.set(`${c.lease_id}|${bm.getTime()}|${c.type}`, {
        leaseId: c.lease_id,
        billingMonth: bm,
        type: c.type,
      });
    }
    for (const t of tuples.values()) {
      await resettleChargeTuple(trx, t.leaseId, t.billingMonth, t.type, today);
    }
  });

  revalidatePath("/payments");
  revalidatePath("/");
  redirect("/payments");
}
