import { redirect } from "next/navigation";
import { getDb } from "@kingsrealty/db";
import { getSession } from "@/lib/session";
import { isApprovedUser } from "@/lib/authz";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // No valid session (e.g. a stale/invalid cookie the middleware let through) →
  // send to sign-in instead of rendering a broken dashboard whose server actions
  // would throw "인증이 필요합니다".
  if (!session?.user) {
    redirect("/sign-in");
  }
  if (!isApprovedUser(session.user.role)) {
    redirect("/pending");
  }

  const db = getDb();
  const [tenants, leases, properties, unpaid, services, notifications] =
    await Promise.all([
      db
        .selectFrom("tenant")
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .where("status", "=", "active")
        .where("deleted_at", "is", null)
        .executeTakeFirst(),
      db
        .selectFrom("lease")
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .where("status", "=", "active")
        .executeTakeFirst(),
      db
        .selectFrom("property")
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .executeTakeFirst(),
      db
        .selectFrom("payment")
        .innerJoin("lease", "lease.id", "payment.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select(({ fn }) => fn.count<number>("payment.id").as("c"))
        .where("payment.status", "=", "pending")
        .where("tenant.deleted_at", "is", null)
        .executeTakeFirst(),
      db
        .selectFrom("service_request")
        .innerJoin("lease", "lease.id", "service_request.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select(({ fn }) => fn.count<number>("service_request.id").as("c"))
        .where("service_request.status", "in", [
          "received",
          "pending_repair",
          "in_progress",
          "postponed",
        ])
        .where("tenant.deleted_at", "is", null)
        .executeTakeFirst(),
      db
        .selectFrom("notification")
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .where("is_read", "=", false)
        .executeTakeFirst(),
    ]);

  const counts = {
    tenants: Number(tenants?.c ?? 0),
    leases: Number(leases?.c ?? 0),
    properties: Number(properties?.c ?? 0),
    unpaid: Number(unpaid?.c ?? 0),
    services: Number(services?.c ?? 0),
    notifications: Number(notifications?.c ?? 0),
  };

  return <AppShell counts={counts}>{children}</AppShell>;
}
