"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requirePermission,
  requireSensitiveAccess,
  canViewSensitive,
} from "@/lib/authz";
import { encryptRrn, decryptRrn, formatRrn } from "@/lib/rrn";
import { logAudit } from "@/lib/audit";

export async function createLandlord(formData: FormData) {
  const session = await requirePermission("landlord", "create");

  const db = getDb();

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = (formData.get("email") as string) || null;
  const address = (formData.get("address") as string) || null;
  const business_type = (formData.get("business_type") as string) || null;
  const sex = (formData.get("sex") as string) || null;
  const birth = (formData.get("birth") as string) || null;
  const bank_name = (formData.get("bank_name") as string) || null;
  const bank_account = (formData.get("bank_account") as string) || null;
  const account_holder = (formData.get("account_holder") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  // RRN is only accepted from privileged users (admin/accounting).
  const canRrn = canViewSensitive(session.user.role);
  const rrnRaw = formData.get("rrn");
  const rrn_encrypted =
    canRrn && typeof rrnRaw === "string" && rrnRaw.trim()
      ? encryptRrn(rrnRaw)
      : null;

  await db
    .insertInto("landlord")
    .values({
      name,
      phone,
      email,
      address,
      business_type,
      sex,
      birth,
      bank_name,
      bank_account,
      account_holder,
      rrn_encrypted,
      notes,
      created_by: Number(session.user.id),
    })
    .execute();

  revalidatePath("/landlords");
  redirect("/landlords");
}

export async function updateLandlord(id: number, formData: FormData) {
  const session = await requirePermission("landlord", "update");

  const db = getDb();

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = (formData.get("email") as string) || null;
  const address = (formData.get("address") as string) || null;
  const business_type = (formData.get("business_type") as string) || null;
  const sex = (formData.get("sex") as string) || null;
  const birth = (formData.get("birth") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  const values: Record<string, unknown> = {
    name,
    phone,
    email,
    address,
    business_type,
    sex,
    birth,
    notes,
    updated_at: new Date(),
  };

  // Bank details are sensitive (admin/accounting only). Non-privileged editors
  // don't get the inputs, so never let them overwrite the stored values — only
  // apply bank fields when the caller may view/edit sensitive data.
  if (canViewSensitive(session.user.role)) {
    values.bank_name = (formData.get("bank_name") as string) || null;
    values.bank_account = (formData.get("bank_account") as string) || null;
    values.account_holder = (formData.get("account_holder") as string) || null;
  }

  // Only privileged users can touch RRN. A non-empty value replaces it; a blank
  // value preserves the existing RRN (the field is never prefilled, so blank =
  // "no change"). An explicit clear flag wipes it.
  if (canViewSensitive(session.user.role) && formData.has("rrn")) {
    const rrnRaw = (formData.get("rrn") as string).trim();
    if (formData.get("rrn_clear") === "1") {
      values.rrn_encrypted = null;
    } else if (rrnRaw) {
      values.rrn_encrypted = encryptRrn(rrnRaw);
    }
  }

  await db.updateTable("landlord").set(values).where("id", "=", id).execute();

  revalidatePath("/landlords");
  redirect(`/landlords/${id}`);
}

/**
 * Decrypt and return a landlord's RRN as `######-#######`. Admin/accounting
 * only; every successful reveal is recorded in `audit_log`.
 */
export async function revealLandlordRrn(
  id: number,
): Promise<{ rrn: string } | { error: string }> {
  const session = await requireSensitiveAccess();
  const db = getDb();

  const row = await db
    .selectFrom("landlord")
    .select(["rrn_encrypted"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row?.rrn_encrypted) {
    return { error: "등록된 주민등록번호가 없습니다." };
  }

  let plain: string;
  try {
    plain = decryptRrn(row.rrn_encrypted);
  } catch {
    return { error: "복호화에 실패했습니다." };
  }

  await logAudit({
    actorId: Number(session.user.id),
    action: "landlord.rrn.reveal",
    entityType: "landlord",
    entityId: id,
  });

  return { rrn: formatRrn(plain) };
}

/**
 * Decrypt and return a co-lessor (landlord family member)'s RRN. Admin/
 * accounting only; every reveal is audit-logged.
 */
export async function revealLandlordFamilyMemberRrn(
  id: number,
): Promise<{ rrn: string } | { error: string }> {
  const session = await requireSensitiveAccess();
  const db = getDb();

  const row = await db
    .selectFrom("landlord_family_member")
    .select(["rrn_encrypted"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row?.rrn_encrypted) {
    return { error: "등록된 주민등록번호가 없습니다." };
  }

  let plain: string;
  try {
    plain = decryptRrn(row.rrn_encrypted);
  } catch {
    return { error: "복호화에 실패했습니다." };
  }

  await logAudit({
    actorId: Number(session.user.id),
    action: "landlord_family_member.rrn.reveal",
    entityType: "landlord_family_member",
    entityId: id,
  });

  return { rrn: formatRrn(plain) };
}

// --- Landlord Family Members ---

export async function addLandlordFamilyMember(
  landlordId: number,
  formData: FormData,
) {
  const session = await requirePermission("landlord", "update");

  const db = getDb();

  const name = formData.get("name") as string;
  const relationship = formData.get("relationship") as string;
  const sex = (formData.get("sex") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  // RRN is only accepted from privileged users (admin/accounting).
  const rrnRaw = formData.get("rrn");
  const rrn_encrypted =
    canViewSensitive(session.user.role) &&
    typeof rrnRaw === "string" &&
    rrnRaw.trim()
      ? encryptRrn(rrnRaw)
      : null;

  await db
    .insertInto("landlord_family_member")
    .values({
      landlord_id: landlordId,
      name,
      relationship,
      sex,
      phone,
      notes,
      rrn_encrypted,
    })
    .execute();

  revalidatePath(`/landlords/${landlordId}`);
}

export async function deleteLandlordFamilyMember(
  id: number,
  landlordId: number,
) {
  await requirePermission("landlord", "update");

  const db = getDb();

  await db.deleteFrom("landlord_family_member").where("id", "=", id).execute();

  revalidatePath(`/landlords/${landlordId}`);
}

// --- Landlord Settlements ---

export async function createLandlordSettlement(
  landlordId: number,
  formData: FormData,
) {
  const session = await requireSensitiveAccess();

  const db = getDb();

  const amount = Number(formData.get("amount"));
  const date = formData.get("date") as string;
  const description = (formData.get("description") as string) || "임대인 정산";

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }
  if (!date || Number.isNaN(new Date(date).getTime())) {
    throw new Error("날짜를 올바르게 입력해주세요.");
  }

  await db
    .insertInto("ledger_entry")
    .values({
      entry_type: "expense",
      direction: "disbursement",
      category: "rent_expense",
      amount_krw: String(amount),
      description,
      entry_date: date,
      reference_type: "landlord",
      reference_id: landlordId,
      recorded_by: Number(session.user.id),
    })
    .execute();

  revalidatePath(`/landlords/${landlordId}`);
}

export async function deleteLandlord(id: number) {
  await requirePermission("landlord", "delete");

  const db = getDb();

  const properties = await db
    .selectFrom("property")
    .select(({ fn }) => fn.countAll<number>().as("c"))
    .where("landlord_id", "=", id)
    .executeTakeFirst();

  if (Number(properties?.c ?? 0) > 0) {
    throw new Error("매물이 연결된 임대인은 삭제할 수 없습니다.");
  }

  await db.deleteFrom("landlord").where("id", "=", id).execute();

  revalidatePath("/landlords");
  redirect("/landlords");
}
