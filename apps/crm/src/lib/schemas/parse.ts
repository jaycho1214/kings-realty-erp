/**
 * The bridge from a zod schema to the error channel actions already use.
 *
 * `parseForm` throws `ValidationError` rather than returning a result, so an
 * action body stays a straight line:
 *
 *     const data = parseForm(tenantSchema, formData);
 *
 * `runAction` catches it and hands the browser both the summary line and the
 * per-field messages. Deliberately Next-free so schemas stay unit-testable.
 */
import { z } from "zod";
import { ValidationError, type FieldErrors } from "../validation-error";

/** Shown when every issue is attached to a field and none is form-level. */
const SUMMARY_FALLBACK = "입력한 내용을 다시 확인해주세요.";

/**
 * FormData → plain object. Repeated keys collapse to the first value; the forms
 * here use indexed names (`family[0].name`) rather than repeats, and those are
 * parsed separately by the action.
 */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (!(key in out)) out[key] = typeof value === "string" ? value : undefined;
  }
  return out;
}

/**
 * Validate `formData` against `schema`, or throw a `ValidationError` carrying
 * one message per bad field.
 */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): z.infer<S> {
  const result = schema.safeParse(formToObject(formData));
  if (result.success) return result.data;

  const flat = z.flattenError(result.error);
  const fieldErrors: FieldErrors = {};
  for (const [name, messages] of Object.entries(flat.fieldErrors)) {
    // One message per input: the first is the one the user must fix first.
    const first = (messages as string[] | undefined)?.[0];
    if (first) fieldErrors[name] = first;
  }

  // Prefer a form-level issue for the summary (cross-field rules like
  // "계약 종료일은 시작일 이후여야 합니다."), else reuse the first field message
  // so the line beside the submit button is never empty or English.
  const summary =
    flat.formErrors[0] ?? Object.values(fieldErrors)[0] ?? SUMMARY_FALLBACK;

  throw new ValidationError(summary, fieldErrors);
}
