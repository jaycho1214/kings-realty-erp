import type {
  InspectionSnapshot,
  SnapshotSection,
  TemplateItem,
  TemplateSection,
} from "./types";

function instanceCount(
  key: string,
  counts: { rooms: number | null; bathrooms: number | null },
): number {
  if (key === "bedroom") {
    // 안방(master) covers the first bedroom; the rest are repeated "방".
    return counts.rooms != null ? Math.max(counts.rooms - 1, 0) : 1;
  }
  if (key === "bathroom") {
    return counts.bathrooms != null ? Math.max(counts.bathrooms, 1) : 1;
  }
  return 1;
}

export function buildInspectionSnapshot(
  sections: TemplateSection[],
  items: TemplateItem[],
  counts: { rooms: number | null; bathrooms: number | null },
): InspectionSnapshot {
  const bySection = new Map<number, TemplateItem[]>();
  for (const it of items) {
    const arr = bySection.get(it.section_id) ?? [];
    arr.push(it);
    bySection.set(it.section_id, arr);
  }

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const out: SnapshotSection[] = [];

  for (const sec of ordered) {
    const secItems = (bySection.get(sec.id) ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    const n = sec.repeatable ? instanceCount(sec.key, counts) : 1;
    for (let i = 0; i < n; i++) {
      const instance = sec.repeatable ? i + 1 : null;
      out.push({
        key: sec.key,
        label_ko: sec.label_ko,
        label_en: sec.label_en,
        instance,
        items: secItems.map((it) => ({
          id: `${sec.key}:${instance ?? 0}:${it.id}`,
          subgroup_ko: it.subgroup_ko,
          subgroup_en: it.subgroup_en,
          label_ko: it.label_ko,
          label_en: it.label_en,
          status: "na" as const,
          note: "",
          photos: [],
        })),
      });
    }
  }

  return { version: 1, sections: out, notes: "", reminders_ack: false };
}
