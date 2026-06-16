import { getDb } from "@kingsrealty/db";
import type { CalendarEvent } from "./calendar-config";
import { firstOfMonth, seoulDateString } from "./date";

export type { EventCategory, CalendarEvent } from "./calendar-config";
export { categoryConfig } from "./calendar-config";

/**
 * Get calendar events for a specific month
 */
export async function getCalendarEvents(
  year: number,
  month: number,
): Promise<CalendarEvent[]> {
  return getCalendarEventsRange(
    firstOfMonth(year, month),
    firstOfMonth(year, month + 1),
  );
}

/**
 * Get calendar events for a date range (used by both UI and .ics feed).
 * `startDate`/`endDate` are Asia/Seoul calendar dates ("YYYY-MM-DD"),
 * inclusive start, exclusive end.
 */
export async function getCalendarEventsRange(
  startDate: string,
  endDate: string,
): Promise<CalendarEvent[]> {
  const db = getDb();

  // `date` columns store plain Korea calendar dates; compare at UTC midnight.
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  // service_request.created_at is a timestamptz instant; bound it by the
  // Asia/Seoul midnight of the same calendar dates (UTC+9, no DST).
  const createdStart = new Date(`${startDate}T00:00:00+09:00`);
  const createdEnd = new Date(`${endDate}T00:00:00+09:00`);

  const [leases, payments, utilityBills, serviceRequests, customEvents] =
    await Promise.all([
      // Leases: start_date or end_date falls within range
      db
        .selectFrom("lease")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .innerJoin("property", "property.id", "lease.property_id")
        .select([
          "lease.id",
          "lease.start_date",
          "lease.end_date",
          "lease.status",
          "lease.tenant_id",
          "tenant.name as tenant_name",
          "property.address as property_address",
        ])
        .where((eb) =>
          eb.or([
            eb.and([
              eb("lease.start_date", ">=", start),
              eb("lease.start_date", "<", end),
            ]),
            eb.and([
              eb("lease.end_date", ">=", start),
              eb("lease.end_date", "<", end),
            ]),
          ]),
        )
        .where("tenant.deleted_at", "is", null)
        .execute(),

      // Payments: pending/overdue billing_month in range
      db
        .selectFrom("payment")
        .innerJoin("lease", "lease.id", "payment.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .innerJoin("property", "property.id", "lease.property_id")
        .innerJoin("user", "user.id", "payment.received_by")
        .select([
          "payment.id",
          "payment.billing_month",
          "payment.status",
          "payment.amount_krw",
          "payment.received_by",
          "lease.tenant_id",
          "tenant.name as tenant_name",
          "property.address as property_address",
          "user.name as staff_name",
        ])
        .where("payment.billing_month", ">=", start)
        .where("payment.billing_month", "<", end)
        .where("payment.status", "in", ["pending", "overdue"])
        .where("tenant.deleted_at", "is", null)
        .execute(),

      // Utility bills: unpaid due_date in range
      db
        .selectFrom("utility_bill")
        .innerJoin("lease", "lease.id", "utility_bill.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .innerJoin(
          "utility_type",
          "utility_type.id",
          "utility_bill.utility_type_id",
        )
        .select([
          "utility_bill.id",
          "utility_bill.due_date",
          "utility_bill.amount_krw",
          "lease.tenant_id",
          "tenant.name as tenant_name",
          "utility_type.name as utility_name",
        ])
        .where("utility_bill.due_date", "is not", null)
        .where("utility_bill.due_date", ">=", start)
        .where("utility_bill.due_date", "<", end)
        .where("utility_bill.paid_to_company", "=", false)
        .where("tenant.deleted_at", "is", null)
        .execute(),

      // Service requests: created_at in range, open status
      db
        .selectFrom("service_request")
        .innerJoin("lease", "lease.id", "service_request.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .innerJoin("user", "user.id", "service_request.logged_by")
        .select([
          "service_request.id",
          "service_request.title",
          "service_request.created_at",
          "service_request.status",
          "service_request.category",
          "service_request.logged_by",
          "lease.tenant_id",
          "tenant.name as tenant_name",
          "user.name as staff_name",
        ])
        .where("service_request.created_at", ">=", createdStart)
        .where("service_request.created_at", "<", createdEnd)
        .where("service_request.status", "in", [
          "received",
          "in_progress",
          "escalated",
        ])
        .where("tenant.deleted_at", "is", null)
        .execute(),

      // Custom calendar events
      db
        .selectFrom("calendar_event")
        .innerJoin("user", "user.id", "calendar_event.created_by")
        .select([
          "calendar_event.id",
          "calendar_event.title",
          "calendar_event.description",
          "calendar_event.date",
          "calendar_event.end_date",
          "calendar_event.created_by",
          "user.name as staff_name",
        ])
        .where("calendar_event.date", ">=", start)
        .where("calendar_event.date", "<", end)
        .execute(),
    ]);

  const events: CalendarEvent[] = [];

  // Lease events
  for (const lease of leases) {
    const startD = new Date(lease.start_date);
    const endD = new Date(lease.end_date);
    const rangeStart = start.getTime();
    const rangeEnd = end.getTime();

    if (startD.getTime() >= rangeStart && startD.getTime() < rangeEnd) {
      events.push({
        id: `lease_start_${lease.id}`,
        title: `계약 시작: ${lease.tenant_name}`,
        date: startD,
        category: "lease_start",
        entityId: lease.id,
        entityPath: `/leases/${lease.id}`,
        description: `${lease.property_address} - ${lease.tenant_name}`,
        tenantId: lease.tenant_id,
        tenantName: lease.tenant_name,
      });
    }
    if (endD.getTime() >= rangeStart && endD.getTime() < rangeEnd) {
      events.push({
        id: `lease_end_${lease.id}`,
        title: `계약 종료: ${lease.tenant_name}`,
        date: endD,
        category: "lease_end",
        entityId: lease.id,
        entityPath: `/leases/${lease.id}`,
        description: `${lease.property_address} - ${lease.tenant_name}`,
        tenantId: lease.tenant_id,
        tenantName: lease.tenant_name,
      });
    }
  }

  // Payment events
  for (const payment of payments) {
    events.push({
      id: `rent_${payment.id}`,
      title: `${payment.tenant_name} 월세`,
      date: new Date(payment.billing_month),
      category: "rent_due",
      entityId: payment.id,
      entityPath: `/payments/${payment.id}`,
      description: `${payment.property_address} - ₩${Number(payment.amount_krw).toLocaleString()}`,
      tenantId: payment.tenant_id,
      tenantName: payment.tenant_name,
      staffId: payment.received_by,
      staffName: payment.staff_name,
    });
  }

  // Utility bill events
  for (const bill of utilityBills) {
    if (!bill.due_date) continue;
    events.push({
      id: `utility_${bill.id}`,
      title: `${bill.tenant_name} ${bill.utility_name}`,
      date: new Date(bill.due_date),
      category: "utility_due",
      entityId: bill.id,
      entityPath: `/payments`,
      description: `₩${Number(bill.amount_krw).toLocaleString()}`,
      tenantId: bill.tenant_id,
      tenantName: bill.tenant_name,
    });
  }

  // Service request events
  for (const sr of serviceRequests) {
    // created_at is a timestamptz instant; the calendar date is its Asia/Seoul day.
    const seoulDay = seoulDateString(new Date(sr.created_at));
    events.push({
      id: `service_${sr.id}`,
      title: `${sr.title}`,
      date: new Date(`${seoulDay}T00:00:00Z`),
      category: "service_request",
      entityId: sr.id,
      entityPath: `/services/${sr.id}`,
      description: `${sr.tenant_name} - ${sr.category}`,
      tenantId: sr.tenant_id,
      tenantName: sr.tenant_name,
      staffId: sr.logged_by,
      staffName: sr.staff_name,
    });
  }

  // Custom events
  for (const ce of customEvents) {
    events.push({
      id: `custom_${ce.id}`,
      title: ce.title,
      date: new Date(ce.date),
      endDate: ce.end_date ? new Date(ce.end_date) : undefined,
      category: "custom",
      entityId: ce.id,
      entityPath: `/calendar`,
      description: ce.description ?? undefined,
      staffId: ce.created_by,
      staffName: ce.staff_name,
    });
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
