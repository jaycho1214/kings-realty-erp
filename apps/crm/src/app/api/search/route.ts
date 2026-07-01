import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getDb } from "@kingsrealty/db";
import { auth } from "@/lib/auth";
import { isStaffOrAdmin } from "@/lib/authz";
import { nameSearchPatterns } from "@/lib/search";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q");
  const patterns = nameSearchPatterns(q ?? "");
  if (patterns.length === 0)
    return NextResponse.json({ results: { tenants: [] } });

  const db = getDb();

  // Match every whitespace token against the name (AND), so word order and
  // partial tokens both work. Each tenant carries its current active lease id,
  // which the payment shortcut hands to /payments/new?lease=... — the same
  // status ('active') that page lists, so the preselect resolves.
  const tenants = await db
    .selectFrom("tenant")
    .select((eb) => [
      "tenant.id",
      "tenant.name",
      "tenant.phone",
      "tenant.status",
      eb
        .selectFrom("lease")
        .select("lease.id")
        .whereRef("lease.tenant_id", "=", "tenant.id")
        .where("lease.status", "=", "active")
        .orderBy("lease.start_date", "desc")
        .limit(1)
        .as("activeLeaseId"),
    ])
    .where("tenant.deleted_at", "is", null)
    .where((eb) => eb.and(patterns.map((p) => eb("tenant.name", "ilike", p))))
    .orderBy("tenant.name")
    .limit(10)
    .execute();

  return NextResponse.json({ results: { tenants } });
}
