import Link from "next/link";
import { Users } from "lucide-react";
import { getDb } from "@kingsrealty/db";
import { CreateDialog } from "@/components/create-dialog";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { FilterTabs } from "@/components/filter-tabs";
import { PageHeader } from "@/components/page-header";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import { formatPhone } from "@/lib/utils";
import { branchMap } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { TenantForm } from "./_components/tenant-form";
import { TenantLifecycleActions } from "./_components/tenant-lifecycle-actions";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/authz";

const PAGE_SIZE = 200;

const LIFECYCLE_VIEWS = new Set(["archived", "deleted"]);

const branchOptions = [
  { value: "all", label: "전체 군종" },
  { value: "army", label: "Army" },
  { value: "air_force", label: "Air Force" },
  { value: "navy", label: "Navy" },
  { value: "marines", label: "Marines" },
  { value: "space_force", label: "Space Force" },
  { value: "coast_guard", label: "Coast Guard" },
];

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    branch?: string;
    status?: string;
  }>;
}) {
  const { q, page, branch, status } = await searchParams;
  const currentPage = Number(page ?? "1");
  const offset = (currentPage - 1) * PAGE_SIZE;
  const db = getDb();

  const session = await getSession();
  const admin = isAdmin(session?.user?.role);

  // The `status` param doubles as the lifecycle view (archived / deleted).
  const view = status;
  const isLifecycleView = !!view && LIFECYCLE_VIEWS.has(view);
  const statusFilter = !isLifecycleView && view && view !== "all" ? view : null;

  let query = db
    .selectFrom("tenant")
    .select([
      "tenant.id",
      "tenant.name",
      "tenant.phone",
      "tenant.email",
      "tenant.branch",
      "tenant.rank",
      "tenant.unit",
      "tenant.status",
      "tenant.archived_at",
      "tenant.deleted_at",
    ])
    .where((eb) =>
      view === "archived"
        ? eb.and([
            eb("tenant.archived_at", "is not", null),
            eb("tenant.deleted_at", "is", null),
          ])
        : view === "deleted"
          ? eb("tenant.deleted_at", "is not", null)
          : eb.and([
              eb("tenant.archived_at", "is", null),
              eb("tenant.deleted_at", "is", null),
            ]),
    );

  let countQuery = db
    .selectFrom("tenant")
    .select(({ fn }) => fn.count<number>("id").as("count"))
    .where((eb) =>
      view === "archived"
        ? eb.and([
            eb("tenant.archived_at", "is not", null),
            eb("tenant.deleted_at", "is", null),
          ])
        : view === "deleted"
          ? eb("tenant.deleted_at", "is not", null)
          : eb.and([
              eb("tenant.archived_at", "is", null),
              eb("tenant.deleted_at", "is", null),
            ]),
    );

  if (q) {
    query = query.where((eb) =>
      eb.or([
        eb("tenant.name", "ilike", `%${q}%`),
        eb("tenant.phone", "ilike", `%${q}%`),
      ]),
    );
    countQuery = countQuery.where((eb) =>
      eb.or([
        eb("tenant.name", "ilike", `%${q}%`),
        eb("tenant.phone", "ilike", `%${q}%`),
      ]),
    );
  }

  if (branch && branch !== "all") {
    query = query.where("tenant.branch", "=", branch);
    countQuery = countQuery.where("tenant.branch", "=", branch);
  }

  if (statusFilter) {
    query = query.where("tenant.status", "=", statusFilter);
    countQuery = countQuery.where("tenant.status", "=", statusFilter);
  }

  const [tenants, totalResult, baseLocations] = await Promise.all([
    query
      .orderBy("tenant.created_at", "desc")
      .limit(PAGE_SIZE)
      .offset(offset)
      .execute(),
    countQuery.executeTakeFirst(),
    db
      .selectFrom("base_location")
      .select(["id", "name", "name_ko"])
      .orderBy("sort_order", "asc")
      .execute(),
  ]);

  const total = Number(totalResult?.count ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="세입자"
        count={total}
        actions={
          <CreateDialog title="새 세입자" buttonLabel="새 세입자" wide>
            <TenantForm variant="plain" baseLocations={baseLocations} />
          </CreateDialog>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="이름 또는 전화번호 검색..." />
        <div className="flex flex-wrap gap-2">
          <FilterTabs
            paramKey="status"
            options={[
              { value: "all", label: "전체" },
              { value: "active", label: "입주" },
              { value: "inactive", label: "퇴거" },
              { value: "archived", label: "보관" },
              { value: "deleted", label: "휴지통" },
            ]}
          />
          <FilterTabs paramKey="branch" options={branchOptions} />
        </div>
      </div>

      <DataPanel>
        {tenants.length === 0 ? (
          <EmptyState
            icon={Users}
            title="세입자가 없습니다"
            description="검색 조건을 바꾸거나 새 세입자를 등록해 보세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>군종</TableHead>
                <TableHead>계급</TableHead>
                <TableHead>부대</TableHead>
                <TableHead>전화번호</TableHead>
                <TableHead>이메일</TableHead>
                {isLifecycleView && admin && (
                  <TableHead className="text-right">관리</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id} className="group">
                  <TableCell>
                    <Link
                      href={`/tenants/${tenant.id}`}
                      className="font-medium group-hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {tenant.deleted_at ? (
                      <StatusBadge status="inactive" label="삭제됨" />
                    ) : tenant.archived_at ? (
                      <StatusBadge status="inactive" label="보관" />
                    ) : (
                      <StatusBadge
                        status={tenant.status}
                        label={tenant.status === "active" ? "입주" : "퇴거"}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tenant.branch
                      ? (branchMap[tenant.branch] ?? tenant.branch)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {tenant.rank ? (
                      <Badge variant="secondary">{tenant.rank}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tenant.unit ?? "-"}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {formatPhone(tenant.phone)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tenant.email ?? "-"}
                  </TableCell>
                  {isLifecycleView && admin && (
                    <TableCell>
                      <TenantLifecycleActions
                        tenantId={tenant.id}
                        deleted={!!tenant.deleted_at}
                      />
                    </TableCell>
                  )}
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
