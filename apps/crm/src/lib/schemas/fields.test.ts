/**
 * Every form schema is built from these, so their edge cases are pinned here
 * rather than rediscovered per form. The cases that matter are the ones FormData
 * actually produces: a string, an empty string, or the key being absent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import * as f from "./fields";

const MSG = "메시지";

/** Parse a value the way a form field would arrive; `undefined` = absent key. */
function run<S extends z.ZodType>(schema: S, value: unknown) {
  const r = z
    .object({ v: schema })
    .safeParse(value === undefined ? {} : { v: value });
  return r.success
    ? { ok: true as const, data: (r.data as { v: unknown }).v }
    : { ok: false as const, message: r.error.issues[0].message };
}

test("id: rejects blank, absent, zero and non-numeric with our message", () => {
  for (const bad of ["", "   ", undefined, "0", "-1", "abc"]) {
    const r = run(f.id(MSG), bad);
    assert.equal(r.ok, false, `expected ${JSON.stringify(bad)} to fail`);
    assert.equal(r.message, MSG);
  }
  assert.deepEqual(run(f.id(MSG), "7"), { ok: true, data: 7 });
});

test("optionalId: blank and absent become null", () => {
  for (const blank of ["", "  ", undefined]) {
    assert.deepEqual(run(f.optionalId(), blank), { ok: true, data: null });
  }
  assert.deepEqual(run(f.optionalId(), "5"), { ok: true, data: 5 });
});

test("text: trims, and rejects blank or absent", () => {
  assert.deepEqual(run(f.text(MSG), "  홍길동  "), {
    ok: true,
    data: "홍길동",
  });
  for (const bad of ["", "   ", undefined]) {
    const r = run(f.text(MSG), bad);
    assert.equal(r.ok, false);
    assert.equal(r.message, MSG);
  }
});

test("optionalText: blank and absent become null, values are trimmed", () => {
  assert.deepEqual(run(f.optionalText(), "  1층 "), { ok: true, data: "1층" });
  for (const blank of ["", "   ", undefined]) {
    assert.deepEqual(run(f.optionalText(), blank), { ok: true, data: null });
  }
});

test("positiveAmount: zero and blank are rejected", () => {
  assert.deepEqual(run(f.positiveAmount(MSG), "1000"), {
    ok: true,
    data: 1000,
  });
  for (const bad of ["", undefined, "0", "-5", "abc"]) {
    const r = run(f.positiveAmount(MSG), bad);
    assert.equal(r.ok, false, `expected ${JSON.stringify(bad)} to fail`);
    assert.equal(r.message, MSG);
  }
});

test("amountOrZero: blank becomes 0, negatives are rejected", () => {
  for (const blank of ["", undefined]) {
    assert.deepEqual(run(f.amountOrZero(MSG), blank), { ok: true, data: 0 });
  }
  assert.deepEqual(run(f.amountOrZero(MSG), "0"), { ok: true, data: 0 });
  assert.deepEqual(run(f.amountOrZero(MSG), "250"), { ok: true, data: 250 });
  const neg = run(f.amountOrZero(MSG), "-5");
  assert.equal(neg.ok, false);
  assert.equal(neg.message, MSG);
});

test("date: real dates parse, blank and nonsense are rejected", () => {
  const ok = run(f.date(MSG), "2026-07-24");
  assert.equal(ok.ok, true);
  assert.ok(ok.data instanceof Date);
  for (const bad of ["", undefined, "not-a-date"]) {
    const r = run(f.date(MSG), bad);
    assert.equal(r.ok, false, `expected ${JSON.stringify(bad)} to fail`);
    assert.equal(r.message, MSG);
  }
});

test("ymd / optionalYmd enforce the YYYY-MM-DD shape", () => {
  assert.deepEqual(run(f.ymd(MSG), "2026-07-24"), {
    ok: true,
    data: "2026-07-24",
  });
  assert.equal(run(f.ymd(MSG), "2026/07/24").ok, false);
  assert.deepEqual(run(f.optionalYmd(MSG), ""), { ok: true, data: null });
  assert.equal(run(f.optionalYmd(MSG), "24-07-2026").ok, false);
});

test("optionalCount: blank → null, negatives and fractions rejected", () => {
  assert.deepEqual(run(f.optionalCount(MSG), ""), { ok: true, data: null });
  assert.deepEqual(run(f.optionalCount(MSG), "0"), { ok: true, data: 0 });
  assert.deepEqual(run(f.optionalCount(MSG), "3"), { ok: true, data: 3 });
  assert.equal(run(f.optionalCount(MSG), "-1").ok, false);
  assert.equal(run(f.optionalCount(MSG), "1.5").ok, false);
});

test("strictEnum rejects anything off the list; enumWithDefault falls back", () => {
  const strict = f.strictEnum(["active", "inactive"] as const, MSG);
  assert.deepEqual(run(strict, "active"), { ok: true, data: "active" });
  const bad = run(strict, "bogus");
  assert.equal(bad.ok, false);
  assert.equal(bad.message, MSG);

  const loose = f.enumWithDefault(["one_time", "monthly"] as const, "one_time");
  assert.deepEqual(run(loose, "monthly"), { ok: true, data: "monthly" });
  assert.deepEqual(run(loose, "bogus"), { ok: true, data: "one_time" });
  assert.deepEqual(run(loose, undefined), { ok: true, data: "one_time" });
});

test("checkbox: absent is false, 'on' is true", () => {
  assert.deepEqual(run(f.checkbox(), undefined), { ok: true, data: false });
  assert.deepEqual(run(f.checkbox(), "on"), { ok: true, data: true });
  assert.deepEqual(run(f.checkbox(), ""), { ok: true, data: false });
});

test("no builder can surface zod's English default", () => {
  const builders: z.ZodType[] = [
    f.id(MSG),
    f.text(MSG),
    f.positiveAmount(MSG),
    f.amountOrZero(MSG),
    f.date(MSG),
    f.ymd(MSG),
    f.optionalCount(MSG),
    f.strictEnum(["a"] as const, MSG),
  ];
  for (const schema of builders) {
    for (const bad of [undefined, "", "   ", "garbage", "-9"]) {
      const r = run(schema, bad);
      if (!r.ok) {
        assert.equal(r.message, MSG, `English leaked: ${r.message}`);
      }
    }
  }
});
