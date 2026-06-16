"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/authz";

/** Roles an admin can assign through the UI. */
export type AssignableRole = "admin" | "staff" | "accounting" | "pending";

export async function createUser(formData: FormData) {
  await requireAdmin();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;
  const role = (formData.get("role") as string) || "staff";

  if (!email?.trim() || !password?.trim() || !name?.trim()) {
    throw new Error("필수 항목을 입력해주세요.");
  }

  await auth.api.createUser({
    body: {
      email,
      password,
      name,
      role: role as AssignableRole,
    },
    headers: await headers(),
  });

  revalidatePath("/settings/users");
}

export async function approveUser(userId: string) {
  await requireAdmin();

  await auth.api.setRole({
    body: { userId, role: "staff" as "admin" | "staff" | "pending" },
    headers: await headers(),
  });

  revalidatePath("/settings/users");
}

export async function rejectUser(userId: string) {
  await requireAdmin();

  await auth.api.banUser({
    body: { userId, banReason: "가입 승인 거절" },
    headers: await headers(),
  });

  revalidatePath("/settings/users");
}

export async function setUserRole(
  userId: string,
  role: "admin" | "staff" | "accounting",
) {
  await requireAdmin();

  await auth.api.setRole({
    body: { userId, role: role as AssignableRole },
    headers: await headers(),
  });

  revalidatePath("/settings/users");
}

export async function banUser(userId: string, reason?: string) {
  await requireAdmin();

  await auth.api.banUser({
    body: {
      userId,
      ...(reason ? { banReason: reason } : {}),
    },
    headers: await headers(),
  });

  revalidatePath("/settings/users");
}

export async function unbanUser(userId: string) {
  await requireAdmin();

  await auth.api.unbanUser({
    body: { userId },
    headers: await headers(),
  });

  revalidatePath("/settings/users");
}

export async function deactivateUser(userId: string, reason?: string) {
  await requireAdmin();

  await auth.api.banUser({
    body: {
      userId,
      banReason: reason || "계정 비활성화",
    },
    headers: await headers(),
  });

  revalidatePath("/settings/users");
}
