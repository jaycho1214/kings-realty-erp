import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, sql } from "@kingsrealty/db";
import { DeleteButton } from "@/components/delete-button";
import { StatusBadge } from "@/components/status-badge";
import { DataPanel } from "@/components/data-panel";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DetailView,
  DefinitionGrid,
  DefGroup,
  Def,
  type Fact,
} from "@/components/detail";
import { formatKRW, formatDate } from "@/lib/utils";
import { sexMap, paymentStatusMap, paymentTypeMap } from "@/lib/labels";
import { seoulYMD, firstOfMonth, seoulDateString } from "@/lib/date";
import { getSession } from "@/lib/session";
import { canViewSensitive } from "@/lib/authz";
import { LandlordForm } from "../_components/landlord-form";
import { LandlordFamilyMembers } from "../_components/landlord-family-members";
import { LandlordSettlements } from "./_components/landlord-settlements";
import { LandlordRrn } from "./_components/landlord-rrn";
import { deleteLandlord } from "../_actions";

const businessTypeMap: Record<string, string> = {
  individual: "개인",
  business: "사업자",
};

const statusMap: Record<string, string> = {
  vacant: "공실",
  pending: "입주대기중",
  occupied: "입주중",
  move_out: "퇴거",
  maintenance: "수리",
  terminated: "계약해지",
};

