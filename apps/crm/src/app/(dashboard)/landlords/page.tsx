import Link from "next/link";
import { Contact } from "lucide-react";
import { getDb } from "@kingsrealty/db";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
import { CreateDialog } from "@/components/create-dialog";
import { PageHeader } from "@/components/page-header";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import { formatPhone } from "@/lib/utils";
import { getSession } from "@/lib/session";
import { canViewSensitive } from "@/lib/authz";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { LandlordForm } from "./_components/landlord-form";

const PAGE_SIZE = 20;

export default async function LandlordsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const currentPage = Number(page ?? "1");
  const offset = (currentPage - 1) * PAGE_SIZE;
  const db = getDb();

  const session = await getSession();
  const canViewRrn = canViewSensitive(session?.user?.role);

  let query = db
    .selectFrom("landlord")
    .leftJoin("property", "property.landlord_id", "landlord.id")
    .select([
      "landlord.id",
      "landlord.name",
      "landlord.phone",
      "landlord.email",
      "landlord.bank_name",
    ])
    .select(({ fn }) => fn.count<number>("property.id").as("property_count"))
    .groupBy([
      "landlord.id",
      "landlord.name",
      "landlord.phone",
      "landlord.email",
      "landlord.bank_name",
    ]);

  if (q) {
    query = query.where((eb) =>
      eb.or([
        eb("landlord.name", "ilike", `%${q}%`),
        eb("landlord.phone", "ilike", `%${q}%`),
      ]),
    );
  }

  let countQuery = db
    .selectFrom("landlord")
    .select(({ fn }) => fn.count<number>("id").as("count"));

  if (q) {
    countQuery = countQuery.where((eb) =>
      eb.or([
        eb("landlord.name", "ilike", `%${q}%`),
        eb("landlord.phone", "ilike", `%${q}%`),
      ]),
    );
  }

  const [landlords, totalResult] = await Promise.all([
    query
      .orderBy("landlord.created_at", "desc")
      .limit(PAGE_SIZE)
      .offset(offset)
      .execute(),
    countQuery.executeTakeFirst(),
  ]);

  const total = Number(totalResult?.count ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="임대인"
        count={total}
        actions={
          <CreateDialog title="새 임대인" buttonLabel="새 임대인">
            <LandlordForm variant="plain" canViewRrn={canViewRrn} />
          </CreateDialog>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="이름 또는 전화번호 검색..." />
      </div>

      <DataPanel>
        {landlords.length === 0 ? (
          <EmptyState
            icon={Contact}
            title="임대인이 없습니다"
            description="검색 조건을 바꾸거나 새 임대인을 등록해 보세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>전화번호</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>은행</TableHead>
                <TableHead className="text-right">매물 수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {landlords.map((landlord) => (
                <TableRow key={landlord.id} className="group">
                  <TableCell className="font-medium">
                    <Link
                      href={`/landlords/${landlord.id}`}
                      className="group-hover:underline"
                    >
                      {landlord.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {formatPhone(landlord.phone)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {landlord.email ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {landlord.bank_name ?? "-"}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {landlord.property_count ?? 0}
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
