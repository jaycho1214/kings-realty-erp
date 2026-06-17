import { test } from "node:test";
import assert from "node:assert/strict";
import { planBucket, plannedDateForBucket, midpointSortOrder } from "./board";

const TODAY = "2026-06-17";
const WEEK_END = "2026-06-21";

test("done within 7 days → done bucket", () => {
  assert.equal(
    planBucket(
      { status: "done", planned_date: null, completed_at: "2026-06-15T03:00:00Z" },
      TODAY,
      WEEK_END,
    ),
    "done",
  );
});

test("done older than 7 days → not shown (also 'done' bucket but caller hides)", () => {
  // planBucket still classifies by status; recency filtering is the caller's job.
  assert.equal(
    planBucket(
      { status: "done", planned_date: null, completed_at: "2026-06-01T03:00:00Z" },
      TODAY,
      WEEK_END,
    ),
    "done",
  );
});

test("planned today → today", () => {
  assert.equal(
    planBucket({ status: "todo", planned_date: "2026-06-17", completed_at: null }, TODAY, WEEK_END),
    "today",
  );
});

test("planned in the past (carried over) → today", () => {
  assert.equal(
    planBucket({ status: "todo", planned_date: "2026-06-10", completed_at: null }, TODAY, WEEK_END),
    "today",
  );
});

test("planned later this week → this_week", () => {
  assert.equal(
    planBucket({ status: "in_progress", planned_date: "2026-06-19", completed_at: null }, TODAY, WEEK_END),
    "this_week",
  );
});

test("planned after week end → later", () => {
  assert.equal(
    planBucket({ status: "todo", planned_date: "2026-06-30", completed_at: null }, TODAY, WEEK_END),
    "later",
  );
});

test("no planned date → later", () => {
  assert.equal(
    planBucket({ status: "todo", planned_date: null, completed_at: null }, TODAY, WEEK_END),
    "later",
  );
});

test("plannedDateForBucket maps each column", () => {
  assert.equal(plannedDateForBucket("today", TODAY, WEEK_END), TODAY);
  assert.equal(plannedDateForBucket("this_week", TODAY, WEEK_END), WEEK_END);
  assert.equal(plannedDateForBucket("later", TODAY, WEEK_END), null);
});

test("midpointSortOrder between neighbors and at the ends", () => {
  assert.equal(midpointSortOrder(2, 4), 3);
  assert.equal(midpointSortOrder(null, 4), 3); // before first
  assert.equal(midpointSortOrder(2, null), 3); // after last
  assert.equal(midpointSortOrder(null, null), 0); // empty column
});
