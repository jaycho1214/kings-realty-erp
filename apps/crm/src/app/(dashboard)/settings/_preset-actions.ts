"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { parseForm } from "@/lib/schemas/parse";
import { billPresetSchema } from "@/lib/schemas/settings";
import { runAction, type FormState } from "@/lib/form-action";

/**
 * CRUD for the shared bill/payment type catalog (`bill_preset`). Used by both
 * recurring-charge definitions and the payment collector's type list. Kept in
 * its own file (not settings/_actions.ts) to stay clear of unrelated work.
 */

function parsePresetForm(formData: FormData) {
  const v = parseForm(billPresetSchema, formData);
  return {
    ...v,
    default_amount:
      v.default_amount == null ? null : String(v.default_amount),
  };
}

export async function createBillPreset(formData: FormData): Promise<FormState> {
  return runAction(async () => {
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
  });
}

export async function updateBillPreset(
  id: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();
    const db = getDb();
    const fields = parsePresetForm(formData);
    const row = await db
      .selectFrom("bill_preset")
      .select(["is_builtin", "type"])
      .where("id", "=", id)
      .executeTakeFirst();
    // Builtins keep their stable type key (code writes it directly); label/amount/
    // color stay editable.
    const patch = row?.is_builtin ? { ...fields, type: row.type } : fields;
    await db
      .updateTable("bill_preset")
      .set(patch)
      .where("id", "=", id)
      .execute();
    revalidatePath("/settings");
    revalidatePath("/payments/new");
  });
}

export async function deleteBillPreset(id: number) {
  await requireAdmin();
  const db = getDb();
  const row = await db
    .selectFrom("bill_preset")
    .select("is_builtin")
    .where("id", "=", id)
    .executeTakeFirst();
  if (row?.is_builtin) return; // structural type — not deletable
  await db.deleteFrom("bill_preset").where("id", "=", id).execute();
  revalidatePath("/settings");
  revalidatePath("/payments/new");
}
