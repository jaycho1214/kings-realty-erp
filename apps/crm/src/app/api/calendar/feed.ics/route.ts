import { NextRequest, NextResponse } from "next/server";
import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import { getDb } from "@kingsrealty/db";
import { getCalendarEventsRange } from "@/lib/calendar-events";
import { categoryConfig } from "@/lib/calendar-config";
import { isApprovedUser } from "@/lib/authz";
import { seoulYMD, firstOfMonth } from "@/lib/date";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  // A blank/short token must never match. The feed is a bearer-secret URL, so
  // guard against an empty query param matching a stray empty/short DB value.
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Token required" }, { status: 401 });
  }

  // Look up user by calendar token
  const db = getDb();
  const user = await db
    .selectFrom("user")
    .select(["id", "name", "role", "banned", "banExpires"])
    .where("calendar_token", "=", token)
    .executeTakeFirst();

  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // The token outlives a single session, so re-check the owner's authorization
  // on every request: a banned/deactivated or still-pending user's token must
  // stop working immediately (revoking access actually cuts off the feed).
  const banActive =
    user.banned === true &&
    (user.banExpires == null || new Date(user.banExpires) > new Date());
  if (banActive || !isApprovedUser(user.role)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Get events: 3 months back to 6 months forward (Asia/Seoul calendar months)
  const { year, month } = seoulYMD();
  const startDate = firstOfMonth(year, month - 3);
  const endDate = firstOfMonth(year, month + 6);

  const events = await getCalendarEventsRange(startDate, endDate);

  // Build iCal document
  const calendar = ical({
    name: "King's Realty CRM",
    timezone: "Asia/Seoul",
    prodId: { company: "King's Realty", product: "CRM Calendar" },
    method: ICalCalendarMethod.PUBLISH,
  });

  for (const event of events) {
    const config = categoryConfig[event.category];
    calendar.createEvent({
      id: event.id,
      summary: event.title,
      description: event.description,
      start: event.date,
      allDay: true,
      categories: [{ name: config.label }],
      url: `${request.nextUrl.origin}${event.entityPath}`,
      status: ICalEventStatus.CONFIRMED,
    });
  }

  const body = calendar.toString();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kingsrealty.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
