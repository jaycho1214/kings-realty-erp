/**
 * An expected, user-fixable problem — "기지를 선택해주세요.", "금액을 올바르게
 * 입력해주세요." Its message is written for staff and is shown to them verbatim.
 *
 * Kept dependency-free so pure parsers and schemas can throw it without pulling
 * Next.js into their unit tests. `runAction` in ./form-action is what turns it
 * into returnable form state.
 */

/** Per-field messages, keyed by the input's `name`. */
export type FieldErrors = Record<string, string>;

export class ValidationError extends Error {
  /**
   * Set when the failure can be attributed to specific inputs (a schema parse).
   * `message` stays the single-line summary for surfaces with nowhere to put
   * per-field text, like a confirm dialog.
   */
  readonly fieldErrors?: FieldErrors;

  constructor(message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "ValidationError";
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      this.fieldErrors = fieldErrors;
    }
  }
}

/**
 * `instanceof` alone is unreliable once a module is duplicated across bundler
 * chunks, so fall back to the tag `ValidationError` sets on itself.
 */
export function isValidationError(err: unknown): err is ValidationError {
  return (
    err instanceof ValidationError ||
    (err instanceof Error && err.name === "ValidationError")
  );
}
