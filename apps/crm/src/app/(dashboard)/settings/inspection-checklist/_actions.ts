"use server";

import { getDb, sql } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { parseForm } from "@/lib/schemas/parse";
import {
  inspectionSectionSchema,
  inspectionItemSchema,
} from "@/lib/schemas/settings";
import { ValidationError } from "@/lib/validation-error";
import { runAction, type FormState } from "@/lib/form-action";

const PATH = "/settings/inspection-checklist";

export async function addSection(formData: FormData): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();
    const db = getDb();
    const { label_ko, label_en, repeatable } = parseForm(
      inspectionSectionSchema,
      formData,
    );
    const max = await db
      .selectFrom("inspection_section")
      .select(sql<number>`coalesce(max(sort_order), -1)`.as("m"))
      .executeTakeFirst();
    await db
      .insertInto("inspection_section")
      .values({
        key: `custom_${Date.now()}`,
        label_ko,
        label_en,
        repeatable,
        sort_order: Number(max?.m ?? -1) + 1,
        is_builtin: false,
      })
      .execute();
    revalidatePath(PATH);
  });
}

export async function updateSection(
  id: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();
    const db = getDb();
    await db
      .updateTable("inspection_section")
      .set({
        ...parseForm(inspectionSectionSchema, formData),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
    revalidatePath(PATH);
  });
}

export async function deleteSection(id: number): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();
    const db = getDb();
    // Built-in (seeded) section groups are structural — protect them from
    // deletion. Their labels can still be edited via updateSection.
    const section = await db
      .selectFrom("inspection_section")
      .select("is_builtin")
      .where("id", "=", id)
      .executeTakeFirst();
    if (section?.is_builtin) {
      throw new ValidationError("기본 점검 항목 그룹은 삭제할 수 없습니다.");
    }
    // inspection_item has ON DELETE CASCADE, so child rows go with it.
    await db.deleteFrom("inspection_section").where("id", "=", id).execute();
    revalidatePath(PATH);
  });
}

export async function addItem(
  sectionId: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();
    const db = getDb();
    const max = await db
      .selectFrom("inspection_item")
      .select(sql<number>`coalesce(max(sort_order), -1)`.as("m"))
      .where("section_id", "=", sectionId)
      .executeTakeFirst();
    await db
      .insertInto("inspection_item")
      .values({
        section_id: sectionId,
        ...parseForm(inspectionItemSchema, formData),
        sort_order: Number(max?.m ?? -1) + 1,
      })
      .execute();
    revalidatePath(PATH);
  });
}

export async function updateItem(
  id: number,
  formData: FormData,
): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();
    const db = getDb();
    await db
      .updateTable("inspection_item")
      .set({
        ...parseForm(inspectionItemSchema, formData),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
    revalidatePath(PATH);
  });
}

export async function deleteItem(id: number) {
  await requireAdmin();
  const db = getDb();
  await db.deleteFrom("inspection_item").where("id", "=", id).execute();
  revalidatePath(PATH);
}
