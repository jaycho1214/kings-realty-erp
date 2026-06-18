export type ItemStatus = "na" | "good" | "issue" | "damage";

export interface PhotoRef {
  id: number;
  url: string; // always "/api/documents/{id}"
}

export interface SnapshotItem {
  id: string;
  subgroup_ko: string | null;
  subgroup_en: string | null;
  label_ko: string;
  label_en: string | null;
  status: ItemStatus;
  note: string;
  photos: PhotoRef[];
}

export interface SnapshotSection {
  key: string;
  label_ko: string;
  label_en: string | null;
  instance: number | null; // null = singleton; 1..n = repeated room
  items: SnapshotItem[];
}

export interface InspectionSnapshot {
  version: 1;
  sections: SnapshotSection[];
  notes: string;
  reminders_ack: boolean;
}

export interface TemplateSection {
  id: number;
  key: string;
  label_ko: string;
  label_en: string | null;
  repeatable: boolean;
  sort_order: number;
}

export interface TemplateItem {
  id: number;
  section_id: number;
  subgroup_ko: string | null;
  subgroup_en: string | null;
  label_ko: string;
  label_en: string | null;
  sort_order: number;
}
