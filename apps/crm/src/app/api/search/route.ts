import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getDb } from "@kingsrealty/db";
import { auth } from "@/lib/auth";
import { isStaffOrAdmin } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 1)
    return NextResponse.json({
      results: { tenants: [], properties: [], landlords: [] },
    });

  const db = getDb();
  // Escape ILIKE wildcards (\, %, _) so a query of "%" or "_" matches literally
  // instead of acting as a wildcard that returns unrelated rows.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const searchTerm = `%${escaped}%`;

  const [tenants, properties, landlords] = await Promise.all([
    db
      .selectFrom("tenant")
      .select(["id", "name", "phone", "status"])
      .where("deleted_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("name", "ilike", searchTerm),
          eb("phone", "ilike", searchTerm),
        ]),
      )
      .limit(5)
      .execute(),
    db
      .selectFrom("property")
      .select(["id", "address", "status"])
      .where("address", "ilike", searchTerm)
      .limit(5)
      .execute(),
    db
      .selectFrom("landlord")
      .select(["id", "name", "phone"])
      .where((eb) =>
        eb.or([
          eb("name", "ilike", searchTerm),
          eb("phone", "ilike", searchTerm),
        ]),
      )
      .limit(5)
      .execute(),
  ]);

  return NextResponse.json({
    results: {
      tenants: tenants.map((t) => ({ ...t, type: "tenant" as const })),
      properties: properties.map((p) => ({
        ...p,
        type: "property" as const,
      })),
      landlords: landlords.map((l) => ({
        ...l,
        type: "landlord" as const,
      })),
    },
  });
}
