"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";

/**
 * CRUD for the shared bill/payment type catalog (`bill_preset`). Used by both
 * recurring-charge definitions and the payment collector's type list. Kept in
 * its own file (not settings/_actions.ts) to stay clear of unrelated work.
 */

function parsePresetForm(formData: FormData) {
  const label = (formData.get("label") as string)?.trim();
  if (!label) throw new Error("이름을 입력해주세요.");
  const type = (formData.get("type") as string)?.trim() || label;
  const isVariable = formData.get("is_variable") === "on";
  const dueDayRaw = Number(formData.get("default_due_day"));
  const default_due_day =
    Number.isFinite(dueDayRaw) && dueDayRaw >= 1 && dueDayRaw <= 31
      ? Math.floor(dueDayRaw)
      : 10;
  const amountRaw = (formData.get("default_amount") as string)?.trim();
  const default_amount = isVariable || !amountRaw ? null : Number(amountRaw);
  if (
    default_amount != null &&
    (!Number.isFinite(default_amount) || default_amount < 0)
  ) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }
  const currency = formData.get("default_currency") === "USD" ? "USD" : "KRW";
  return {
    label,
    type,
    is_variable: isVariable,
    default_due_day,
    default_amount: default_amount == null ? null : String(default_amount),
    default_currency: currency,
  };
}

export async function createBillPreset(formData: FormData) {
  await requireAdmin();
  const db = getDb();
  const fields = parsePresetForm(formData);

  const maxOrder = await db
    .selectFrom("bill_preset")
    .select(({ fn }) => fn.max("sort_order").as("m"))
    .executeTakeFirst();

  await db
    .insertInto("bill_preset")
    .values({ ...fields, sort_order: Number(maxOrder?.m ?? 0) + 1 })
    .execute();

  revalidatePath("/settings");
  revalidatePath("/payments/new");
}

export async function updateBillPreset(id: number, formData: FormData) {
  await requireAdmin();
  const db = getDb();
  const fields = parsePresetForm(formData);
  await db
    .updateTable("bill_preset")
    .set(fields)
    .where("id", "=", id)
    .execute();
  revalidatePath("/settings");
  revalidatePath("/payments/new");
}

export async function deleteBillPreset(id: number) {
  await requireAdmin();
  const db = getDb();
  await db.deleteFrom("bill_preset").where("id", "=", id).execute();
  revalidatePath("/settings");
  revalidatePath("/payments/new");
}
