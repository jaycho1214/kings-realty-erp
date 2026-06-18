"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/** Roles an admin can assign through the UI. */
export type AssignableRole = "admin" | "staff" | "accounting" | "pending";

export async function createUser(formData: FormData) {
  const session = await requireAdmin();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;
  const role = (formData.get("role") as string) || "staff";

  if (!email?.trim() || !password?.trim() || !name?.trim()) {
    throw new Error("필수 항목을 입력해주세요.");
  }

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
