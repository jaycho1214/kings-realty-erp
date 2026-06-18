import type { InspectionSnapshot, ItemStatus, SnapshotItem } from "./types";

const STATUSES: ItemStatus[] = ["na", "good", "issue", "damage"];

function emptySnapshot(): InspectionSnapshot {
  return { version: 1, sections: [], notes: "", reminders_ack: false };
}

function coerceStatus(v: unknown): ItemStatus {
  return STATUSES.includes(v as ItemStatus) ? (v as ItemStatus) : "na";
}

export function parseSnapshot(json: string | null): InspectionSnapshot {
  if (!json) return emptySnapshot();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return emptySnapshot();
  }

  // Legacy flat array: [{ area, status, note }]
  if (Array.isArray(parsed)) {
    const items: SnapshotItem[] = parsed.map((raw, i) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {
        id: `legacy:0:${i}`,
        subgroup_ko: null,
        subgroup_en: null,
        label_ko: String(r.area ?? "항목"),
        label_en: null,
        status: coerceStatus(r.status),
        note: String(r.note ?? ""),
        photos: [],
      };
    });
    return {
      version: 1,
      sections: [
        { key: "legacy", label_ko: "기타", label_en: null, instance: null, items },
      ],
      notes: "",
      reminders_ack: false,
    };
  }

  if (parsed && typeof parsed === "object" && "sections" in parsed) {
    const obj = parsed as Partial<InspectionSnapshot>;
    return {
      version: 1,
      sections: Array.isArray(obj.sections) ? obj.sections : [],
      notes: typeof obj.notes === "string" ? obj.notes : "",
      reminders_ack: Boolean(obj.reminders_ack),
    };
  }

  return emptySnapshot();
}
