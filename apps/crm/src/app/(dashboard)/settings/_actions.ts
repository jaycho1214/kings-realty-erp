"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";

// --- OHA rate table (OHA 기준표) ---

/**
 * Bulk in-place amount update for the grouped OHA table. Reads
 * `amount__{code}__{with|without}` fields and updates each current row
 * (effective_to is null). Shared by the Settings master and the tenant
 * 지원금 popover. Admin-only.
 */
export async function updateOhaRates(formData: FormData) {
  await requireAdmin();
  const db = getDb();

  const updates: {
    code: string;
    dependent_status: "with" | "without";
    amount: number;
  }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^amount__(.+)__(with|without)$/.exec(key);
    if (!m) continue;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("금액을 올바르게 입력해주세요.");
    }
    updates.push({
      code: m[1],
      dependent_status: m[2] as "with" | "without",
      amount,
    });
  }

  for (const u of updates) {
    await db
      .updateTable("oha_rate")
      .set({ amount: String(u.amount) })
      .where("code", "=", u.code)
      .where("dependent_status", "=", u.dependent_status)
      .where("region", "=", "Default")
      .where("effective_to", "is", null)
      .execute();
  }

  revalidatePath("/settings");
  revalidatePath("/tenants", "layout");
}

// --- Realty fee defaults (중개 수수료 기본값) ---

export async function updateRealtyFeeDefault(formData: FormData) {
  await requireAdmin();
  const db = getDb();
  const currency = formData.get("currency") === "USD" ? "USD" : "KRW";
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }
  await db
    .updateTable("realty_fee_default")
    .set({ amount: String(amount), updated_at: new Date() })
    .where("currency", "=", currency)
    .execute();
  revalidatePath("/settings");
}

// --- Exchange vendors (환전업체) ---

export async function addExchangeVendor(formData: FormData) {
  await requireAdmin();

  const db = getDb();
  const name = (formData.get("name") as string)?.trim();
  const denominations =
    (formData.get("denominations") as string)?.trim() || null;
  const defaultRateRaw = (formData.get("default_rate") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const memo = (formData.get("memo") as string)?.trim() || null;

  if (!name) {
    throw new Error("환전업체 이름을 입력해주세요.");
  }

  let defaultRate: string | null = null;
  if (defaultRateRaw) {
    const rate = Number(defaultRateRaw);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("기준 환율을 올바르게 입력해주세요.");
    }
    defaultRate = String(rate);
  }

  await db
    .insertInto("exchange_vendor")
    .values({
      name,
      denominations,
      default_rate: defaultRate,
      phone,
      memo,
    })
    .execute();

  revalidatePath("/settings");
}

export async function deleteExchangeVendor(id: number) {
  await requireAdmin();

  const db = getDb();
  // Soft-disable rather than hard-delete (rows may be referenced by the ledger).
  await db
    .updateTable("exchange_vendor")
    .set({ is_active: false })
    .where("id", "=", id)
    .execute();

  revalidatePath("/settings");
}

export async function addUtilityType(formData: FormData) {
  await requireAdmin();

  const db = getDb();
  const name = formData.get("name") as string;

  if (!name?.trim()) {
    throw new Error("유형 이름을 입력해주세요.");
  }

  await db
    .insertInto("utility_type")
    .values({
      name: name.trim(),
      is_default: false,
    })
    .execute();

  revalidatePath("/settings");
}

export async function deleteUtilityType(id: number) {
  await requireAdmin();

  const db = getDb();

  const utilityType = await db
    .selectFrom("utility_type")
    .select(["is_default"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!utilityType) {
    throw new Error("유틸리티 유형을 찾을 수 없습니다.");
  }

  if (utilityType.is_default) {
    throw new Error("기본 유형은 삭제할 수 없습니다.");
  }

  // Check if any utility bills reference this type
  const usage = await db
    .selectFrom("utility_bill")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("utility_type_id", "=", id)
    .executeTakeFirstOrThrow();

  if (Number(usage.count) > 0) {
    throw new Error("사용 중인 유형은 삭제할 수 없습니다.");
  }

  await db.deleteFrom("utility_type").where("id", "=", id).execute();

  revalidatePath("/settings");
}

export async function addServiceCategory(formData: FormData) {
  await requireAdmin();

  const db = getDb();
  const value = formData.get("value") as string;
  const label = formData.get("label") as string;

  if (!value?.trim() || !label?.trim()) {
    throw new Error("카테고리 값과 이름을 입력해주세요.");
  }

  await db
    .insertInto("service_category")
    .values({
      value: value.trim().toLowerCase().replace(/\s+/g, "_"),
      label: label.trim(),
      is_default: false,
    })
    .execute();

  revalidatePath("/settings");
  revalidatePath("/services");
}

export async function updateServiceCategory(id: number, formData: FormData) {
  await requireAdmin();

  const db = getDb();
  const label = formData.get("label") as string;

  if (!label?.trim()) {
    throw new Error("카테고리 이름을 입력해주세요.");
  }

  await db
    .updateTable("service_category")
    .set({ label: label.trim() })
    .where("id", "=", id)
    .execute();

  revalidatePath("/settings");
  revalidatePath("/services");
}

export async function deleteServiceCategory(id: number) {
  await requireAdmin();

  const db = getDb();

  const category = await db
    .selectFrom("service_category")
    .select(["value", "is_default"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!category) {
    throw new Error("카테고리를 찾을 수 없습니다.");
  }

  if (category.is_default) {
    throw new Error("기본 카테고리는 삭제할 수 없습니다.");
  }

  // Check if any service requests use this category
  const usage = await db
    .selectFrom("service_request")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("category", "=", category.value)
    .executeTakeFirstOrThrow();

  if (Number(usage.count) > 0) {
    throw new Error("사용 중인 카테고리는 삭제할 수 없습니다.");
  }

  await db.deleteFrom("service_category").where("id", "=", id).execute();

  revalidatePath("/settings");
  revalidatePath("/services");
}
