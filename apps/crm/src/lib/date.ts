/**
 * Date helpers for the Asia/Seoul business timezone (UTC+9, no DST).
 *
 * All dates in this app are Korea-local calendar dates stored in `date`
 * columns. "Today" and month boundaries must therefore be computed in Seoul
 * time, NOT the server's timezone (UTC on Vercel) — otherwise, between 00:00
 * and 09:00 KST the server's date is the previous calendar day, which makes
 * "today's" lookups (exchange rates, due payments, etc.) silently miss.
 */

const SEOUL_TZ = "Asia/Seoul";

/** Today's calendar date in Asia/Seoul as a "YYYY-MM-DD" string. */
export function seoulDateString(instant: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Calendar year / month (1-12) / day for an instant, in Asia/Seoul. */
export function seoulYMD(instant: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = seoulDateString(instant).split("-").map(Number);
  return { year, month, day };
}

/** Add (or subtract, with a negative count) whole days to a "YYYY-MM-DD" string. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split("T")[0];
}

/** First day of a month as "YYYY-MM-01". `month` (1-12) may be out of range and rolls over. */
export function firstOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Whole calendar days from Seoul-today until `target` (negative if already
 * past). Computed as a UTC-midnight difference of two Seoul calendar dates, so
 * the result never drifts with the server timezone — unlike a raw
 * `(targetMs - Date.now()) / 86_400_000`, whose "today" half depends on the
 * server clock. `target` may be a Date or anything `new Date()` parses (e.g. a
 * "YYYY-MM-DD" date column).
 */
export function daysUntil(
  target: Date | string,
  from: string = seoulDateString(),
): number {
  const t = seoulDateString(target instanceof Date ? target : new Date(target));
  const [ty, tm, td] = t.split("-").map(Number);
  const [fy, fm, fd] = from.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/**
 * Upcoming Sunday (the end of the current week) as "YYYY-MM-DD", in Asia/Seoul.
 * Returns `from` itself when it is already a Sunday. Used to bucket the 계획 뷰's
 * "이번 주" column relative to today.
 */
export function seoulWeekEnd(from: string = seoulDateString()): string {
  const [y, m, d] = from.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return addDays(from, (7 - dow) % 7);
}

/**
 * Add whole months to a "YYYY-MM-DD" date, clamping the day to the target
 * month's last day so an out-of-range day never rolls into the next month
 * (e.g. 2026-01-31 + 1 month → 2026-02-28, not 2026-03-03).
 */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().split("T")[0];
}

/** Whole calendar months between two "YYYY-MM-DD" dates (end − start). */
export function monthsBetween(startStr: string, endStr: string): number {
  const [sy, sm] = startStr.split("-").map(Number);
  const [ey, em] = endStr.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm);
}
