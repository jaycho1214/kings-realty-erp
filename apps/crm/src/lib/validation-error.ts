/**
 * An expected, user-fixable problem — "기지를 선택해주세요.", "금액을 올바르게
 * 입력해주세요." Its message is written for staff and is shown to them verbatim.
 *
 * Kept dependency-free so pure parsers (customer-intake, lease-intake) can throw
 * it without pulling Next.js into their unit tests. `runAction` in ./form-action
 * is what turns it into returnable form state.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
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
