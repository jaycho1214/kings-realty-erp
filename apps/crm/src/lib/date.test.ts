import { test } from "node:test";
import assert from "node:assert/strict";
import { seoulWeekEnd, addMonths, monthsBetween } from "./date";

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

test("addMonths adds whole months keeping the day", () => {
  assert.equal(addMonths("2026-01-15", 12), "2027-01-15");
});

test("addMonths clamps an overflowing day to the month's last day", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});

test("monthsBetween counts calendar months end minus start", () => {
  assert.equal(monthsBetween("2026-01-15", "2027-01-15"), 12);
  assert.equal(monthsBetween("2026-03-01", "2026-09-01"), 6);
});
