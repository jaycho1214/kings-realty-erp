import { test } from "node:test";
import assert from "node:assert/strict";
import { nameSearchPatterns } from "./search";

test("nameSearchPatterns wraps a single token for a contains match", () => {
  assert.deepEqual(nameSearchPatterns("duran"), ["%duran%"]);
});

test("nameSearchPatterns makes word order irrelevant (one pattern per token)", () => {
  assert.deepEqual(nameSearchPatterns("smith john"), ["%smith%", "%john%"]);
});

test("nameSearchPatterns collapses surrounding and repeated whitespace", () => {
  assert.deepEqual(nameSearchPatterns("  john   smith \t"), [
    "%john%",
    "%smith%",
  ]);
});

test("nameSearchPatterns returns [] for empty or whitespace-only input", () => {
  assert.deepEqual(nameSearchPatterns(""), []);
  assert.deepEqual(nameSearchPatterns("   "), []);
});

test("nameSearchPatterns escapes LIKE wildcards so they match literally", () => {
  assert.deepEqual(nameSearchPatterns("50%_off"), ["%50\\%\\_off%"]);
});
