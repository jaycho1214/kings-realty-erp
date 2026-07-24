"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz";
import { parseForm } from "@/lib/schemas/parse";
import { propertySchema } from "@/lib/schemas/property";
import { ValidationError } from "@/lib/validation-error";
import { runAction, type FormState } from "@/lib/form-action";

export async function createProperty(formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const session = await requirePermission("property", "create");

    const db = getDb();

    const v = parseForm(propertySchema, formData);

    await db
      .insertInto("property")
      .values({
        ...v,
        created_by: Number(session.user.id),
      })
      .execute();

    revalidatePath("/properties");
    redirect("/properties");
  });
}

export async function updateProperty(
  id: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requirePermission("property", "update");

    const db = getDb();

    const v = parseForm(propertySchema, formData);

    await db
      .updateTable("property")
      .set({
        ...v,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();

    revalidatePath("/properties");
    redirect(`/properties/${id}`);
  });
}

export async function deleteProperty(id: number): Promise<FormState> {
  return runAction(async () => {
    await requirePermission("property", "delete");

    const db = getDb();

    // lease.property_id is ON DELETE RESTRICT: a bare delete throws an opaque FK
    // error for any property that has a lease. Refuse with a clear message
    // instead (matches deleteLease / deleteLandlord). No lease ⇒ no inspection
    // (inspection.lease_id is NOT NULL), so leases are the only hard blocker.
    const leases = await db
      .selectFrom("lease")
      .select(({ fn }) => fn.countAll<number>().as("c"))
      .where("property_id", "=", id)
      .executeTakeFirst();
    if (Number(leases?.c ?? 0) > 0) {
      throw new ValidationError(
        "계약 내역이 연결된 매물은 삭제할 수 없습니다.",
      );
    }

    await db.transaction().execute(async (trx) => {
      // calendar_event.property_id is a nullable FK with no cascade — detach any
      // reminders so they survive and don't block the delete. appliances
      // cascade automatically.
      await trx
        .updateTable("calendar_event")
        .set({ property_id: null })
        .where("property_id", "=", id)
        .execute();
      await trx.deleteFrom("property").where("id", "=", id).execute();
    });

    revalidatePath("/properties");
    redirect("/properties");
  });
}
