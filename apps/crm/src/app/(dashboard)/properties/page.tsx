import Link from "next/link";
import { Building2 } from "lucide-react";
import { getDb, sql } from "@kingsrealty/db";
import { CreateDialog } from "@/components/create-dialog";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { FilterTabs } from "@/components/filter-tabs";
import { PageHeader } from "@/components/page-header";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import { formatKRW } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PropertyForm } from "./_components/property-form";

const STATUS_LABEL: Record<string, string> = {
  vacant: "공실",
  pending: "입주대기중",
  occupied: "입주중",
  move_out: "퇴거",
  maintenance: "수리중",
  terminated: "계약해지",
};

const TYPE_LABEL: Record<string, string> = {
  apartment: "아파트",
  villa: "빌라",
  officetel: "오피스텔",
  house: "주택",
};

const PAGE_SIZE = 200;

const statusOptions = [
  { value: "all", label: "전체" },
  { value: "vacant", label: "공실" },
  { value: "pending", label: "입주대기중" },
  { value: "occupied", label: "입주중" },
  { value: "move_out", label: "퇴거" },
  { value: "maintenance", label: "수리중" },
  { value: "terminated", label: "계약해지" },
];

const typeOptions = [
  { value: "all", label: "전체 유형" },
  { value: "apartment", label: "아파트" },
  { value: "villa", label: "빌라" },
  { value: "officetel", label: "오피스텔" },
  { value: "house", label: "주택" },
];

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const search = params.q ?? "";
  const statusFilter = params.status ?? "";
  const typeFilter = params.type ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const db = getDb();

  let query = db
    .selectFrom("property")
    .innerJoin("landlord", "landlord.id", "property.landlord_id")
    .select([
      "property.id",
      sql<string>`coalesce(property.address_jibeon, property.address)`.as(
        "address",
      ),
      "property.address_detail",
      "property.property_type",
      "property.monthly_rent_krw",
      "property.deposit_krw",
      "property.status",
      "landlord.id as landlord_id",
      "landlord.name as landlord_name",
    ]);

  if (search) {
    // Escape ILIKE wildcards (\, %, _) so a query of "%" or "_" matches literally
    const escaped = search.replace(/[\\%_]/g, (c) => `\\${c}`);
    query = query.where((eb) =>
      eb.or([
        eb("property.address", "ilike", `%${escaped}%`),
        eb("property.address_jibeon", "ilike", `%${escaped}%`),
      ]),
    );
  }

  if (statusFilter) {
    query = query.where("property.status", "=", statusFilter);
  }

  if (typeFilter) {
    query = query.where("property.property_type", "=", typeFilter);
  }

  const [landlords, countResult, properties] = await Promise.all([
    db
      .selectFrom("landlord")
      .select(["id", "name"])
      .orderBy("name", "asc")
      .execute(),
    query
      .clearSelect()
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow(),
    // Latest tenant per property: the tenant on the most recent lease.
    // DISTINCT ON returns at most one row per property, so this left join
    // does not fan out rows.
    query
      .leftJoin(
        (eb) =>
          eb
            .selectFrom("lease")
            .innerJoin("tenant", "tenant.id", "lease.tenant_id")
            .where("tenant.deleted_at", "is", null)
            .distinctOn("lease.property_id")
            .orderBy("lease.property_id")
            .orderBy("lease.start_date", "desc")
            .select([
              "lease.property_id",
              "tenant.id as tenant_id",
              "tenant.name as tenant_name",
              "lease.status as lease_status",
            ])
            .as("latest_lease"),
        (join) => join.onRef("latest_lease.property_id", "=", "property.id"),
      )
      .select([
        "latest_lease.tenant_id as latest_tenant_id",
        "latest_lease.tenant_name as latest_tenant_name",
        "latest_lease.lease_status as latest_lease_status",
      ])
      .orderBy("property.created_at", "desc")
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
      .execute(),
  ]);

  const total = Number(countResult.count);

  return (
    <div className="space-y-5">
      <PageHeader
        title="매물"
        count={total}
        actions={
          <CreateDialog title="새 매물" buttonLabel="새 매물" wide>
            <PropertyForm landlords={landlords} variant="plain" />
          </CreateDialog>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="주소 검색..." />
        <div className="flex flex-wrap gap-2">
          <FilterTabs paramKey="status" options={statusOptions} />
          <FilterTabs paramKey="type" options={typeOptions} />
        </div>
      </div>

      <DataPanel>
        {properties.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="매물이 없습니다"
            description="검색 조건을 바꾸거나 새 매물을 등록해 보세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>주소</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>임대인</TableHead>
                <TableHead className="text-right">월세</TableHead>
                <TableHead className="text-right">보증금</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.map((property) => (
                <TableRow key={property.id} className="group">
                  <TableCell className="font-medium">
                    <Link
                      href={`/properties/${property.id}`}
                      className="group-hover:underline"
                    >
                      {property.address}
                    </Link>
                    {property.address_detail ? (
                      <span className="block text-sm font-normal text-muted-foreground">
                        {property.address_detail}
                      </span>
                    ) : null}
                    {property.latest_tenant_name ? (
                      <Link
                        href={`/tenants/${property.latest_tenant_id}`}
                        className="mt-0.5 block text-sm font-normal text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <span className="text-muted-foreground/70">
                          {property.latest_lease_status === "active"
                            ? "현재"
                            : "이전"}{" "}
                          ·{" "}
                        </span>
                        {property.latest_tenant_name}
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {TYPE_LABEL[property.property_type] ??
                      property.property_type}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Link
                      href={`/landlords/${property.landlord_id}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {property.landlord_name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatKRW(property.monthly_rent_krw)}
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {formatKRW(property.deposit_krw)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={property.status}
                      label={STATUS_LABEL[property.status] ?? property.status}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataPanel>

      <Pagination total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
