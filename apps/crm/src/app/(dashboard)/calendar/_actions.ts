"use server";

import { z } from "zod";
import { parseForm } from "@/lib/schemas/parse";
import { calendarEventSchema } from "@/lib/schemas/settings";
import { isValidationError } from "@/lib/validation-error";

import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/authz";
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
  const session = await requirePermission("calendar", "create");

  // This action returns its errors (it predates runAction), so surface the
  // schema's message the same way rather than letting it throw.
  let v: z.infer<typeof calendarEventSchema>;
  try {
    v = parseForm(calendarEventSchema, formData);
  } catch (err) {
    if (isValidationError(err)) return { error: err.message };
    throw err;
  }
  const {
    title,
    date,
    end_date: endDate,
    description,
    category,
    color,
    urgency,
    location,
    property_id: propertyId,
    tenant_id: tenantId,
    is_all_day: isAllDay,
    start_time: startTime,
    end_time: endTime,
    attendees: attendeesJson,
  } = v;

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
  await requirePermission("calendar", "delete");

  const db = getDb();

  await db.deleteFrom("calendar_event").where("id", "=", id).execute();

  revalidatePath("/calendar");
}
