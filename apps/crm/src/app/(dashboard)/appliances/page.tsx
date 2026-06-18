import Link from "next/link";
import { Refrigerator } from "lucide-react";
import { getDb, sql } from "@kingsrealty/db";
import { CreateDialog } from "@/components/create-dialog";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { FilterTabs } from "@/components/filter-tabs";
import { PageHeader } from "@/components/page-header";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import { escapeLike } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ApplianceForm } from "./_components/appliance-form";

const OWNER_LABEL: Record<string, string> = {
  landlord: "집주인",
  office: "킹스",
  tenant: "세입자",
};

const STATUS_LABEL: Record<string, string> = {
  normal: "정상",
  repair: "수리필요",
  broken: "사용불가",
};

const PAGE_SIZE = 200;

const ownerOptions = [
  { value: "all", label: "전체" },
  { value: "landlord", label: "집주인" },
  { value: "office", label: "킹스" },
  { value: "tenant", label: "세입자" },
];

const statusOptions = [
  { value: "all", label: "전체 상태" },
  { value: "normal", label: "정상" },
  { value: "repair", label: "수리필요" },
  { value: "broken", label: "사용불가" },
];

export default async function AppliancesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    owner?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const search = params.q ?? "";
  const ownerFilter = params.owner ?? "";
  const statusFilter = params.status ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const db = getDb();

  let query = db
    .selectFrom("appliance")
    .innerJoin("property", "property.id", "appliance.property_id")
    .select([
      "appliance.id",
      "appliance.name",
      "appliance.owner",
      "appliance.brand",
      "appliance.model_number",
      "appliance.as_contact",
      "appliance.status",
      "property.id as property_id",
      sql<string>`coalesce(property.address_jibeon, property.address)`.as(
        "property_address",
      ),
    ]);

  if (search) {
    const escaped = escapeLike(search);
    query = query.where((eb) =>
      eb.or([
        eb("appliance.name", "ilike", `%${escaped}%`),
        eb("appliance.brand", "ilike", `%${escaped}%`),
        eb("appliance.model_number", "ilike", `%${escaped}%`),
      ]),
    );
  }
  if (ownerFilter) query = query.where("appliance.owner", "=", ownerFilter);
  if (statusFilter) query = query.where("appliance.status", "=", statusFilter);

  const [countResult, appliances] = await Promise.all([
    query
      .clearSelect()
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow(),
    query
      .orderBy("appliance.created_at", "desc")
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
      .execute(),
  ]);

  const total = Number(countResult.count);

  // First photo per appliance (for the row thumbnail).
  const ids = appliances.map((a) => a.id);
  const photos = ids.length
    ? await db
        .selectFrom("document")
        .select(["id", "entity_id"])
        .where("entity_type", "=", "appliance")
        .where("entity_id", "in", ids)
        .where("file_type", "like", "image/%")
        .orderBy("created_at", "asc")
        .execute()
    : [];
  const thumbByAppliance = new Map<number, number>();
  for (const p of photos) {
    if (!thumbByAppliance.has(p.entity_id))
      thumbByAppliance.set(p.entity_id, p.id);
  }

  // Properties for the create form's selector.
  const properties = await db
    .selectFrom("property")
    .select([
      "id",
      sql<string>`coalesce(address_jibeon, address)`.as("address"),
    ])
    .orderBy("created_at", "desc")
    .execute();

  return (
    <div className="space-y-5">
      <PageHeader
        title="비품"
        count={total}
        actions={
          <CreateDialog title="새 비품" buttonLabel="새 비품" wide>
            <ApplianceForm properties={properties} variant="plain" />
          </CreateDialog>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="비품명·브랜드·모델 검색..." />
        <div className="flex flex-wrap gap-2">
          <FilterTabs paramKey="owner" options={ownerOptions} />
          <FilterTabs paramKey="status" options={statusOptions} />
        </div>
      </div>

      <DataPanel>
        {appliances.length === 0 ? (
          <EmptyState
            icon={Refrigerator}
            title="비품이 없습니다"
            description="검색 조건을 바꾸거나 새 비품을 등록해 보세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[56px]">사진</TableHead>
                <TableHead>비품명</TableHead>
                <TableHead>매물</TableHead>
                <TableHead>소유</TableHead>
                <TableHead>브랜드·모델</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>A/S</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appliances.map((a) => {
                const thumbId = thumbByAppliance.get(a.id);
                return (
                  <TableRow key={a.id} className="group">
                    <TableCell>
                      {thumbId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/documents/${thumbId}`}
                          alt=""
                          className="size-9 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Refrigerator className="size-4" strokeWidth={1.8} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/appliances/${a.id}`}
                        className="group-hover:underline"
                      >
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Link
                        href={`/properties/${a.property_id}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {a.property_address}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {OWNER_LABEL[a.owner] ?? a.owner}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[a.brand, a.model_number].filter(Boolean).join(" · ") ||
                        "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={a.status}
                        label={STATUS_LABEL[a.status] ?? a.status}
                      />
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {a.as_contact || "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataPanel>

      <Pagination total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
