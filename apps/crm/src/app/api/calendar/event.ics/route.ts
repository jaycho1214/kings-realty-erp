import { NextRequest, NextResponse } from "next/server";
import ical, { ICalCalendarMethod } from "ical-generator";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isStaffOrAdmin } from "@/lib/authz";
import { getDb } from "@kingsrealty/db";
import { seoulDateString } from "@/lib/date";
import type { EventCategory } from "@/lib/calendar-events";

// Match the UID scheme used by the subscribed feed (calendar-events.ts) so a
// downloaded single-event .ics dedupes against the feed instead of doubling up.
const UID_PREFIX: Record<string, string> = {
  lease_start: "lease_start",
  lease_end: "lease_end",
  rent_due: "rent",
  utility_due: "utility",
  service_request: "service",
  inspection: "inspection",
  custom: "custom",
};

export async function GET(request: NextRequest) {
  // Session auth for browser downloads
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  const category = request.nextUrl.searchParams.get(
    "category",
  ) as EventCategory | null;

  if (!id || !category) {
    return NextResponse.json(
      { error: "Missing id or category" },
      { status: 400 },
    );
  }

  const db = getDb();
  let summary = "";
  let description = "";
  let eventDate: Date | null = null;

  switch (category) {
    case "lease_start":
    case "lease_end": {
      const lease = await db
        .selectFrom("lease")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .innerJoin("property", "property.id", "lease.property_id")
        .select([
          "lease.start_date",
          "lease.end_date",
          "tenant.name as tenant_name",
          "property.address",
        ])
        .where("lease.id", "=", Number(id))
        .executeTakeFirst();

      if (!lease) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      eventDate =
        category === "lease_start"
          ? new Date(lease.start_date)
          : new Date(lease.end_date);
      summary =
        category === "lease_start"
          ? `계약 시작: ${lease.tenant_name}`
          : `계약 종료: ${lease.tenant_name}`;
      description = `${lease.address} - ${lease.tenant_name}`;
      break;
    }

    case "rent_due": {
      const payment = await db
        .selectFrom("payment")
        .innerJoin("lease", "lease.id", "payment.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select([
          "payment.billing_month",
          "payment.amount_krw",
          "tenant.name as tenant_name",
        ])
        .where("payment.id", "=", Number(id))
        .executeTakeFirst();

      if (!payment) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      eventDate = new Date(payment.billing_month);
      summary = `${payment.tenant_name} 월세`;
      description = `₩${Number(payment.amount_krw).toLocaleString()}`;
      break;
    }

    case "utility_due": {
      const bill = await db
        .selectFrom("utility_bill")
        .innerJoin("lease", "lease.id", "utility_bill.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .innerJoin(
          "utility_type",
          "utility_type.id",
          "utility_bill.utility_type_id",
        )
        .select([
          "utility_bill.due_date",
          "utility_bill.amount_krw",
          "tenant.name as tenant_name",
          "utility_type.name as utility_name",
        ])
        .where("utility_bill.id", "=", Number(id))
        .executeTakeFirst();

      if (!bill || !bill.due_date) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      eventDate = new Date(bill.due_date);
      summary = `${bill.tenant_name} ${bill.utility_name}`;
      description = `₩${Number(bill.amount_krw).toLocaleString()}`;
      break;
    }

    case "service_request": {
      const sr = await db
        .selectFrom("service_request")
        .innerJoin("lease", "lease.id", "service_request.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select([
          "service_request.title",
          "service_request.created_at",
          "service_request.category",
          "tenant.name as tenant_name",
        ])
        .where("service_request.id", "=", Number(id))
        .executeTakeFirst();

      if (!sr) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // created_at is a timestamptz instant; the calendar date is its
      // Asia/Seoul day (matches calendar-events.ts / the feed).
      eventDate = new Date(
        `${seoulDateString(new Date(sr.created_at))}T00:00:00Z`,
      );
      summary = sr.title;
      description = `${sr.tenant_name} - ${sr.category}`;
      break;
    }

    case "inspection": {
      const insp = await db
        .selectFrom("inspection")
        .innerJoin("lease", "lease.id", "inspection.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .innerJoin("property", "property.id", "inspection.property_id")
        .select([
          "inspection.type",
          "inspection.inspected_at",
          "tenant.name as tenant_name",
          "property.address",
        ])
        .where("inspection.id", "=", Number(id))
        .executeTakeFirst();

      if (!insp) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // inspected_at is a timestamptz instant; calendar date is its Seoul day.
      eventDate = new Date(
        `${seoulDateString(new Date(insp.inspected_at))}T00:00:00Z`,
      );
      const label = insp.type === "move_out" ? "퇴거 점검" : "입주 점검";
      summary = `${label}: ${insp.tenant_name}`;
      description = `${insp.address} - ${insp.tenant_name}`;
      break;
    }

    case "custom": {
      const ev = await db
        .selectFrom("calendar_event")
        .select(["title", "description", "date"])
        .where("id", "=", Number(id))
        .executeTakeFirst();

      if (!ev) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      eventDate = new Date(ev.date);
      summary = ev.title;
      description = ev.description ?? "";
      break;
    }

    default:
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  if (!eventDate) {
    return NextResponse.json({ error: "No date found" }, { status: 404 });
  }

  const calendar = ical({
    name: "King's Realty CRM",
    timezone: "Asia/Seoul",
    method: ICalCalendarMethod.PUBLISH,
  });

  calendar.createEvent({
    id: `${UID_PREFIX[category] ?? category}_${id}`,
    summary,
    description,
    start: eventDate,
    allDay: true,
  });

  const body = calendar.toString();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${category}_${id}.ics"`,
    },
  });
}