export default async function LandlordDetailPage({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  const activeTab = tab?.[0] ?? "";
  const numId = Number(id);
  const db = getDb();

  const { year, month } = seoulYMD();
  const monthStart = firstOfMonth(year, month);

  const [
    landlord,
    properties,
    familyMembers,
    rentTotalResult,
    paidThisMonthResult,
    recentSettlements,
  ] = await Promise.all([
    db
      .selectFrom("landlord")
      .selectAll()
      .where("id", "=", numId)
      .executeTakeFirst(),
    db
      .selectFrom("property")
      .select([
        "id",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "address",
        ),
        "address_detail",
        "property_type",
        "status",
        "monthly_rent_krw",
        "deposit_krw",
      ])
      .where("landlord_id", "=", numId)
      .orderBy(sql`coalesce(property.address_jibeon, property.address)`, "asc")
      .orderBy("address_detail", "asc")
      .execute(),
    db
      .selectFrom("landlord_family_member")
      .select(["id", "name", "relationship", "sex", "phone", "notes"])
      .where("landlord_id", "=", numId)
      .orderBy("created_at", "asc")
      .execute(),
    db
      .selectFrom("property")
      .select(({ fn }) => fn.sum<number>("monthly_rent_krw").as("total"))
      .where("landlord_id", "=", numId)
      .where("status", "=", "occupied")
      .executeTakeFirst(),
    db
      .selectFrom("ledger_entry")
      .select(({ fn }) => fn.sum<number>("amount_krw").as("total"))
      .where("reference_type", "=", "landlord")
      .where("reference_id", "=", numId)
      .where("category", "=", "rent_expense")
      .where("entry_date", ">=", new Date(monthStart))
      .executeTakeFirst(),
    db
      .selectFrom("ledger_entry")
      .select(["id", "amount_krw", "description", "entry_date", "created_at"])
      .where("reference_type", "=", "landlord")
      .where("reference_id", "=", numId)
      .where("category", "=", "rent_expense")
      .orderBy("entry_date", "desc")
      .limit(20)
      .execute(),
  ]);

  if (!landlord) notFound();

  const session = await getSession();
  const canViewRrn = canViewSensitive(session?.user?.role);
  const hasRrn = !!landlord.rrn_encrypted;

  const propertyIds = properties.map((p) => p.id);

  const [paymentSummary, recentPayments] =
    propertyIds.length > 0
      ? await Promise.all([
          db
            .selectFrom("payment")
            .innerJoin("lease", "lease.id", "payment.lease_id")
            .innerJoin("property", "property.id", "lease.property_id")
            .innerJoin("tenant", "tenant.id", "lease.tenant_id")
            .select([
              db.fn.count<number>("payment.id").as("count"),
              db.fn.sum<number>("payment.amount_krw").as("total"),
            ])
            .where("property.landlord_id", "=", numId)
            .where("payment.status", "=", "paid")
            .where("tenant.deleted_at", "is", null)
            .executeTakeFirst(),
          db
            .selectFrom("payment")
            .innerJoin("lease", "lease.id", "payment.lease_id")
            .innerJoin("property", "property.id", "lease.property_id")
            .innerJoin("tenant", "tenant.id", "lease.tenant_id")
            .select([
              "payment.id",
              "payment.billing_month",
              "payment.payment_type",
              "payment.amount_krw",
              "payment.status",
              "payment.payment_date",
              "tenant.name as tenant_name",
              sql<string>`coalesce(property.address_jibeon, property.address)`.as(
                "property_address",
              ),
            ])
            .where("property.landlord_id", "=", numId)
            .where("tenant.deleted_at", "is", null)
            .orderBy("payment.payment_date", "desc")
            .limit(20)
            .execute(),
        ])
      : [{ count: 0, total: 0 }, []];

  const deleteAction = deleteLandlord.bind(null, numId);

  const rentTotal = Number(rentTotalResult?.total ?? 0);
  const paidThisMonth = Number(paidThisMonthResult?.total ?? 0);
  const balance = rentTotal - paidThisMonth;

  const facts: Fact[] = [
    { label: "소유 매물", value: `${properties.length}건` },
    {
      label: "총 수납금액",
      value: formatKRW(Number(paymentSummary?.total ?? 0)),
    },
    {
      label: "총 수납",
      value: `${Number(paymentSummary?.count ?? 0)}건`,
      tone: "muted",
    },
    { label: "이번 달 임대료", value: formatKRW(rentTotal) },
    {
      label: "정산 잔액",
      value: formatKRW(balance),
      tone: balance > 0 ? "danger" : "success",
    },
  ];

  const readView = (
    <div className="space-y-4">
      <DefinitionGrid>
        <DefGroup label="연락처">
          <Def label="전화" mono>
            {landlord.phone || "-"}
          </Def>
          <Def label="이메일">{landlord.email || "-"}</Def>
          <Def label="주소" full>
            {landlord.address || "-"}
          </Def>
        </DefGroup>
        <DefGroup label="인적사항">
          <Def label="구분">
            {landlord.business_type
              ? (businessTypeMap[landlord.business_type] ??
                landlord.business_type)
              : "-"}
          </Def>
          <Def label="성별">
            {landlord.sex ? (sexMap[landlord.sex] ?? landlord.sex) : "-"}
          </Def>
          <Def label="생년월일" mono>
            {formatDate(landlord.birth)}
          </Def>
          {canViewRrn && (
            <Def label="주민등록번호" mono>
              <LandlordRrn landlordId={numId} hasRrn={hasRrn} />
            </Def>
          )}
        </DefGroup>
        <DefGroup label="계좌">
          <Def label="은행명">{landlord.bank_name || "-"}</Def>
          <Def label="계좌번호" mono>
            {landlord.bank_account || "-"}
          </Def>
          <Def label="예금주">{landlord.account_holder || "-"}</Def>
          {landlord.notes && (
            <Def label="메모" full>
              <span className="whitespace-pre-wrap">{landlord.notes}</span>
            </Def>
          )}
        </DefGroup>
      </DefinitionGrid>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <DeleteButton
          action={deleteAction}
          title="임대인을 삭제하시겠습니까?"
          description="임대인을 삭제하면 관련 데이터에 영향을 줄 수 있습니다. 이 작업은 되돌릴 수 없습니다."
        />
      </div>
    </div>
  );

  const editView = (
    <LandlordForm
      variant="plain"
      defaultValues={{
        name: landlord.name,
        phone: landlord.phone,
        email: landlord.email,
        address: landlord.address,
        business_type: landlord.business_type,
        sex: landlord.sex,
        birth: landlord.birth
          ? seoulDateString(new Date(landlord.birth))
          : null,
        bank_name: landlord.bank_name,
        bank_account: landlord.bank_account,
        account_holder: landlord.account_holder,
        notes: landlord.notes,
      }}
      landlordId={numId}
      canViewRrn={canViewRrn}
      hasRrn={hasRrn}
    />
  );

  return (
    <DetailView
      back={{ href: "/landlords", label: "임대인" }}
      basePath={`/landlords/${numId}`}
      activeTab={activeTab}
      title={landlord.name}
      facts={facts}
      info={{ read: readView, edit: editView }}
      tabs={[
        {
          key: "family",
          label: "가족 구성원",
          count: familyMembers.length,
          content: (
            <LandlordFamilyMembers landlordId={numId} members={familyMembers} />
          ),
        },
        {
          key: "properties",
          label: "소유 매물",
          count: properties.length,
          content: (
            <DataPanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>주소</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">월세</TableHead>
                    <TableHead className="text-right">보증금</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.map((property) => (
                    <TableRow key={property.id} className="group">
                      <TableCell>
                        <Link
                          href={`/properties/${property.id}`}
                          className="group-hover:underline"
                        >
                          <span className="font-medium">
                            {property.address}
                          </span>
                          {property.address_detail && (
                            <span className="ml-1.5 text-muted-foreground">
                              {property.address_detail}
                            </span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {property.property_type}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={property.status}
                          label={statusMap[property.status] ?? property.status}
                        />
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatKRW(property.monthly_rent_krw)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {formatKRW(property.deposit_krw)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataPanel>
          ),
        },
        {
          key: "payments",
          label: "수납 내역",
          count: recentPayments.length,
          content: (
            <DataPanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>청구월</TableHead>
                    <TableHead>세입자</TableHead>
                    <TableHead>매물주소</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">금액(&#8361;)</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>납부일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayments.map((payment) => (
                    <TableRow key={payment.id} className="group">
                      <TableCell className="tabular">
                        <Link
                          href={`/payments/${payment.id}`}
                          className="font-medium group-hover:underline"
                        >
                          {formatDate(payment.billing_month)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.tenant_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.property_address}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {paymentTypeMap[payment.payment_type] ??
                          payment.payment_type}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatKRW(payment.amount_krw)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={payment.status}
                          label={
                            paymentStatusMap[payment.status] ?? payment.status
                          }
                        />
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {formatDate(payment.payment_date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataPanel>
          ),
        },
        {
          key: "settlement",
          label: "임대인 정산",
          count: recentSettlements.length,
          content: (
            <LandlordSettlements
              landlordId={numId}
              landlordName={landlord.name}
              monthlyRentTotal={rentTotal}
              paidThisMonth={paidThisMonth}
              recentSettlements={recentSettlements}
            />
          ),
        },
      ]}
    />
  );
}
