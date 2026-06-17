export type PlanBucket = "today" | "this_week" | "later" | "done";
export type TaskStatus = "todo" | "in_progress" | "done";

/**
 * Classify a task into a 계획 뷰 column relative to `today`/`weekEnd`
 * ("YYYY-MM-DD", Seoul). Done tasks always land in "done"; the caller hides
 * those completed more than 7 days ago. Non-done tasks bucket by planned_date:
 * past/today → today (carry-over), within the week → this_week, else/null → later.
 */
export function planBucket(
  t: { status: string; planned_date: string | null; completed_at: string | null },
  today: string,
  weekEnd: string,
): PlanBucket {
  if (t.status === "done") return "done";
  const p = t.planned_date;
  if (!p) return "later";
  if (p <= today) return "today";
  if (p <= weekEnd) return "this_week";
  return "later";
}

/** The planned_date to write when a card is dropped into a non-done 계획 column. */
export function plannedDateForBucket(
  bucket: "today" | "this_week" | "later",
  today: string,
  weekEnd: string,
): string | null {
  if (bucket === "today") return today;
  if (bucket === "this_week") return weekEnd;
  return null;
}

/**
 * New sort_order for a card dropped between two neighbors (their sort_order, or
 * null at a column edge). Midpoint keeps ordering stable without renumbering.
 */
export function midpointSortOrder(
  before: number | null,
  after: number | null,
): number {
  if (before == null && after == null) return 0;
  if (before == null) return after! - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}
