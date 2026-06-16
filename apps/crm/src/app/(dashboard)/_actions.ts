"use server";

import { getDb } from "@kingsrealty/db";
import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authz";

export async function deleteDocument(
  id: number,
  entityType: string,
  entityId: string | number,
) {
  await requirePermission("document", "delete");

  const db = getDb();

  // Remove the underlying blob first so deleting the DB row doesn't orphan a
  // publicly-accessible file (lease scans, IDs, etc. stay fetchable otherwise).
  const doc = await db
    .selectFrom("document")
    .select(["file_url"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (doc?.file_url) {
    try {
      await del(doc.file_url);
    } catch (err) {
      console.error("[document] failed to delete blob", doc.file_url, err);
    }
  }

  await db.deleteFrom("document").where("id", "=", id).execute();

  // Revalidate based on entity type
  const pathMap: Record<string, string> = {
    tenant: `/tenants/${entityId}`,
    property: `/properties/${entityId}`,
    lease: `/leases/${entityId}`,
    service_request: `/services/${entityId}`,
    payment: `/payments/${entityId}`,
  };

  const path = pathMap[entityType];
  if (path) revalidatePath(path);
}
