"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz";

const OWNERS = new Set(["landlord", "office", "tenant"]);
const STATUSES = new Set(["normal", "repair", "broken"]);

function readApplianceForm(formData: FormData) {
  const property_id = Number(formData.get("property_id") as string);
  const name = (formData.get("name") as string)?.trim();
  const ownerRaw = (formData.get("owner") as string) || "landlord";
  const statusRaw = (formData.get("status") as string) || "normal";
  return {
    property_id,
    name,
    owner: OWNERS.has(ownerRaw) ? ownerRaw : "landlord",
    status: STATUSES.has(statusRaw) ? statusRaw : "normal",
    brand: (formData.get("brand") as string)?.trim() || null,
    model_number: (formData.get("model_number") as string)?.trim() || null,
    as_contact: (formData.get("as_contact") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
  };
}

export async function createAppliance(formData: FormData) {
  await requirePermission("property", "create");
  const db = getDb();
  const v = readApplianceForm(formData);
  if (!Number.isInteger(v.property_id) || v.property_id <= 0) {
    throw new Error("매물을 선택해주세요.");
  }
  if (!v.name) throw new Error("비품명을 입력해주세요.");

  await db.insertInto("appliance").values(v).execute();

  revalidatePath("/appliances");
  redirect("/appliances");
}

export async function updateAppliance(id: number, formData: FormData) {
  await requirePermission("property", "update");
  const db = getDb();
  const v = readApplianceForm(formData);
  if (!Number.isInteger(v.property_id) || v.property_id <= 0) {
    throw new Error("매물을 선택해주세요.");
  }
  if (!v.name) throw new Error("비품명을 입력해주세요.");

  await db
    .updateTable("appliance")
    .set({ ...v, updated_at: new Date() })
    .where("id", "=", id)
    .execute();

  revalidatePath("/appliances");
  redirect(`/appliances/${id}`);
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
) {
  const session = await requirePermission("service", "create");
  const db = getDb();

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const category = (formData.get("category") as string)?.trim() || "appliance";
  if (!title) throw new Error("제목을 입력해주세요.");

  const lease = await db
    .selectFrom("lease")
    .select("id")
    .where("property_id", "=", propertyId)
    .where("status", "=", "active")
    .orderBy("start_date", "desc")
    .executeTakeFirst();
  if (!lease) {
    throw new Error("활성 계약이 있는 매물만 수리 요청을 등록할 수 있습니다.");
  }

  await db.transaction().execute(async (trx) => {
    const sr = await trx
      .insertInto("service_request")
      .values({
        lease_id: lease.id,
        appliance_id: applianceId,
        title,
        description,
        category,
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
}
