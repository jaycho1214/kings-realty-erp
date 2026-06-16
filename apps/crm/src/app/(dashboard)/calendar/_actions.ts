"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";
import { getDb } from "@kingsrealty/db";

export async function generateCalendarToken() {
  const session = await requireUser();

  const token = crypto.randomUUID();
  const db = getDb();

  await db
    .updateTable("user")
    .set({ calendar_token: token })
    .where("id", "=", Number(session.user.id))
    .execute();

  return { token };
}

export async function createCalendarEvent(formData: FormData) {
  const session = await requireUser();

  const title = formData.get("title") as string;
  const date = formData.get("date") as string;
  const endDate = formData.get("end_date") as string | null;
  const description = formData.get("description") as string | null;
  const category = (formData.get("category") as string) || "general";
  const color = (formData.get("color") as string) || "primary";
  const urgency = (formData.get("urgency") as string) || "normal";
  const location = formData.get("location") as string | null;
  const propertyId = formData.get("property_id") as string | null;
  const tenantId = formData.get("tenant_id") as string | null;
  const isAllDay = formData.get("is_all_day") !== "false";
  const startTime = formData.get("start_time") as string | null;
  const endTime = formData.get("end_time") as string | null;
  const attendeesJson = formData.get("attendees") as string | null;

  if (!title || !date) {
    return { error: "제목과 날짜는 필수입니다." };
  }

  const db = getDb();

  // Parse attendees up front so a malformed payload fails before any write
  let attendees: { type: string; id: string }[] = [];
  if (attendeesJson) {
    try {
      const parsed = JSON.parse(attendeesJson);
      if (Array.isArray(parsed)) attendees = parsed;
    } catch {
      return { error: "참석자 정보가 올바르지 않습니다." };
    }
  }

  // Insert the event and its attendees atomically
  await db.transaction().execute(async (trx) => {
    const result = await trx
      .insertInto("calendar_event")
      .values({
        title,
        date,
        end_date: endDate || null,
        description: description || null,
        category,
        color,
        urgency,
        location: location || null,
        property_id: propertyId ? Number(propertyId) : null,
        tenant_id: tenantId ? Number(tenantId) : null,
        is_all_day: isAllDay,
        start_time: isAllDay ? null : startTime || null,
        end_time: isAllDay ? null : endTime || null,
        created_by: Number(session.user.id),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    if (attendees.length > 0) {
      await trx
        .insertInto("calendar_event_attendee")
        .values(
          attendees.map((a) => ({
            event_id: result.id,
            attendee_type: a.type,
            attendee_id: a.id,
          })),
        )
        .execute();
    }
  });

  revalidatePath("/calendar");
}

export async function deleteCalendarEvent(id: number) {
  await requireUser();

  const db = getDb();

  await db.deleteFrom("calendar_event").where("id", "=", id).execute();

  revalidatePath("/calendar");
}
