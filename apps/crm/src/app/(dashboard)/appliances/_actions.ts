"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz";
import { ValidationError } from "@/lib/validation-error";
import { parseForm } from "@/lib/schemas/parse";
import {
  applianceSchema,
  applianceServiceRequestSchema,
} from "@/lib/schemas/property";
import { runAction, type FormState } from "@/lib/form-action";

export async function createAppliance(formData: FormData): Promise<FormState> {
  return runAction(async () => {
    await requirePermission("property", "create");
    const db = getDb();
    const v = parseForm(applianceSchema, formData);

    await db.insertInto("appliance").values(v).execute();

    revalidatePath("/appliances");
    redirect("/appliances");
  });
}

export async function updateAppliance(
  id: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requirePermission("property", "update");
    const db = getDb();
    const v = parseForm(applianceSchema, formData);

    await db
      .updateTable("appliance")
      .set({ ...v, updated_at: new Date() })
      .where("id", "=", id)
      .execute();

    revalidatePath("/appliances");
    redirect(`/appliances/${id}`);
  });
}

export async function deleteAppliance(id: number) {
  await requirePermission("property", "delete");
  const db = getDb();

  // service_request.appliance_id is ON DELETE SET NULL, so linked repairs
  // survive (just unlinked). Photo `document` rows are generic and don't
  // cascade — left as-is (consistent with deleteProperty's handling).
  await db.deleteFrom("appliance").where("id", "=", id).execute();

  revalidatePath("/appliances");
  redirect("/appliances");
}

/**
 * File a repair (A/S) request for a specific appliance. Reuses the standard
 * service_request flow; `service_request.lease_id` is NOT NULL, so we attach it
 * to the property's active lease (a repair happens during a tenancy).
 */
export async function createApplianceServiceRequest(
  applianceId: number,
  propertyId: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    const session = await requirePermission("service", "create");
    const db = getDb();

    const { title, description, category } = parseForm(
      applianceServiceRequestSchema,
      formData,
    );

    const lease = await db
      .selectFrom("lease")
      .select("id")
      .where("property_id", "=", propertyId)
      .where("status", "=", "active")
      .orderBy("start_date", "desc")
      .executeTakeFirst();
    if (!lease) {
      throw new ValidationError(
        "활성 계약이 있는 매물만 수리 요청을 등록할 수 있습니다.",
      );
    }

    await db.transaction().execute(async (trx) => {
      const sr = await trx
        .insertInto("service_request")
        .values({
          lease_id: lease.id,
          appliance_id: applianceId,
          title,
          description: description ?? "",
          category: category ?? "appliance",
          logged_by: Number(session.user.id),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("service_request_status_log")
        .values({
          service_request_id: sr.id,
          status: "received",
          changed_by: Number(session.user.id),
        })
        .execute();
    });

    revalidatePath(`/appliances/${applianceId}`);
    revalidatePath("/services");
  });
}
