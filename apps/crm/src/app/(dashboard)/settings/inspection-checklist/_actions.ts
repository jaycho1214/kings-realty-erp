"use server";

import { getDb, sql } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";

const PATH = "/settings/inspection-checklist";

function reqStr(fd: FormData, name: string): string {
  const v = (fd.get(name) as string | null)?.trim();
  if (!v) throw new Error("필수 항목을 입력해주세요.");
  return v;
}
function optStr(fd: FormData, name: string): string | null {
  const v = (fd.get(name) as string | null)?.trim();
  return v ? v : null;
}

export async function addSection(formData: FormData) {
  await requireAdmin();
  const db = getDb();
  const label_ko = reqStr(formData, "label_ko");
  const max = await db
    .selectFrom("inspection_section")
    .select(sql<number>`coalesce(max(sort_order), -1)`.as("m"))
    .executeTakeFirst();
  await db
    .insertInto("inspection_section")
    .values({
      key: `custom_${Date.now()}`,
      label_ko,
      label_en: optStr(formData, "label_en"),
      repeatable: formData.get("repeatable") === "on",
      sort_order: Number(max?.m ?? -1) + 1,
      is_builtin: false,
    })
    .execute();
  revalidatePath(PATH);
}

export async function updateSection(id: number, formData: FormData) {
  await requireAdmin();
  const db = getDb();
  await db
    .updateTable("inspection_section")
    .set({
      label_ko: reqStr(formData, "label_ko"),
      label_en: optStr(formData, "label_en"),
      repeatable: formData.get("repeatable") === "on",
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath(PATH);
}

export async function deleteSection(id: number) {
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
    throw new Error("기본 점검 항목 그룹은 삭제할 수 없습니다.");
  }
  // inspection_item has ON DELETE CASCADE, so child rows go with it.
  await db.deleteFrom("inspection_section").where("id", "=", id).execute();
  revalidatePath(PATH);
}

export async function addItem(sectionId: number, formData: FormData) {
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
      label_ko: reqStr(formData, "label_ko"),
      label_en: optStr(formData, "label_en"),
      subgroup_ko: optStr(formData, "subgroup_ko"),
      subgroup_en: optStr(formData, "subgroup_en"),
      sort_order: Number(max?.m ?? -1) + 1,
    })
    .execute();
  revalidatePath(PATH);
}

export async function updateItem(id: number, formData: FormData) {
  await requireAdmin();
  const db = getDb();
  await db
    .updateTable("inspection_item")
    .set({
      label_ko: reqStr(formData, "label_ko"),
      label_en: optStr(formData, "label_en"),
      subgroup_ko: optStr(formData, "subgroup_ko"),
      subgroup_en: optStr(formData, "subgroup_en"),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath(PATH);
}

export async function deleteItem(id: number) {
  await requireAdmin();
  const db = getDb();
  await db.deleteFrom("inspection_item").where("id", "=", id).execute();
  revalidatePath(PATH);
}
