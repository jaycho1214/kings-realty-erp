"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";

export async function markNotificationRead(id: number) {
  await requireUser();
  await getDb()
    .updateTable("notification")
    .set({ is_read: true })
    .where("id", "=", id)
    .execute();
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  await requireUser();
  await getDb()
    .updateTable("notification")
    .set({ is_read: true })
    .where("is_read", "=", false)
    .execute();
  revalidatePath("/notifications");
}
