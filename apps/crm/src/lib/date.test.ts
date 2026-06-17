import { test } from "node:test";
import assert from "node:assert/strict";
import { seoulWeekEnd } from "./date";

test("seoulWeekEnd returns the upcoming Sunday", () => {
  // 2026-06-17 is a Wednesday → upcoming Sunday is 2026-06-21
  assert.equal(seoulWeekEnd("2026-06-17"), "2026-06-21");
});

test("seoulWeekEnd returns same day when already Sunday", () => {
  assert.equal(seoulWeekEnd("2026-06-21"), "2026-06-21");
});

test("seoulWeekEnd handles Saturday (one day to Sunday)", () => {
  assert.equal(seoulWeekEnd("2026-06-20"), "2026-06-21");
});
