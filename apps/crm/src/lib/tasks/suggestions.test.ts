import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSuggestions } from "./suggestions";
import type { SuggestedTask } from "./types";

const TODAY = "2026-06-17";

function cand(dedupKey: string): SuggestedTask {
  return {
    dedupKey,
    kind: "lease_expiry",
    title: dedupKey,
    dueDate: null,
    refEntityType: "lease",
    refEntityId: 1,
    suggestedAssigneeIds: [],
  };
}

test("drops candidates already an active task", () => {
  const out = filterSuggestions(
    [cand("a"), cand("b")],
    new Set(["a"]),
    new Map(),
    TODAY,
  );
  assert.deepEqual(out.map((c) => c.dedupKey), ["b"]);
});

test("drops permanently dismissed candidates", () => {
  const out = filterSuggestions(
    [cand("a"), cand("b")],
    new Set(),
    new Map([["a", null]]),
    TODAY,
  );
  assert.deepEqual(out.map((c) => c.dedupKey), ["b"]);
});

test("drops candidates still snoozed (until > today)", () => {
  const out = filterSuggestions(
    [cand("a"), cand("b")],
    new Set(),
    new Map([["a", "2026-06-25"]]),
    TODAY,
  );
  assert.deepEqual(out.map((c) => c.dedupKey), ["b"]);
});

test("keeps candidates whose snooze has expired (until <= today)", () => {
  const out = filterSuggestions(
    [cand("a")],
    new Set(),
    new Map([["a", "2026-06-10"]]),
    TODAY,
  );
  assert.deepEqual(out.map((c) => c.dedupKey), ["a"]);
});
