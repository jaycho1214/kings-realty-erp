import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInspectionSnapshot } from "./snapshot";
import type { TemplateSection, TemplateItem } from "./types";

const sections: TemplateSection[] = [
  { id: 1, key: "master_bedroom", label_ko: "안방", label_en: "MASTER", repeatable: false, sort_order: 0 },
  { id: 2, key: "bedroom", label_ko: "방", label_en: "BEDROOM", repeatable: true, sort_order: 1 },
  { id: 3, key: "bathroom", label_ko: "화장실", label_en: "BATH", repeatable: true, sort_order: 2 },
];
const items: TemplateItem[] = [
  { id: 10, section_id: 1, subgroup_ko: "벽/천장", subgroup_en: "W", label_ko: "벽지", label_en: "WALL", sort_order: 0 },
  { id: 11, section_id: 2, subgroup_ko: null, subgroup_en: null, label_ko: "스위치", label_en: "SWITCH", sort_order: 0 },
  { id: 12, section_id: 3, subgroup_ko: null, subgroup_en: null, label_ko: "변기", label_en: "TOILET", sort_order: 0 },
];

test("singleton section appears once with instance null and na items", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: null, bathrooms: null });
  const master = snap.sections.filter((s) => s.key === "master_bedroom");
  assert.equal(master.length, 1);
  assert.equal(master[0].instance, null);
  assert.equal(master[0].items[0].status, "na");
  assert.equal(master[0].items[0].id, "master_bedroom:0:10");
});

test("bedroom count = rooms - 1 (master covers one); bathroom count = bathrooms", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: 4, bathrooms: 2 });
  assert.equal(snap.sections.filter((s) => s.key === "bedroom").length, 3);
  assert.equal(snap.sections.filter((s) => s.key === "bathroom").length, 2);
  const beds = snap.sections.filter((s) => s.key === "bedroom").map((s) => s.instance);
  assert.deepEqual(beds, [1, 2, 3]);
});

test("null counts default to 1 bedroom and 1 bathroom", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: null, bathrooms: null });
  assert.equal(snap.sections.filter((s) => s.key === "bedroom").length, 1);
  assert.equal(snap.sections.filter((s) => s.key === "bathroom").length, 1);
});

test("rooms = 1 yields zero extra bedrooms", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: 1, bathrooms: 1 });
  assert.equal(snap.sections.filter((s) => s.key === "bedroom").length, 0);
});

test("snapshot is version 1 with empty notes and reminders unacked", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: 2, bathrooms: 1 });
  assert.equal(snap.version, 1);
  assert.equal(snap.notes, "");
  assert.equal(snap.reminders_ack, false);
});
