import { getDb } from "@kingsrealty/db";
import { requireAdmin } from "@/lib/authz";
import { TemplateEditor } from "./_components/template-editor";

export default async function InspectionChecklistSettingsPage() {
  await requireAdmin();
  const db = getDb();

  const [sections, items] = await Promise.all([
    db
      .selectFrom("inspection_section")
      .select(["id", "key", "label_ko", "label_en", "repeatable", "sort_order"])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("inspection_item")
      .select([
        "id",
        "section_id",
        "subgroup_ko",
        "subgroup_en",
        "label_ko",
        "label_en",
        "sort_order",
      ])
      .orderBy("sort_order", "asc")
      .execute(),
  ]);

  const itemsBySection = new Map<number, typeof items>();
  for (const it of items) {
    const arr = itemsBySection.get(it.section_id) ?? [];
    arr.push(it);
    itemsBySection.set(it.section_id, arr);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">점검 체크리스트 템플릿</h2>
        <p className="text-sm text-muted-foreground">
          입주/퇴거 점검의 기본 항목을 관리합니다. 수정은 새로 생성하는 점검에만
          적용되며, 기존 점검 기록은 변경되지 않습니다.
        </p>
      </div>
      <TemplateEditor
        sections={sections.map((s) => ({
          ...s,
          items: itemsBySection.get(s.id) ?? [],
        }))}
      />
    </div>
  );
}
