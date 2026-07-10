import { getDb, sql } from "@kingsrealty/db";
import { seoulYMD } from "@/lib/date";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { CreateDialog } from "@/components/create-dialog";
import { CustomerIntakeForm } from "./_components/customer-intake-form";
import { TenantWorkspace } from "./_components/tenant-workspace";
import { TenantRail, type RailTenant } from "./_components/tenant-rail";

export default async function TenantsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = getDb();
  const session = await getSession();
  const admin = isAdmin(session?.user?.role);

  // 조기 퇴거 flag needs "today" in Seoul, same as the old list page.
  const { year: sy, month: sm, day: sd } = seoulYMD();
  const today = new Date(sy, sm - 1, sd);

  const [rosterRows, baseLocations, landlordsList] = await Promise.all([
      db
        .selectFrom("tenant")
        .select((eb) => [
          "tenant.id",
          "tenant.name",
          "tenant.rank",
          "tenant.status",
          "tenant.phone",
          "tenant.deleted_at",
          eb
            .exists(
              eb
                .selectFrom("lease")
                .select("lease.id")
                .whereRef("lease.tenant_id", "=", "tenant.id")
                .where("lease.end_date", ">", today),
            )
            .as("lease_running"),
          eb
            .selectFrom("lease")
            .innerJoin("property", "property.id", "lease.property_id")
            .select(
              sql<string>`coalesce(property.address_jibeon, property.address)`.as(
                "address",
              ),
            )
            .whereRef("lease.tenant_id", "=", "tenant.id")
            .where("lease.status", "in", ["active", "pending"])
            .orderBy("lease.start_date", "desc")
            .limit(1)
            .as("address"),
        ])
        .orderBy("tenant.name", "asc")
        .execute(),
      db
        .selectFrom("base_location")
        .select(["id", "name", "name_ko"])
        .orderBy("sort_order", "asc")
        .execute(),
      // Combobox source for the 새 고객 intake's 집주인 autocomplete.
      db
        .selectFrom("landlord")
        .select(["id", "name"])
        .orderBy("name", "asc")
        .execute(),
    ]);

  const roster: RailTenant[] = rosterRows.map((r) => ({
    id: r.id,
    name: r.name,
    rank: r.rank,
    status: r.status,
    deleted: r.deleted_at != null,
    earlyMoveOut: r.status === "inactive" && !!r.lease_running,
    address: r.address ?? null,
    phone: r.phone,
  }));

  const activeCount = roster.filter(
    (t) => !t.deleted && t.status === "active",
  ).length;

  return (
    <TenantWorkspace
      header={
        <PageHeader
          title="세입자"
          count={activeCount}
          actions={
            <CreateDialog title="새 고객" buttonLabel="새 고객" wide closeOnSuccess>
              <CustomerIntakeForm
                landlords={landlordsList}
                baseLocations={baseLocations}
              />
            </CreateDialog>
          }
        />
      }
      rail={<TenantRail tenants={roster} isAdmin={admin} />}
    >
      {children}
    </TenantWorkspace>
  );
}
