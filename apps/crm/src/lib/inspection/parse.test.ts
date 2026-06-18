import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSnapshot } from "./parse";

test("null returns an empty v1 snapshot", () => {
  const snap = parseSnapshot(null);
  assert.equal(snap.version, 1);
  assert.deepEqual(snap.sections, []);
  assert.equal(snap.notes, "");
});

test("new-shape JSON round-trips", () => {
  const input = JSON.stringify({
    version: 1,
    sections: [
      {
        key: "storage",
        label_ko: "창고",
        label_en: "STORAGE",
        instance: null,
        items: [
          {
            id: "storage:0:1",
            subgroup_ko: null,
            subgroup_en: null,
            label_ko: "데미지",
            label_en: "DAMAGE",
            status: "issue",
            note: "긁힘",
            photos: [],
          },
        ],
      },
    ],
    notes: "메모",
    reminders_ack: true,
  });
  const snap = parseSnapshot(input);
  assert.equal(snap.sections.length, 1);
  assert.equal(snap.sections[0].items[0].status, "issue");
  assert.equal(snap.notes, "메모");
  assert.equal(snap.reminders_ack, true);
});

test("legacy flat array becomes a single 기타 section", () => {
  const legacy = JSON.stringify([
    { area: "방", status: "good", note: "" },
    { area: "욕실", status: "damage", note: "타일 깨짐" },
  ]);
  const snap = parseSnapshot(legacy);
  assert.equal(snap.sections.length, 1);
  assert.equal(snap.sections[0].key, "legacy");
  assert.equal(snap.sections[0].label_ko, "기타");
  assert.equal(snap.sections[0].items.length, 2);
  assert.equal(snap.sections[0].items[1].status, "damage");
  assert.equal(snap.sections[0].items[1].label_ko, "욕실");
});

test("malformed JSON returns an empty snapshot", () => {
  const snap = parseSnapshot("not json{");
  assert.deepEqual(snap.sections, []);
});
