import Link from "next/link";
import { Wrench } from "lucide-react";
import { getDb, sql } from "@kingsrealty/db";
import { CreateDialog } from "@/components/create-dialog";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { FilterTabs } from "@/components/filter-tabs";
import { PageHeader } from "@/components/page-header";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ServiceForm } from "./_components/service-form";

const PAGE_SIZE = 200;

const statusMap: Record<string, string> = {
  received: "접수",
  pending_repair: "수리대기중",
  in_progress: "수리중",
  completed: "수리완료",
  postponed: "수리연기",
  self_handled: "개인처리결정",
  escalated: "에스컬레이션",
};

// AS dashboard cards (§7.2) — ordered status board.
const STATUS_BOARD = [
  { value: "received", label: "접수" },
  { value: "pending_repair", label: "수리대기중" },
  { value: "in_progress", label: "수리중" },
  { value: "completed", label: "수리완료" },
  { value: "postponed", label: "수리연기" },
  { value: "self_handled", label: "개인처리결정" },
];

const statusOptions = [{ value: "all", label: "전체" }, ...STATUS_BOARD];

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    status?: string;
    category?: string;
  }>;
}) {
  const { q, page, status, category } = await searchParams;
  const currentPage = Number(page ?? "1");
  const offset = (currentPage - 1) * PAGE_SIZE;
  const db = getDb();

  let query = db
    .selectFrom("service_request")
    .innerJoin("lease", "lease.id", "service_request.lease_id")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .innerJoin("property", "property.id", "lease.property_id")
    .select([
      "service_request.id",
      "service_request.title",
      "service_request.category",
      "service_request.status",
      "service_request.created_at",
      "service_request.escalated_to_landlord",
      "tenant.id as tenant_id",
      "tenant.name as tenant_name",
      "property.id as property_id",
      sql<string>`coalesce(property.address_jibeon, property.address)`.as(
        "address",
      ),
    ])
    .where("tenant.deleted_at", "is", null);

  if (q) {
    query = query.where((eb) =>
      eb.or([
        eb("service_request.title", "ilike", `%${q}%`),
        eb("tenant.name", "ilike", `%${q}%`),
      ]),
    );
  }

  if (status && status !== "all") {
    query = query.where("service_request.status", "=", status);
  }

  if (category && category !== "all") {
    query = query.where("service_request.category", "=", category);
  }

  let countQuery = db
    .selectFrom("service_request")
    .innerJoin("lease", "lease.id", "service_request.lease_id")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .select(({ fn }) => fn.count<number>("service_request.id").as("count"))
    .where("tenant.deleted_at", "is", null);

  if (q) {
    countQuery = countQuery.where((eb) =>
      eb.or([
        eb("service_request.title", "ilike", `%${q}%`),
        eb("tenant.name", "ilike", `%${q}%`),
      ]),
    );
  }

  if (status && status !== "all") {
    countQuery = countQuery.where("service_request.status", "=", status);
  }

  if (category && category !== "all") {
    countQuery = countQuery.where("service_request.category", "=", category);
  }

  const [
    services,
    totalResult,
    leases,
    serviceCategories,
    statusCountRows,
    users,
    vendors,
  ] = await Promise.all([
    query
      .orderBy("service_request.created_at", "desc")
      .limit(PAGE_SIZE)
      .offset(offset)
      .execute(),
    countQuery.executeTakeFirst(),
    db
      .selectFrom("lease")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "lease.id",
        "tenant.name as tenant_name",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "address",
        ),
      ])
      .where("lease.status", "=", "active")
      .orderBy("tenant.name", "asc")
      .execute(),
    db
      .selectFrom("service_category")
      .select(["value", "label"])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("service_request")
      .innerJoin("lease", "lease.id", "service_request.lease_id")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .select([
        "service_request.status",
        ({ fn }) => fn.countAll<number>().as("count"),
      ])
      .where("tenant.deleted_at", "is", null)
      .groupBy("service_request.status")
      .execute(),
    db
      .selectFrom("user")
      .select(["id", "name", "image"])
      .orderBy("name", "asc")
      .execute(),
    db
      .selectFrom("service_vendor")
      .select(["id", "name", "phone"])
      .orderBy("name", "asc")
      .execute(),
  ]);

  const total = Number(totalResult?.count ?? 0);

  const statusCounts: Record<string, number> = {};
  for (const row of statusCountRows) {
    statusCounts[row.status] = Number(row.count);
  }

  const categoryMap: Record<string, string> = {};
  for (const cat of serviceCategories) {
    categoryMap[cat.value] = cat.label;
  }

  const categoryOptions = [
    { value: "all", label: "전체 카테고리" },
    ...serviceCategories.map((cat) => ({ value: cat.value, label: cat.label })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="AS 요청"
        count={total}
        actions={
          <CreateDialog
            title="새 AS 요청"
            buttonLabel="새 AS 요청"
            wide
            closeOnSuccess
          >
            <ServiceForm
              variant="plain"
              leases={leases}
              categories={serviceCategories}
              users={users}
              vendors={vendors}
            />
          </CreateDialog>
        }
      />

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {STATUS_BOARD.map((s) => {
          const active = status === s.value;
          const isOpen = s.value !== "completed" && s.value !== "self_handled";
          return (
            <Link
              key={s.value}
              href={`/services?status=${s.value}`}
              className={`rounded-lg border px-3 py-2.5 transition-colors ${
                active
                  ? "border-brand bg-brand/5"
                  : "border-border/60 hover:bg-secondary"
              }`}
            >
              <div className="text-[11px] font-medium text-muted-foreground">
                {s.label}
              </div>
              <div
                className={`tabular mt-0.5 text-lg font-semibold ${
                  isOpen && (statusCounts[s.value] ?? 0) > 0
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {statusCounts[s.value] ?? 0}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="제목 또는 세입자 검색..." />
        <div className="flex flex-wrap gap-2">
          <FilterTabs paramKey="status" options={statusOptions} />
          <FilterTabs paramKey="category" options={categoryOptions} />
        </div>
      </div>

      <DataPanel>
        {services.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="AS 요청이 없습니다"
            description="검색 조건을 바꾸거나 새 AS 요청을 등록해 보세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>세입자</TableHead>
                <TableHead>주소</TableHead>
                <TableHead>카테고리</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((sr) => (
                <TableRow key={sr.id} className="group">
                  <TableCell className="font-medium">
                    <Link
                      href={`/services/${sr.id}`}
                      className="group-hover:underline"
                    >
                      {sr.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Link
                      href={`/tenants/${sr.tenant_id}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {sr.tenant_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Link
                      href={`/properties/${sr.property_id}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {sr.address}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {categoryMap[sr.category] ?? sr.category}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={sr.status}
                      label={statusMap[sr.status] ?? sr.status}
                    />
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {new Date(sr.created_at).toLocaleDateString("ko-KR")}
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
