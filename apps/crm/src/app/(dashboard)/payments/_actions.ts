"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requirePermission } from "@/lib/authz";

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

  await db
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

  revalidatePath("/payments");
  redirect("/payments");
}

export async function updatePayment(id: number, formData: FormData) {
  await requireUser();

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

  await db
    .updateTable("payment")
    .set({
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
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();

  revalidatePath("/payments");
  redirect(`/payments/${id}`);
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

  await db.deleteFrom("payment").where("id", "=", id).execute();

  revalidatePath("/payments");
  redirect("/payments");
}
