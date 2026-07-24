"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { parseForm } from "@/lib/schemas/parse";
import {
  utilityTypeSchema,
  serviceCategorySchema,
  serviceCategoryLabelSchema,
  exchangeVendorSchema,
  realtyFeeDefaultSchema,
} from "@/lib/schemas/settings";
import { ValidationError } from "@/lib/validation-error";
import { runAction, type FormState } from "@/lib/form-action";

// --- OHA rate table (OHA 기준표) ---

/**
 * Bulk in-place amount update for the grouped OHA table. Reads
 * `amount__{code}__{with|without}` fields and updates each current row
 * (effective_to is null). Shared by the Settings master and the tenant
 * 지원금 popover. Admin-only.
 */
export async function updateOhaRates(formData: FormData): Promise<FormState> {
  return runAction(async () => {
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
        throw new ValidationError("금액을 올바르게 입력해주세요.");
      }
      updates.push({
        code: m[1],
        dependent_status: m[2] as "with" | "without",
        amount,
      });
    }

    // Independent per-row updates — run them concurrently instead of awaiting each
    // serially (the grouped table is ~20-30 rows = that many round-trips).
    await Promise.all(
      updates.map((u) =>
        db
          .updateTable("oha_rate")
          .set({ amount: String(u.amount) })
          .where("code", "=", u.code)
          .where("dependent_status", "=", u.dependent_status)
          .where("region", "=", "Default")
          .where("effective_to", "is", null)
          .execute(),
      ),
    );

    revalidatePath("/settings");
    revalidatePath("/tenants", "layout");
  });
}

// --- Realty fee defaults (중개 수수료 기본값) ---

export async function updateRealtyFeeDefault(
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();
    const db = getDb();
    const { currency, amount } = parseForm(realtyFeeDefaultSchema, formData);
    await db
      .updateTable("realty_fee_default")
      .set({ amount: String(amount), updated_at: new Date() })
      .where("currency", "=", currency)
      .execute();
    revalidatePath("/settings");
  });
}

// --- Exchange vendors (환전업체) ---

export async function addExchangeVendor(
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();

    const db = getDb();
    const { name, denominations, default_rate, phone, memo } = parseForm(
      exchangeVendorSchema,
      formData,
    );
    const defaultRate = default_rate == null ? null : String(default_rate);

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
  });
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

export async function addUtilityType(formData: FormData): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();

    const db = getDb();
    const { name } = parseForm(utilityTypeSchema, formData);

    await db
      .insertInto("utility_type")
      .values({
        name,
        is_default: false,
      })
      .execute();

    revalidatePath("/settings");
  });
}

export async function updateUtilityType(
  id: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();

    const db = getDb();
    const { name } = parseForm(utilityTypeSchema, formData);

    await db
      .updateTable("utility_type")
      .set({ name })
      .where("id", "=", id)
      .execute();

    revalidatePath("/settings");
  });
}

export async function deleteUtilityType(id: number): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();

    const db = getDb();

    const utilityType = await db
      .selectFrom("utility_type")
      .select(["is_default"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (!utilityType) {
      throw new ValidationError("유틸리티 유형을 찾을 수 없습니다.");
    }

    if (utilityType.is_default) {
      throw new ValidationError("기본 유형은 삭제할 수 없습니다.");
    }

    // Check if any utility bills reference this type
    const usage = await db
      .selectFrom("utility_bill")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("utility_type_id", "=", id)
      .executeTakeFirstOrThrow();

    if (Number(usage.count) > 0) {
      throw new ValidationError("사용 중인 유형은 삭제할 수 없습니다.");
    }

    await db.deleteFrom("utility_type").where("id", "=", id).execute();

    revalidatePath("/settings");
  });
}

export async function addServiceCategory(
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();

    const db = getDb();
    const { value, label } = parseForm(serviceCategorySchema, formData);

    await db
      .insertInto("service_category")
      .values({
        value: value.toLowerCase().replace(/\s+/g, "_"),
        label,
        is_default: false,
      })
      .execute();

    revalidatePath("/settings");
    revalidatePath("/services");
  });
}

export async function updateServiceCategory(
  id: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();

    const db = getDb();
    const { label } = parseForm(serviceCategoryLabelSchema, formData);

    await db
      .updateTable("service_category")
      .set({ label })
      .where("id", "=", id)
      .execute();

    revalidatePath("/settings");
    revalidatePath("/services");
  });
}

export async function deleteServiceCategory(id: number): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();

    const db = getDb();

    const category = await db
      .selectFrom("service_category")
      .select(["value", "is_default"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (!category) {
      throw new ValidationError("카테고리를 찾을 수 없습니다.");
    }

    if (category.is_default) {
      throw new ValidationError("기본 카테고리는 삭제할 수 없습니다.");
    }

    // Check if any service requests use this category
    const usage = await db
      .selectFrom("service_request")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("category", "=", category.value)
      .executeTakeFirstOrThrow();

    if (Number(usage.count) > 0) {
      throw new ValidationError("사용 중인 카테고리는 삭제할 수 없습니다.");
    }

    await db.deleteFrom("service_category").where("id", "=", id).execute();

    revalidatePath("/settings");
    revalidatePath("/services");
  });
}
