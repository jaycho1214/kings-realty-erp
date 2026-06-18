import type { InspectionSnapshot, ItemStatus, SnapshotItem } from "./types";

export interface ComparisonRow {
  key: string;
  instance: number | null;
  label_ko: string;
  from: ItemStatus;
  to: ItemStatus;
  worsened: boolean;
}

const SEVERITY: Record<ItemStatus, number> = {
  na: 0,
  good: 1,
  issue: 2,
  damage: 3,
};

function indexItems(
  snap: InspectionSnapshot,
): Map<string, { item: SnapshotItem; key: string; instance: number | null }> {
  const map = new Map<
    string,
    { item: SnapshotItem; key: string; instance: number | null }
  >();
  for (const sec of snap.sections) {
    for (const item of sec.items) {
      // Prefer the stable id; fall back to a (section,instance,label) key so a
      // template change between move-in/out still matches by label.
      const idKey = item.id;
      const labelKey = `${sec.key}:${sec.instance ?? 0}:${item.label_ko}`;
      map.set(idKey, { item, key: sec.key, instance: sec.instance });
      if (!map.has(labelKey)) {
        map.set(labelKey, { item, key: sec.key, instance: sec.instance });
      }
    }
  }
  return map;
}

export function compareInspections(
  moveIn: InspectionSnapshot,
  moveOut: InspectionSnapshot,
): ComparisonRow[] {
  const inIdx = indexItems(moveIn);
  const rows: ComparisonRow[] = [];
  const seen = new Set<string>();

  for (const sec of moveOut.sections) {
    for (const item of sec.items) {
      const idKey = item.id;
      const labelKey = `${sec.key}:${sec.instance ?? 0}:${item.label_ko}`;
      const match = inIdx.get(idKey) ?? inIdx.get(labelKey);
      if (!match) continue;
      if (seen.has(labelKey)) continue;
      seen.add(labelKey);
      const from = match.item.status;
      const to = item.status;
      rows.push({
        key: sec.key,
        instance: sec.instance,
        label_ko: item.label_ko,
        from,
        to,
        worsened: SEVERITY[to] > SEVERITY[from],
      });
    }
  }
  return rows;
}
