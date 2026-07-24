"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { parseForm } from "@/lib/schemas/parse";
import { createUserSchema } from "@/lib/schemas/settings";
import { runAction, type FormState } from "@/lib/form-action";

/** Roles an admin can assign through the UI. */
export type AssignableRole = "admin" | "staff" | "accounting" | "pending";

export async function createUser(formData: FormData): Promise<FormState> {
  return runAction(async () => {
    const session = await requireAdmin();

    const { email, password, name } = parseForm(createUserSchema, formData);
    const role = (formData.get("role") as string) || "staff";

    const created = (await auth.api.createUser({
      body: {
        email,
        password,
        name,
        role: role as AssignableRole,
      },
      headers: await headers(),
    })) as { user?: { id?: string | number } };

    const createdId = created?.user?.id;

    await logAudit({
      actorId: Number(session.user.id),
      action: "user.create",
      entityType: "user",
      entityId: createdId != null ? Number(createdId) : null,
      detail: { email, name, role },
    });

    revalidatePath("/settings/users");
  });
}

export async function approveUser(userId: string) {
  const session = await requireAdmin();

  await auth.api.setRole({
    body: { userId, role: "staff" as "admin" | "staff" | "pending" },
    headers: await headers(),
  });

  await logAudit({
    actorId: Number(session.user.id),
    action: "user.approve",
    entityType: "user",
    entityId: Number(userId),
    detail: { role: "staff" },
  });

  revalidatePath("/settings/users");
}

export async function rejectUser(userId: string) {
  const session = await requireAdmin();

  await auth.api.banUser({
    body: { userId, banReason: "가입 승인 거절" },
    headers: await headers(),
  });

  await logAudit({
    actorId: Number(session.user.id),
    action: "user.reject",
    entityType: "user",
    entityId: Number(userId),
  });

  revalidatePath("/settings/users");
}

export async function setUserRole(
  userId: string,
  role: "admin" | "staff" | "accounting",
) {
  const session = await requireAdmin();

  await auth.api.setRole({
    body: { userId, role: role as AssignableRole },
    headers: await headers(),
  });

  await logAudit({
    actorId: Number(session.user.id),
    action: "user.set_role",
    entityType: "user",
    entityId: Number(userId),
    detail: { role },
  });

  revalidatePath("/settings/users");
}

export async function banUser(userId: string, reason?: string) {
  const session = await requireAdmin();

  await auth.api.banUser({
    body: {
      userId,
      ...(reason ? { banReason: reason } : {}),
    },
    headers: await headers(),
  });

  await logAudit({
    actorId: Number(session.user.id),
    action: "user.ban",
    entityType: "user",
    entityId: Number(userId),
    detail: reason ? { reason } : undefined,
  });

  revalidatePath("/settings/users");
}

export async function unbanUser(userId: string) {
  const session = await requireAdmin();

  await auth.api.unbanUser({
    body: { userId },
    headers: await headers(),
  });

  await logAudit({
    actorId: Number(session.user.id),
    action: "user.unban",
    entityType: "user",
    entityId: Number(userId),
  });

  revalidatePath("/settings/users");
}

export async function deactivateUser(userId: string, reason?: string) {
  const session = await requireAdmin();

  await auth.api.banUser({
    body: {
      userId,
      banReason: reason || "계정 비활성화",
    },
    headers: await headers(),
  });

  await logAudit({
    actorId: Number(session.user.id),
    action: "user.deactivate",
    entityType: "user",
    entityId: Number(userId),
    detail: { reason: reason || "계정 비활성화" },
  });

  revalidatePath("/settings/users");
}
