/**
 * Server-action error plumbing.
 *
 * Next.js masks anything *thrown* out of a Server Action in a production build.
 * The browser only ever receives "An error occurred in the Server Components
 * render… (digest: …)", so our Korean validation messages ("기지를 선택해주세요.")
 * never reached the staff who triggered them — they saw a generic error card and
 * lost everything they had typed. Expected errors must be *returned* as state
 * instead, which is what <ActionForm>'s useActionState consumes.
 *
 * Throw `ValidationError` for anything a user can fix; `runAction` turns it into
 * `{ error }`. Anything else is a bug: it is logged server-side and reported
 * generically so a raw Postgres message never lands in the UI.
 */
import { unstable_rethrow } from "next/navigation";
import { isValidationError } from "./validation-error";

export { ValidationError, isValidationError } from "./validation-error";

/** What every form-bound server action returns. No `error` = success. */
export type FormState = { error?: string };

export const EMPTY_FORM_STATE: FormState = {};

const UNEXPECTED = "저장 중 문제가 발생했습니다. 다시 시도해주세요.";

/**
 * Run a server action body, converting expected failures into returnable state.
 * `redirect()` / `notFound()` signal control flow by throwing, so they are
 * re-thrown untouched — swallowing them would silently break navigation.
 */
export async function runAction(fn: () => Promise<void>): Promise<FormState> {
  try {
    await fn();
    return EMPTY_FORM_STATE;
  } catch (err) {
    unstable_rethrow(err);
    if (isValidationError(err)) return { error: err.message };
    console.error("[server action]", err);
    return { error: UNEXPECTED };
  }
}
