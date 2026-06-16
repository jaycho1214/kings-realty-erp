import { getDb } from "@kingsrealty/db";
import { getCalendarEvents } from "@/lib/calendar-events";
import { seoulYMD } from "@/lib/date";
import { CalendarGrid } from "./_components/calendar-grid";
import { CalendarHeader } from "./_components/calendar-header";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { year, month } = await searchParams;
  const seoul = seoulYMD();
  const currentYear = year ? Number(year) : seoul.year;
  const currentMonth = month ? Number(month) : seoul.month;

  const db = getDb();

  const [events, staff, tenants, landlords, properties, categories] =
    await Promise.all([
      getCalendarEvents(currentYear, currentMonth),
      db
        .selectFrom("user")
        .select(["id", "name"])
        .orderBy("name", "asc")
        .execute(),
      db
        .selectFrom("tenant")
        .select(["id", "name"])
        .where("tenant.deleted_at", "is", null)
        .orderBy("name", "asc")
        .execute(),
      db
        .selectFrom("landlord")
        .select(["id", "name"])
        .orderBy("name", "asc")
        .execute(),
      db
        .selectFrom("property")
        .select(["id", "address"])
        .orderBy("address", "asc")
        .execute(),
      db
        .selectFrom("event_category")
        .select(["id", "value", "label", "icon"])
        .orderBy("sort_order", "asc")
        .execute(),
    ]);

  const formData = { staff, tenants, landlords, properties, categories };

  return (
    <div className="space-y-5">
      <CalendarHeader
        year={currentYear}
        month={currentMonth}
        formData={formData}
      />
      <CalendarGrid
        year={currentYear}
        month={currentMonth}
        events={events.map((e) => ({
          ...e,
          date: e.date.toISOString(),
          endDate: e.endDate?.toISOString(),
        }))}
        staff={staff}
        formData={formData}
      />
    </div>
  );
}
