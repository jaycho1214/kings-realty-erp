/**
 * Client-side roster filtering for the tenant workspace rail.
 * The full roster (~150–300 rows) ships to the client once; search and the
 * 입주/전체/퇴거/휴지통 tabs filter it locally so switching is instant.
 */
export type RosterView = "active" | "all" | "inactive" | "deleted";

const digits = (s: string) => s.replace(/\D/g, "");

export function filterRoster<
  T extends {
    name: string;
    phone: string | null;
    status: string;
    deleted: boolean;
  },
>(rows: T[], q: string, view: RosterView): T[] {
  const inView = rows.filter((r) => {
    if (view === "deleted") return r.deleted;
    if (r.deleted) return false;
    if (view === "all") return true;
    return r.status === view;
  });

  const query = q.trim().toLowerCase();
  if (!query) return inView;

  const queryDigits = digits(query);
  return inView.filter(
    (r) =>
      r.name.toLowerCase().includes(query) ||
      (queryDigits.length > 0 &&
        r.phone != null &&
        digits(r.phone).includes(queryDigits)),
  );
}
