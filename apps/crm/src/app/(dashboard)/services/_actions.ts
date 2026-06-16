"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz";

export async function createServiceRequest(formData: FormData) {
  const session = await requirePermission("service", "create");

  const db = getDb();
  const lease_id = Number(formData.get("lease_id") as string);
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const location = (formData.get("location") as string)?.trim() || null;
  const bearer = (formData.get("bearer") as string) || null;
  const assignee = (formData.get("assignee") as string)?.trim() || null;
  const scheduled_date = (formData.get("scheduled_date") as string) || null;
  const estimated_cost = (formData.get("estimated_cost") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  if (!Number.isInteger(lease_id) || lease_id <= 0 || !category?.trim()) {
    return null;
  }

  const result = await db.transaction().execute(async (trx) => {
    const sr = await trx
      .insertInto("service_request")
      .values({
        lease_id,
        title,
        description,
        category,
        location,
        bearer,
        assignee,
        scheduled_date,
        estimated_cost,
        logged_by: Number(session.user.id),
        notes,
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

    return sr;
  });

  revalidatePath("/services");
  return String(result.id);
}

export async function updateServiceRequest(id: number, formData: FormData) {
  const session = await requirePermission("service", "update");

  const db = getDb();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const status = formData.get("status") as string;
  const location = (formData.get("location") as string)?.trim() || null;
  const bearer = (formData.get("bearer") as string) || null;
  const assignee = (formData.get("assignee") as string)?.trim() || null;
  const scheduled_date = (formData.get("scheduled_date") as string) || null;
  const estimated_cost = (formData.get("estimated_cost") as string) || null;
  const actual_cost = (formData.get("actual_cost") as string) || null;
  const postpone_reason =
    (formData.get("postpone_reason") as string)?.trim() || null;
  const escalated_to_landlord =
    formData.get("escalated_to_landlord") === "true";
  const notes = (formData.get("notes") as string) || null;

  const existing = await db
    .selectFrom("service_request")
    .select(["resolved_at", "status"])
    .where("id", "=", id)
    .executeTakeFirst();
  const isDone = status === "completed";
  const resolved_at = isDone ? (existing?.resolved_at ?? new Date()) : null;
  const statusChanged = !!existing && existing.status !== status;

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("service_request")
      .set({
        title,
        description,
        category,
        status,
        location,
        bearer,
        assignee,
        scheduled_date,
        estimated_cost,
        actual_cost,
        completed_date: isDone ? new Date() : null,
        postpone_reason,
        // Keep the legacy canonical cost in sync only when an actual cost was
        // actually entered; a blank 실제 비용 must NOT wipe a previously
        // recorded cost_krw.
        ...(actual_cost != null ? { cost_krw: actual_cost } : {}),
        escalated_to_landlord,
        resolved_at,
        notes,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();

    // Editing the request can also change its status; record that transition
    // in the status log so the 변경 이력 timeline never contradicts the record
    // (mirrors changeServiceRequestStatus).
    if (statusChanged) {
      await trx
        .insertInto("service_request_status_log")
        .values({
          service_request_id: id,
          status,
          changed_by: Number(session.user.id),
        })
        .execute();
    }
  });

  revalidatePath("/services");
  redirect(`/services/${id}`);
}

export async function changeServiceRequestStatus(
  serviceRequestId: number,
  status: string,
  note?: string,
) {
  const session = await requirePermission("service", "update");

  const db = getDb();
  const existing = await db
    .selectFrom("service_request")
    .select(["resolved_at", "completed_date"])
    .where("id", "=", serviceRequestId)
    .executeTakeFirst();
  const isDone = status === "completed";
  const resolved_at = isDone ? (existing?.resolved_at ?? new Date()) : null;
  const completed_date = isDone
    ? (existing?.completed_date ?? new Date())
    : (existing?.completed_date ?? null);

  const logId = await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("service_request")
      .set({
        status,
        resolved_at,
        completed_date,
        updated_at: new Date(),
      })
      .where("id", "=", serviceRequestId)
      .execute();

    const log = await trx
      .insertInto("service_request_status_log")
      .values({
        service_request_id: serviceRequestId,
        status,
        changed_by: Number(session.user.id),
        note: note || null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return log.id;
  });

  revalidatePath(`/services/${serviceRequestId}`);
  revalidatePath("/services");
  return String(logId);
}

export async function deleteServiceRequest(id: number) {
  await requirePermission("service", "delete");

  const db = getDb();
  await db.deleteFrom("service_request").where("id", "=", id).execute();
  revalidatePath("/services");
  redirect("/services");
}
