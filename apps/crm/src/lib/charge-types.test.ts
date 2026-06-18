import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChargeType } from "./charge-types";

test("known type resolves to its label + variant", () => {
  const map = { rent: { label: "월세", variant: "outline" as const } };
  assert.deepEqual(resolveChargeType(map, "rent"), {
    label: "월세",
    variant: "outline",
  });
});

test("unknown type falls back to the raw key with outline", () => {
  assert.deepEqual(resolveChargeType({}, "훅업피"), {
    label: "훅업피",
    variant: "outline",
  });
});
