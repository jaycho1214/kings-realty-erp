import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLowPcPreference,
  parsePreference,
  resolveLowPc,
  LOW_PC_INIT_SCRIPT,
  LOW_PC_STORAGE_KEY,
  LOW_PC_ATTRIBUTE,
  REDUCED_MOTION_QUERY,
} from "./low-pc";

test("on/off force the mode regardless of the OS setting", () => {
  assert.equal(resolveLowPc("on", false), true);
  assert.equal(resolveLowPc("on", true), true);
  assert.equal(resolveLowPc("off", true), false);
  assert.equal(resolveLowPc("off", false), false);
});

test("auto follows the OS reduced-motion setting", () => {
  assert.equal(resolveLowPc("auto", true), true);
  assert.equal(resolveLowPc("auto", false), false);
});

test("unrecognized stored values fall back to auto", () => {
  assert.equal(parsePreference(null), "auto");
  assert.equal(parsePreference(""), "auto");
  assert.equal(parsePreference("ON"), "auto");
  assert.equal(parsePreference("true"), "auto");
  assert.equal(parsePreference("on"), "on");
  assert.equal(parsePreference("off"), "off");
  assert.equal(parsePreference("auto"), "auto");
});

test("isLowPcPreference accepts only the three states", () => {
  assert.equal(isLowPcPreference("auto"), true);
  assert.equal(isLowPcPreference("on"), true);
  assert.equal(isLowPcPreference("off"), true);
  assert.equal(isLowPcPreference("yes"), false);
  assert.equal(isLowPcPreference(undefined), false);
  assert.equal(isLowPcPreference(1), false);
});

// The pre-paint script duplicates resolveLowPc() in hand-written JS. These
// assertions are the guard that the two stay in step.
test("init script references the same key, attribute, and query", () => {
  assert.ok(LOW_PC_INIT_SCRIPT.includes(JSON.stringify(LOW_PC_STORAGE_KEY)));
  assert.ok(LOW_PC_INIT_SCRIPT.includes(JSON.stringify(LOW_PC_ATTRIBUTE)));
  assert.ok(LOW_PC_INIT_SCRIPT.includes(JSON.stringify(REDUCED_MOTION_QUERY)));
});

test("init script resolves the same way resolveLowPc does", () => {
  const run = (stored: string | null, reduceMotion: boolean) => {
    let attribute: string | null = null;
    const context = {
      localStorage: { getItem: () => stored },
      window: { matchMedia: () => ({ matches: reduceMotion }) },
      document: {
        documentElement: {
          setAttribute: (_name: string, value: string) => {
            attribute = value;
          },
        },
      },
    };
    new Function("localStorage", "window", "document", LOW_PC_INIT_SCRIPT)(
      context.localStorage,
      context.window,
      context.document,
    );
    return attribute === "on";
  };

  for (const reduceMotion of [true, false]) {
    assert.equal(run("on", reduceMotion), resolveLowPc("on", reduceMotion));
    assert.equal(run("off", reduceMotion), resolveLowPc("off", reduceMotion));
    assert.equal(run("auto", reduceMotion), resolveLowPc("auto", reduceMotion));
    // Unset / garbage must behave as auto, same as parsePreference.
    assert.equal(run(null, reduceMotion), resolveLowPc("auto", reduceMotion));
    assert.equal(
      run("bogus", reduceMotion),
      resolveLowPc("auto", reduceMotion),
    );
  }
});
