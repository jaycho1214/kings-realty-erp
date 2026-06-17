import type { SuggestedTask } from "./types";

/**
 * Remove suggestion candidates that are already represented as an active
 * (non-done) task (`activeKeys`) or that have a live dismissal: permanent
 * (`null`) or snoozed until a future date (`> today`). Date strings are
 * "YYYY-MM-DD" so lexical comparison equals chronological comparison.
 */
export function filterSuggestions(
  candidates: SuggestedTask[],
  activeKeys: Set<string>,
  dismissals: Map<string, string | null>,
  today: string,
): SuggestedTask[] {
  return candidates.filter((c) => {
    if (activeKeys.has(c.dedupKey)) return false;
    if (dismissals.has(c.dedupKey)) {
      const until = dismissals.get(c.dedupKey) ?? null;
      if (until == null) return false; // permanent
      if (until > today) return false; // still snoozed
    }
    return true;
  });
}
