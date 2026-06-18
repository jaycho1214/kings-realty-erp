import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, sql } from "@kingsrealty/db";
import { DeleteButton } from "@/components/delete-button";
import { StatusBadge } from "@/components/status-badge";
import {
  DetailView,
  DefinitionGrid,
  DefGroup,
  Def,
  type Fact,
} from "@/components/detail";
import { formatKRW, formatDate } from "@/lib/utils";
import { daysUntil } from "@/lib/date";
import { leaseStatusMap } from "@/lib/labels";
import { LeaseForm } from "../_components/lease-form";
import { UtilityBills } from "./_components/utility-bills";
import { LeaseChecklist } from "./_components/lease-checklist";
import { deleteLease } from "../_actions";
import { DownloadLeaseButton } from "./_components/download-lease-button";
import { Inspections } from "./_components/inspections";
import { DepositSettlement } from "./_components/deposit-settlement";
import { getSession } from "@/lib/session";
import { canViewSensitive } from "@/lib/authz";

const realtyFeeCurrencySymbol: Record<string, string> = {
  USD: "$",
  KRW: "₩",
};

export default async function LeaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  const activeTab = tab?.[0] ?? "";
  const numId = Number(id);
  const db = getDb();

  const lease = await db
    .selectFrom("lease")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .innerJoin("property", "property.id", "lease.property_id")
    .innerJoin("landlord", "landlord.id", "property.landlord_id")
    .select([
      "lease.id",
      "lease.property_id",
      "lease.tenant_id",
      "lease.start_date",
      "lease.end_date",
      "lease.monthly_rent_krw",
      "lease.deposit_krw",
      "lease.landlord_rent_krw",
      "lease.landlord_deposit_krw",
      "lease.realty_fee",
      "lease.realty_fee_currency",
      "lease.auto_renew",
      "lease.status",
      "lease.notes",
      "tenant.name as tenant_name",
      sql<string>`coalesce(property.address_jibeon, property.address)`.as(
        "property_address",
      ),
      "landlord.id as landlord_id",
      "landlord.name as landlord_name",
      "landlord.phone as landlord_phone",
    ])
    .where("lease.id", "=", numId)
    .executeTakeFirst();

  if (!lease) notFound();

  const [
    properties,
    tenants,
    [, totalPaid, pendingCount],
    utilityBills,
    utilityTypes,
    depositPaid,
    propertyStatus,
    realtyFeeRows,
    inspections,
    depositSettlement,
    settlementSession,
  ] = await Promise.all([
    db
      .selectFrom("property")
      .select([
        "id",
        sql<string>`coalesce(property.address_jibeon, property.address) || coalesce(' ' || nullif(btrim(property.address_detail), ''), '')`.as(
          "address",
        ),
        // The 도로명 address as the combobox's second line — only when 지번 is
        // the primary, so it never duplicates the label.
        sql<
          string | null
        >`case when property.address_jibeon is not null then property.address else null end`.as(
          "address_sub",
        ),
        "monthly_rent_krw",
        "deposit_krw",
      ])
      .where((eb) =>
        eb.or([eb("status", "=", "vacant"), eb("id", "=", lease.property_id)]),
      )
      .orderBy(sql`coalesce(property.address_jibeon, property.address)`, "asc")
      .execute(),
    db
      .selectFrom("tenant")
      .select(["id", "name", "rank"])
      .orderBy("name", "asc")
      .execute(),
    Promise.all([
      db
        .selectFrom("payment")
        .select(({ fn }) => fn.count<number>("id").as("count"))
        .where("lease_id", "=", numId)
        .executeTakeFirst(),
      db
        .selectFrom("payment")
        .select(({ fn }) => fn.sum<number>("amount_krw").as("total"))
        .where("lease_id", "=", numId)
        .where("status", "=", "paid")
        .executeTakeFirst(),
      db
        .selectFrom("payment")
        .select(({ fn }) => fn.count<number>("id").as("count"))
        .where("lease_id", "=", numId)
        .where("status", "=", "pending")
        .executeTakeFirst(),
    ]),
    db
      .selectFrom("utility_bill")
      .select([
        "id",
        "billing_month",
        "utility_type_id",
        "amount_krw",
        "paid_to_company",
        "paid_to_company_date",
        "bearer",
        "payee",
        "notes",
      ])
      .where("lease_id", "=", numId)
      .orderBy("billing_month", "desc")
      .execute(),
    db
      .selectFrom("utility_type")
      .select(["id", "name"])
      .orderBy("name", "asc")
      .execute(),
    db
      .selectFrom("payment")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("lease_id", "=", numId)
      .where("payment_type", "=", "deposit")
      .where("status", "=", "paid")
      .executeTakeFirst(),
    db
      .selectFrom("property")
      .select(["status"])
      .where("id", "=", lease.property_id)
      .executeTakeFirst(),
    db
      .selectFrom("realty_fee_default")
      .select(["currency", "amount"])
      .execute(),
    db
      .selectFrom("inspection")
      .select([
        "id",
        "type",
        "inspected_at",
        "participants",
        "checklist",
        "summary",
      ])
      .where("lease_id", "=", numId)
      .orderBy("inspected_at", "desc")
      .execute(),
    db
      .selectFrom("deposit_settlement")
      .select([
        "deposit_amount",
        "deductions",
        "deduction_total",
        "refund_amount",
        "refund_method",
        "refunded_date",
        "status",
      ])
      .where("lease_id", "=", numId)
      .executeTakeFirst(),
    getSession(),
  ]);

  const canConfirmSettlement = canViewSensitive(settlementSession?.user?.role);

  const realtyFeeDefaults: { USD?: string; KRW?: string } = {};
  for (const row of realtyFeeRows) {
    realtyFeeDefaults[row.currency as "USD" | "KRW"] = String(row.amount);
  }

  const deleteAction = deleteLease.bind(null, numId);
  const hasDeposit = Number(depositPaid?.count ?? 0) > 0;
  const propStatus = propertyStatus?.status ?? "";

  const endDays = daysUntil(lease.end_date);

  const moveInItems = [
    {
      label: "세입자 등록",
      description: "세입자 정보가 등록되어 있어야 합니다",
      checked: true,
      href: `/tenants/${lease.tenant_id}`,
    },
    {
      label: "계약 등록",
      description: "임대 계약이 등록되어 있어야 합니다",
      checked: true,
      href: `/leases/${lease.id}`,
    },
    {
      label: "보증금 수납",
      description: "보증금이 수납 완료되어야 합니다",
      checked: hasDeposit,
      href: `/payments/new?lease=${lease.id}`,
    },
    {
      label: "매물 상태 변경",
      description: "매물 상태를 '입주중'으로 변경해야 합니다",
      checked: propStatus === "occupied",
      href: `/properties/${lease.property_id}`,
    },
  ];

  const showMoveOut = ["active", "terminated", "expired"].includes(
    lease.status,
  );

  const moveOutItems = [
    {
      label: "최종 공과금 확인",
      description: "퇴거 전 미납 공과금을 확인해야 합니다",
      checked: false,
      href: `/leases/${lease.id}`,
    },
    {
      label: "보증금 반환",
      description: "세입자에게 보증금을 반환해야 합니다",
      checked: false,
      href: `/payments/new?lease=${lease.id}`,
    },
    {
      label: "계약 종료 처리",
      description: "계약 상태를 종료로 변경해야 합니다",
      checked: lease.status === "terminated" || lease.status === "expired",
      href: `/leases/${lease.id}`,
    },
    {
      label: "매물 상태 변경",
      description: "매물 상태를 '공실'로 변경해야 합니다",
      checked: propStatus === "vacant",
      href: `/properties/${lease.property_id}`,
    },
  ];

  const facts: Fact[] = [
    { label: "월세", value: formatKRW(lease.monthly_rent_krw) },
    { label: "보증금", value: formatKRW(lease.deposit_krw), tone: "muted" },
    {
      label: "계약 만료",
      value: endDays >= 0 ? `D-${endDays}` : `D+${-endDays}`,
      sub: formatDate(lease.end_date),
      tone: endDays < 0 ? "danger" : endDays <= 30 ? "warning" : "default",
    },
    { label: "총 납부", value: formatKRW(totalPaid?.total ?? 0) },
    {
      label: "미납",
      value: `${Number(pendingCount?.count ?? 0)}건`,
      tone: Number(pendingCount?.count ?? 0) > 0 ? "danger" : "success",
    },
  ];

  const readView = (
    <div className="space-y-4">
      <DefinitionGrid>
        <DefGroup label="관계">
          <Def label="매물">
            <Link
              href={`/properties/${lease.property_id}`}
              className="text-brand hover:underline"
            >
              {lease.property_address}
            </Link>
          </Def>
          <Def label="세입자">
            <Link
              href={`/tenants/${lease.tenant_id}`}
              className="text-brand hover:underline"
            >
              {lease.tenant_name}
            </Link>
          </Def>
          <Def label="임대인">
            <Link
              href={`/landlords/${lease.landlord_id}`}
              className="text-brand hover:underline"
            >
              {lease.landlord_name}
            </Link>
          </Def>
          <Def label="임대인 연락처" mono>
            {lease.landlord_phone}
          </Def>
        </DefGroup>
        <DefGroup label="계약">
          <Def label="시작일" mono>
            {formatDate(lease.start_date)}
          </Def>
          <Def label="종료일" mono>
            {formatDate(lease.end_date)}
          </Def>
          <Def label="월세 · 임차인" mono>
            {formatKRW(lease.monthly_rent_krw)}
          </Def>
          <Def label="보증금 · 임차인" mono>
            {formatKRW(lease.deposit_krw)}
          </Def>
          <Def label="월세 · 임대인" mono>
            {lease.landlord_rent_krw != null
              ? formatKRW(lease.landlord_rent_krw)
              : "-"}
          </Def>
          <Def label="보증금 · 임대인" mono>
            {lease.landlord_deposit_krw != null
              ? formatKRW(lease.landlord_deposit_krw)
              : "-"}
          </Def>
          <Def label="중개 수수료" mono>
            {lease.realty_fee != null
              ? `${realtyFeeCurrencySymbol[lease.realty_fee_currency ?? "KRW"] ?? ""}${Number(
                  lease.realty_fee,
                ).toLocaleString()}`
              : "-"}
          </Def>
          <Def label="자동 갱신">{lease.auto_renew ? "예" : "아니오"}</Def>
          {lease.notes && (
            <Def label="메모" full>
              <span className="whitespace-pre-wrap">{lease.notes}</span>
            </Def>
          )}
        </DefGroup>
      </DefinitionGrid>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <DeleteButton
          action={deleteAction}
          title="계약을 삭제하시겠습니까?"
          description="계약을 삭제하면 관련 데이터에 영향을 줄 수 있습니다. 이 작업은 되돌릴 수 없습니다."
        />
      </div>
    </div>
  );

  const editView = (
    <LeaseForm
      variant="plain"
      defaultValues={{
        property_id: lease.property_id,
        tenant_id: lease.tenant_id,
        start_date: new Date(lease.start_date).toISOString().split("T")[0],
        end_date: new Date(lease.end_date).toISOString().split("T")[0],
        monthly_rent_krw: String(lease.monthly_rent_krw),
        deposit_krw: String(lease.deposit_krw),
        landlord_rent_krw:
          lease.landlord_rent_krw != null
            ? String(lease.landlord_rent_krw)
            : null,
        landlord_deposit_krw:
          lease.landlord_deposit_krw != null
            ? String(lease.landlord_deposit_krw)
            : null,
        realty_fee: lease.realty_fee != null ? String(lease.realty_fee) : null,
        realty_fee_currency: lease.realty_fee_currency,
        auto_renew: lease.auto_renew,
        status: lease.status,
        notes: lease.notes,
      }}
      leaseId={numId}
      properties={properties}
      tenants={tenants}
      realtyFeeDefaults={realtyFeeDefaults}
    />
  );

  return (
    <DetailView
      back={{ href: `/tenants/${lease.tenant_id}`, label: lease.tenant_name }}
      basePath={`/leases/${numId}`}
      activeTab={activeTab}
      title={lease.tenant_name}
      badges={
        <StatusBadge
          status={lease.status}
          label={leaseStatusMap[lease.status] ?? lease.status}
        />
      }
      actions={<DownloadLeaseButton leaseId={numId} />}
      facts={facts}
      info={{ read: readView, edit: editView }}
      tabs={[
        {
          key: "utilities",
          label: "공과금",
          count: utilityBills.length,
          content: (
            <UtilityBills
              leaseId={numId}
              bills={utilityBills}
              utilityTypes={utilityTypes}
            />
          ),
        },
        {
          key: "inspections",
          label: "입주/퇴거 점검",
          count: inspections.length,
          content: (
            <Inspections
              leaseId={numId}
              propertyId={lease.property_id}
              inspections={inspections.map((i) => ({
                ...i,
                inspected_at:
                  i.inspected_at instanceof Date
                    ? i.inspected_at.toISOString()
                    : String(i.inspected_at),
              }))}
            />
          ),
        },
        {
          key: "settlement",
          label: "보증금 정산",
          content: (
            <DepositSettlement
              leaseId={numId}
              depositKrw={Number(lease.deposit_krw)}
              canConfirm={canConfirmSettlement}
              settlement={
                depositSettlement
                  ? {
                      deposit_amount: String(depositSettlement.deposit_amount),
                      deductions: depositSettlement.deductions,
                      deduction_total: String(
                        depositSettlement.deduction_total,
                      ),
                      refund_amount: String(depositSettlement.refund_amount),
                      refund_method: depositSettlement.refund_method,
                      refunded_date: depositSettlement.refunded_date
                        ? new Date(
                            depositSettlement.refunded_date,
                          ).toISOString()
                        : null,
                      status: depositSettlement.status,
                    }
                  : null
              }
            />
          ),
        },
        {
          key: "checklist",
          label: "체크리스트",
          content: (
            <div className="space-y-6">
              <LeaseChecklist title="입주 체크리스트" items={moveInItems} />
              {showMoveOut && (
                <LeaseChecklist title="퇴거 체크리스트" items={moveOutItems} />
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
