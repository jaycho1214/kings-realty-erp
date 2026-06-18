import { test } from "node:test";
import assert from "node:assert/strict";
import { compareInspections } from "./compare";
import type { InspectionSnapshot } from "./types";

function snap(status1: string, status2: string): InspectionSnapshot {
  return {
    version: 1,
    notes: "",
    reminders_ack: false,
    sections: [
      {
        key: "bedroom",
        label_ko: "방",
        label_en: null,
        instance: 1,
        items: [
          { id: "bedroom:1:1", subgroup_ko: null, subgroup_en: null, label_ko: "벽지", label_en: null, status: status1 as never, note: "", photos: [] },
          { id: "bedroom:1:2", subgroup_ko: null, subgroup_en: null, label_ko: "바닥", label_en: null, status: status2 as never, note: "", photos: [] },
        ],
      },
    ],
  };
}

test("worsened items are flagged, unchanged are not", () => {
  const rows = compareInspections(snap("good", "good"), snap("damage", "good"));
  assert.equal(rows.length, 2);
  const wall = rows.find((r) => r.label_ko === "벽지")!;
  const floor = rows.find((r) => r.label_ko === "바닥")!;
  assert.equal(wall.worsened, true);
  assert.equal(wall.from, "good");
  assert.equal(wall.to, "damage");
  assert.equal(floor.worsened, false);
});

test("improvement (damage→good) is not worsened", () => {
  const rows = compareInspections(snap("damage", "good"), snap("good", "good"));
  assert.equal(rows.find((r) => r.label_ko === "벽지")!.worsened, false);
});

test("items only present in one inspection are skipped", () => {
  const moveIn = snap("good", "good");
  const moveOut: InspectionSnapshot = { ...snap("good", "good"), sections: [] };
  const rows = compareInspections(moveIn, moveOut);
  assert.equal(rows.length, 0);
});
