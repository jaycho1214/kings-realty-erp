/**
 * The field vocabulary every form schema is built from.
 *
 * FormData hands us strings and nothing else, so each builder owns one
 * string→value coercion *and* the Korean message shown when it fails. Three
 * traps these exist to close:
 *
 *   - `z.coerce.number("")` is 0, not an error. A bare `coerce.number()` would
 *     silently accept an empty select.
 *   - An unchecked checkbox or untouched input is *absent* from FormData, so the
 *     schema sees `undefined` — which a plain union rejects as "expected
 *     nonoptional" in English.
 *   - Any check without an explicit message falls back to zod's English text.
 *
 * Every builder therefore normalises the raw value with `preprocess` first, then
 * validates with a message attached to each check.
 */
import { z } from "zod";

/** Absent, empty, or whitespace-only — i.e. "the user left this alone". */
const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);

/** A required foreign key from a <select> — rejects "", "0" and absent. */
export const id = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? undefined : v),
    z.coerce.number({ error: message }).int(message).positive(message),
  );

/**
 * An optional foreign key: blank/absent → null. Deliberately lenient — the old
 * hand-written `posInt()` treated anything unparseable as "not picked", and a
 * hidden combobox input can legitimately hold junk when nothing was selected.
 */
export const optionalId = () =>
  z.preprocess((v) => {
    if (isBlank(v)) return null;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, z.number().int().positive().nullable());

/** Required free text. */
export const text = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? undefined : trimmed(v)),
    z.string({ error: message }).min(1, message),
  );

/** Free text with a fallback, for NOT NULL columns the form may leave blank. */
export const textWithDefault = (fallback: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : fallback),
    z.string(),
  );

/** Optional free text: blank → null, so it lands in a nullable column cleanly. */
export const optionalText = () =>
  z.preprocess(
    (v) => (isBlank(v) ? null : trimmed(v)),
    z.union([z.null(), z.string()]),
  );

/** Money / quantity that must be present and greater than zero. */
export const positiveAmount = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? undefined : v),
    z.coerce.number({ error: message }).positive(message),
  );

/** Money that may be zero but never negative; blank → 0. */
export const amountOrZero = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? 0 : v),
    z.coerce.number({ error: message }).nonnegative(message),
  );

/** A calendar date that must be present and real. */
export const date = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? undefined : v),
    z.coerce.date({ error: message }),
  );

/** An optional date: blank → null. */
export const optionalDate = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? null : v),
    z.union([z.null(), z.coerce.date({ error: message })], { error: message }),
  );

/** A "YYYY-MM-DD" string kept as a string (Seoul-anchored columns). */
export const ymd = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? undefined : trimmed(v)),
    z.string({ error: message }).regex(/^\d{4}-\d{2}-\d{2}$/, message),
  );

/** An optional "YYYY-MM-DD": blank → null. */
export const optionalYmd = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? null : trimmed(v)),
    z.union([z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message)], {
      error: message,
    }),
  );

/** A required "YYYY-MM" month (an <input type="month">). */
export const month = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? undefined : trimmed(v)),
    z.string({ error: message }).regex(/^\d{4}-\d{2}$/, message),
  );

/** A "YYYY-MM" month; optional, blank → null. */
export const optionalMonth = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? null : trimmed(v)),
    z.union([z.null(), z.string().regex(/^\d{4}-\d{2}$/, message)], {
      error: message,
    }),
  );

/** One of a fixed set, falling back rather than failing (legacy form values). */
export const enumWithDefault = <T extends string>(
  values: readonly T[],
  fallback: T,
) =>
  z.preprocess(
    (v) => (values.includes(v as T) ? v : fallback),
    z.custom<T>(() => true),
  );

/** One of a fixed set, rejecting anything else. */
export const strictEnum = <T extends string>(
  values: readonly T[],
  message: string,
) =>
  z.preprocess(
    (v) => (isBlank(v) ? undefined : v),
    z.custom<T>((v) => values.includes(v as T), { error: message }),
  );

/** An optional non-negative integer count: blank → null. */
export const optionalCount = (message: string) =>
  z.preprocess(
    (v) => (isBlank(v) ? null : v),
    z.union(
      [
        z.null(),
        z.coerce.number({ error: message }).int(message).nonnegative(message),
      ],
      { error: message },
    ),
  );

/** An HTML checkbox: present with a truthy value → true, absent → false. */
export const checkbox = () =>
  z.preprocess(
    (v) => v === "on" || v === "true" || v === "1" || v === true,
    z.boolean(),
  );
