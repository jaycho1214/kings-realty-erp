import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRoster } from "./tenant-roster";

type Row = {
  name: string;
  phone: string | null;
  status: string;
  deleted: boolean;
};

const mk = (over: Partial<Row> = {}): Row => ({
  name: "BOUCHER,Jeremy",
  phone: "010-8037-7805",
  status: "active",
  deleted: false,
  ...over,
});

test("view filters: active / inactive / all / deleted", () => {
  const rows = [
    mk(),
    mk({ name: "PHAM,hyh", status: "inactive" }),
    mk({ name: "Gone", deleted: true }),
  ];
  assert.deepEqual(
    filterRoster(rows, "", "active").map((r) => r.name),
    ["BOUCHER,Jeremy"],
  );
  assert.deepEqual(
    filterRoster(rows, "", "inactive").map((r) => r.name),
    ["PHAM,hyh"],
  );
  // 전체 = every non-deleted tenant regardless of status.
  assert.deepEqual(
    filterRoster(rows, "", "all").map((r) => r.name),
    ["BOUCHER,Jeremy", "PHAM,hyh"],
  );
  assert.deepEqual(
    filterRoster(rows, "", "deleted").map((r) => r.name),
    ["Gone"],
  );
});

test("name search is case-insensitive substring", () => {
  const rows = [mk(), mk({ name: "Tyler Perry" })];
  assert.deepEqual(
    filterRoster(rows, "boucher", "active").map((r) => r.name),
    ["BOUCHER,Jeremy"],
  );
  assert.equal(filterRoster(rows, "  perry ", "active").length, 1);
  assert.equal(filterRoster(rows, "zzz", "active").length, 0);
});

test("phone search matches on digits only, any formatting", () => {
  const rows = [mk(), mk({ name: "No Phone", phone: null })];
  assert.equal(filterRoster(rows, "8037", "active").length, 1);
  assert.equal(filterRoster(rows, "010-8037", "active").length, 1);
  // A numeric query must not crash on null phones.
  assert.equal(filterRoster(rows, "9999", "active").length, 0);
});

test("empty query returns the whole view", () => {
  const rows = [mk(), mk({ name: "B" })];
  assert.equal(filterRoster(rows, "   ", "active").length, 2);
});
