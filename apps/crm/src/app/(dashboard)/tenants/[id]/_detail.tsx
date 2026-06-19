import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { getDb, sql } from "@kingsrealty/db";
import { DeleteButton } from "@/components/delete-button";
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
import { DataPanel } from "@/components/data-panel";
import { DetailView, type Fact } from "@/components/detail";
import {
  DefinitionGrid,
  DefGroup,
  Def,
  DetailPanel,
  DetailRow,
} from "@/components/detail";
import { formatKRW, formatDate } from "@/lib/utils";
import { daysUntil, seoulDateString } from "@/lib/date";
import { sexMap, branchMap, leaseStatusMap } from "@/lib/labels";
import { buildTenantLedger } from "@/lib/ledger";
import { getUsdToKrwRate, toKrw } from "@/lib/exchange";
import { getOhaLimit } from "@/lib/oha";
import { rankToGroupCode } from "@/lib/oha-groups";
import { getSession } from "@/lib/session";
import { canViewSensitive } from "@/lib/authz";
import { TenantLedger } from "../_components/tenant-ledger";
import { TenantCharges } from "../_components/tenant-charges";
import { TenantRecurringCharges } from "../_components/tenant-recurring-charges";
import { TenantForm } from "../_components/tenant-form";
import { FamilyMembers } from "../_components/family-members";
import { TenantPets } from "../_components/tenant-pets";
import { TenantNotes } from "../_components/tenant-notes";
import { TenantPayments } from "../_components/tenant-payments";
import { LandlordRrn } from "../../landlords/[id]/_components/landlord-rrn";
import { DocumentList } from "@/components/document-list";
import { CreateDialog } from "@/components/create-dialog";
import { deleteTenant } from "../_actions";
import { TenantStatusButton } from "../_components/tenant-status-button";
import { LeaseForm } from "../../leases/_components/lease-form";
import { OhaAllowancePopover } from "../_components/oha-allowance-popover";
import { Inspections } from "../_components/inspections";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  const activeTab = tab?.[0] ?? "";
  const numId = Number(id);
  const db = getDb();

  const tenant = await db
    .selectFrom("tenant")
    .selectAll()
    .where("id", "=", numId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  if (!tenant) notFound();

  const [
    familyMembers,
    pets,
    leases,
    payments,
    notes,
    baseLocations,
    documents,
  ] = await Promise.all([
    db
      .selectFrom("tenant_family_member")
      .select(["id", "name", "relationship", "sex", "birth", "phone", "notes"])
      .where("tenant_id", "=", numId)
      .orderBy("created_at", "asc")
      .execute(),
    db
      .selectFrom("tenant_pet")
      .select(["id", "name", "species", "breed", "size", "notes"])
      .where("tenant_id", "=", numId)
      .orderBy("created_at", "asc")
      .execute(),
    db
      .selectFrom("lease")
      .innerJoin("property", "property.id", "lease.property_id")
      .innerJoin("landlord", "landlord.id", "property.landlord_id")
      .select([
        "lease.id",
        "lease.start_date",
        "lease.end_date",
        "lease.monthly_rent_krw",
        "lease.deposit_krw",
        "lease.status",
        "property.id as property_id",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "address",
        ),
        "property.address_detail",
        "landlord.id as landlord_id",
        "landlord.name as landlord_name",
        "landlord.phone as landlord_phone",
        "landlord.birth as landlord_birth",
        "landlord.rrn_encrypted as landlord_rrn_encrypted",
      ])
      .where("lease.tenant_id", "=", numId)
      .orderBy("lease.start_date", "desc")
      .execute(),
    db
      .selectFrom("payment")
      .innerJoin("lease", "lease.id", "payment.lease_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "payment.id",
        "payment.lease_id",
        "payment.billing_month",
        "payment.payment_type",
        "payment.label",
        "payment.amount_krw",
        "payment.amount_paid",
        "payment.currency_paid",
        "payment.payment_method",
        "payment.bundle_id",
        "payment.status",
        "payment.payment_date",
        "payment.notes",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "address",
        ),
      ])
      .where("lease.tenant_id", "=", numId)
      .orderBy("payment.billing_month", "desc")
      .orderBy("payment.created_at", "desc")
      .execute(),
    db
      .selectFrom("tenant_note")
      .innerJoin("user", "user.id", "tenant_note.created_by")
      .select([
        "tenant_note.id",
        "tenant_note.content",
        "tenant_note.created_at",
        "user.name as author_name",
      ])
      .where("tenant_note.tenant_id", "=", numId)
      .orderBy("tenant_note.created_at", "desc")
      .execute(),
    db
      .selectFrom("base_location")
      .select(["id", "name", "name_ko"])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("document")
      .select([
        "id",
        "file_name",
        "file_url",
        "file_type",
        "title",
        "comments",
        "created_at",
      ])
      .where("entity_type", "=", "tenant")
      .where("entity_id", "=", numId)
      .orderBy("created_at", "desc")
      .execute(),
  ]);

  // Data for creating a new lease for this tenant (vacant units + fee defaults),
  // the unified ledger, exchange vendors, and the viewer's role.
  const [
    vacantProperties,
    realtyFeeRows,
    ledger,
    exchangeVendors,
    session,
    ohaLimit,
    charges,
    recurring,
    billPresets,
    ohaRateRows,
  ] = await Promise.all([
    db
      .selectFrom("property")
      .innerJoin("landlord", "landlord.id", "property.landlord_id")
      .select([
        "property.id",
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
        "property.monthly_rent_krw",
        "property.deposit_krw",
        "landlord.name as landlord_name",
      ])
      .where("property.status", "=", "vacant")
      .orderBy(sql`coalesce(property.address_jibeon, property.address)`, "asc")
      .execute(),
    db
      .selectFrom("realty_fee_default")
      .select(["currency", "amount"])
      .execute(),
    buildTenantLedger(numId),
    db
      .selectFrom("exchange_vendor")
      .select(["id", "name"])
      .where("is_active", "=", true)
      .orderBy("name", "asc")
      .execute(),
    getSession(),
    getOhaLimit(tenant.rank, tenant.dependent_status),
    db
      .selectFrom("charge_item")
      .select([
        "id",
        "type",
        "recurrence",
        "billing_month",
        "amount",
        "currency",
        "due_date",
        "status",
        "memo",
      ])
      .where("tenant_id", "=", numId)
      .orderBy("billing_month", "desc")
      .orderBy("created_at", "desc")
      .execute(),
    db
      .selectFrom("recurring_charge")
      .select([
        "id",
        "label",
        "type",
        "amount",
        "currency",
        "due_day",
        "active",
        "start_month",
        "end_month",
      ])
      .where("tenant_id", "=", numId)
      .orderBy("active", "desc")
      .orderBy("created_at", "asc")
      .execute(),
    db
      .selectFrom("bill_preset")
      .select([
        "id",
        "label",
        "type",
        "default_amount",
        "default_currency",
        "default_due_day",
        "is_variable",
      ])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("oha_rate")
      .select(["code", "dependent_status", "amount", "effective_from"])
      .where("effective_to", "is", null)
      .where("region", "=", "Default")
      .execute(),
  ]);

  const canEditLedger = canViewSensitive(session?.user?.role);
  const canViewRrn = canViewSensitive(session?.user?.role);

  const tenantGroupCode = rankToGroupCode(tenant.rank);

  const ohaRows: Record<string, { with: string; without: string }> = {};
  let ohaEffectiveFrom: string | null = null;
  for (const r of ohaRateRows) {
    const entry = (ohaRows[r.code] ??= { with: "0", without: "0" });
    if (r.dependent_status === "with") entry.with = String(r.amount);
    else entry.without = String(r.amount);
    if (!ohaEffectiveFrom && r.effective_from) {
      ohaEffectiveFrom =
        r.effective_from instanceof Date
          ? r.effective_from.toISOString().split("T")[0]
          : String(r.effective_from).slice(0, 10);
    }
  }

  const chargeRows = charges.map((c) => ({
    ...c,
    billing_month: c.billing_month
      ? new Date(c.billing_month).toISOString().split("T")[0]
      : null,
    amount: c.amount == null ? null : String(c.amount),
    due_date: c.due_date
      ? new Date(c.due_date).toISOString().split("T")[0]
      : null,
  }));

  const recurringRows = recurring.map((r) => ({
    id: r.id,
    label: r.label,
    type: r.type,
    amount: r.amount == null ? null : String(r.amount),
    currency: r.currency,
    due_day: r.due_day,
    active: r.active,
    start_month: r.start_month
      ? new Date(r.start_month).toISOString().split("T")[0]
      : null,
    end_month: r.end_month
      ? new Date(r.end_month).toISOString().split("T")[0]
      : null,
  }));

  const presetOptions = billPresets.map((p) => ({
    id: p.id,
    label: p.label,
    type: p.type,
    default_amount: p.default_amount == null ? null : String(p.default_amount),
    default_currency: p.default_currency,
    default_due_day: p.default_due_day,
    is_variable: p.is_variable,
  }));

  // 미납 = 금액이 있고 마감일이 지난 미수납 청구(월세·정기 포함). KRW 기준 합계.
  const today = seoulDateString();
  const arrearsCharges = chargeRows.filter(
    (c) =>
      c.amount != null &&
      (c.status === "billed" || c.status === "overdue") &&
      c.due_date != null &&
      c.due_date < today,
  );
  const usdRate = await getUsdToKrwRate();
  const arrearsCount = arrearsCharges.length;
  const arrearsTotalKrw = arrearsCharges.reduce(
    (sum, c) => sum + toKrw(Number(c.amount), c.currency, usdRate),
    0,
  );

  const realtyFeeDefaults: { USD?: string; KRW?: string } = {};
  for (const row of realtyFeeRows) {
    realtyFeeDefaults[row.currency as "USD" | "KRW"] = String(row.amount);
  }

  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount_krw), 0);

  const activeLease =
    leases.find((l) => l.status === "active" || l.status === "pending") ?? null;

  // 현재 거주지 전체 주소 (지번/도로명 + 상세) — 헤더 이름 아래 노출.
  const activeAddress = activeLease
    ? [activeLease.address, activeLease.address_detail?.trim()]
        .filter(Boolean)
        .join(" ")
    : null;

  // Inspections (입주/퇴거 점검) belong to a lease; bind the tab to the tenant's
  // most-recent lease (covers both move-in on a current lease and move-out on a
  // just-ended one).
  const inspectionLease = leases[0] ?? null;
  const inspections = inspectionLease
    ? await db
        .selectFrom("inspection")
        .select([
          "id",
          "type",
          "status",
          "inspected_at",
          "checklist",
          "summary",
        ])
        .where("lease_id", "=", inspectionLease.id)
        .orderBy("inspected_at", "desc")
        .execute()
    : [];

  const baseLocation = tenant.base_location_id
    ? baseLocations.find((b) => b.id === tenant.base_location_id)
    : null;

  const derosDays = tenant.deros ? daysUntil(tenant.deros) : null;

  // 조기 퇴거 — moved out while a contracted lease is still running (left
  // mid-lease, e.g. a sudden PCS order).
  const leaseRunning =
    tenant.status === "inactive" &&
    leases.some((l) => daysUntil(l.end_date) > 0);
  const branchLabel = tenant.branch
    ? (branchMap[tenant.branch] ?? tenant.branch)
    : null;

  const deleteAction = deleteTenant.bind(null, numId);

  const facts: Fact[] = [
    {
      label: "현재 월세",
      value: activeLease ? formatKRW(activeLease.monthly_rent_krw) : "-",
    },
    {
      label: "보증금",
      value: activeLease ? formatKRW(activeLease.deposit_krw) : "-",
      tone: activeLease ? "muted" : "default",
    },
    {
      label: "DEROS",
      value:
        derosDays == null
          ? "-"
          : derosDays >= 0
            ? `D-${derosDays}`
            : `D+${-derosDays}`,
      sub: tenant.deros ? formatDate(tenant.deros) : undefined,
      tone:
        derosDays == null
          ? "muted"
          : derosDays < 0
            ? "danger"
            : derosDays <= 90
              ? "warning"
              : "default",
    },
    {
      label: "미납",
      value: arrearsCount > 0 ? formatKRW(arrearsTotalKrw) : "없음",
      sub: arrearsCount > 0 ? `${arrearsCount}건` : undefined,
      tone: arrearsCount > 0 ? "danger" : "success",
    },
    { label: "총 납부", value: formatKRW(totalPaid) },
  ];

  const readView = (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <DefinitionGrid>
          <DefGroup label="연락처">
            <Def label="전화" mono>
              {tenant.phone || "-"}
            </Def>
            <Def label="이메일">{tenant.email || "-"}</Def>
          </DefGroup>
          <DefGroup label="인적사항">
            <Def label="성별">
              {tenant.sex ? (sexMap[tenant.sex] ?? tenant.sex) : "-"}
            </Def>
            <Def label="생년월일" mono>
              {formatDate(tenant.birth)}
            </Def>
          </DefGroup>
          <DefGroup label="군 정보">
            <Def label="소속">{branchLabel ?? "-"}</Def>
            <Def label="계급">{tenant.rank || "-"}</Def>
            <Def label="부대">{tenant.unit || "-"}</Def>
            <Def label="기지">
              {baseLocation
                ? `${baseLocation.name}${baseLocation.name_ko ? ` (${baseLocation.name_ko})` : ""}`
                : "-"}
            </Def>
            <Def label="DEROS" mono>
              {formatDate(tenant.deros)}
            </Def>
            <Def label="군 ID">{tenant.military_id || "-"}</Def>
            <Def label="부양가족">
              {tenant.dependent_status === "with"
                ? `동반${tenant.dependent_count ? ` (${tenant.dependent_count}명)` : ""}`
                : tenant.dependent_status === "without"
                  ? "비동반"
                  : familyMembers.length > 0
                    ? `${familyMembers.length}명`
                    : "-"}
            </Def>
            <Def label="OHA 한도" mono>
              {ohaLimit ? `${formatKRW(ohaLimit.amount)} / 월` : "기준표 없음"}
            </Def>
          </DefGroup>
        </DefinitionGrid>

        {activeLease ? (
          <div className="space-y-4">
            <DetailPanel
              title="임대인"
              action={
                <Link
                  href={`/landlords/${activeLease.landlord_id}`}
                  className="text-xs text-brand hover:underline"
                >
                  임대인 상세 →
                </Link>
              }
            >
              <DetailRow label="이름">
                <Link
                  href={`/landlords/${activeLease.landlord_id}`}
                  className="text-brand hover:underline"
                >
                  {activeLease.landlord_name}
                </Link>
              </DetailRow>
              <DetailRow label="전화" mono>
                {activeLease.landlord_phone || "-"}
              </DetailRow>
              <DetailRow label="생년월일" mono>
                {formatDate(activeLease.landlord_birth)}
              </DetailRow>
              {canViewRrn && (
                <DetailRow label="주민등록번호" mono>
                  <LandlordRrn
                    landlordId={activeLease.landlord_id}
                    hasRrn={!!activeLease.landlord_rrn_encrypted}
                  />
                </DetailRow>
              )}
            </DetailPanel>

            <DetailPanel
              title="현재 계약"
              action={
                <Link
                  href={`/leases/${activeLease.id}`}
                  className="text-xs text-brand hover:underline"
                >
                  계약 상세 →
                </Link>
              }
            >
              <DetailRow label="매물">
                <Link
                  href={`/properties/${activeLease.property_id}`}
                  className="text-brand hover:underline"
                >
                  {activeLease.address}
                </Link>
              </DetailRow>
              <DetailRow label="월세" mono>
                {formatKRW(activeLease.monthly_rent_krw)}
              </DetailRow>
              <DetailRow label="보증금" mono>
                {formatKRW(activeLease.deposit_krw)}
              </DetailRow>
              <DetailRow label="계약기간" mono>
                {formatDate(activeLease.start_date)} ~{" "}
                {formatDate(activeLease.end_date)}
              </DetailRow>
            </DetailPanel>
          </div>
        ) : (
          <DetailPanel title="현재 계약">
            <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">
              활성 계약이 없습니다.
            </p>
          </DetailPanel>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
        <TenantStatusButton tenantId={numId} currentStatus={tenant.status} />
        <DeleteButton
          action={deleteAction}
          title="세입자를 삭제하시겠습니까?"
          description="세입자를 삭제하면 관련 가족 구성원, 반려동물 데이터도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
        />
      </div>
    </div>
  );

  const editView = (
    <TenantForm
      variant="plain"
      defaultValues={{
        name: tenant.name,
        phone: tenant.phone,
        email: tenant.email,
        sex: tenant.sex,
        birth: tenant.birth
          ? new Date(tenant.birth).toISOString().split("T")[0]
          : null,
        branch: tenant.branch,
        rank: tenant.rank,
        unit: tenant.unit,
        base_location_id: tenant.base_location_id,
        deros: tenant.deros
          ? new Date(tenant.deros).toISOString().split("T")[0]
          : null,
        military_id: tenant.military_id,
        dependent_status: tenant.dependent_status,
        dependent_count: tenant.dependent_count,
      }}
      tenantId={numId}
      baseLocations={baseLocations}
    />
  );

  return (
    <DetailView
      back={{ href: "/tenants", label: "세입자" }}
      basePath={`/tenants/${numId}`}
      activeTab={activeTab}
      title={tenant.name}
      subtitle={
        activeLease && activeAddress ? (
          <Link
            href={`/properties/${activeLease.property_id}`}
            className="inline-flex items-start gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            {activeAddress}
          </Link>
        ) : undefined
      }
      badges={
        <>
          {tenant.status === "active" ? (
            <StatusBadge status="active" label="입주" />
          ) : leaseRunning ? (
            <StatusBadge
              status="inactive"
              label="조기 퇴거"
              className="border-warning/30 bg-warning-weak text-warning"
            />
          ) : (
            <StatusBadge status="inactive" label="퇴거" />
          )}
          {tenant.status === "inactive" && tenant.archived_at && (
            <Badge
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              퇴거 {formatDate(tenant.archived_at)}
            </Badge>
          )}
          {branchLabel && <Badge variant="secondary">{branchLabel}</Badge>}
          {tenant.rank && (
            <OhaAllowancePopover
              rank={tenant.rank}
              currentGroupCode={tenantGroupCode}
              rows={ohaRows}
              effectiveFrom={ohaEffectiveFrom}
            />
          )}
        </>
      }
      facts={facts}
      info={{ read: readView, edit: editView }}
      aside={
        <TenantNotes
          tenantId={numId}
          notes={notes.map((n) => ({
            ...n,
            created_at:
              n.created_at instanceof Date
                ? n.created_at.toISOString()
                : n.created_at,
            author_name: n.author_name,
          }))}
        />
      }
      tabs={[
        {
          key: "family",
          label: "가족 구성원",
          count: familyMembers.length,
          content: <FamilyMembers tenantId={numId} members={familyMembers} />,
        },
        {
          key: "pets",
          label: "반려동물",
          count: pets.length,
          content: <TenantPets tenantId={numId} pets={pets} />,
        },
        {
          key: "documents",
          label: "문서",
          count: documents.length,
          content: (
            <DocumentList
              entityType="tenant"
              entityId={numId}
              documents={documents}
            />
          ),
        },
        {
          key: "leases",
          label: "임대 계약",
          count: leases.length,
          content: (
            <DataPanel>
              <div className="flex items-center justify-end border-b border-border/60 p-2.5">
                <CreateDialog title="새 계약" buttonLabel="새 계약" wide>
                  <LeaseForm
                    variant="plain"
                    properties={vacantProperties.map((p) => ({
                      id: p.id,
                      address: `${p.address} (${p.landlord_name})`,
                      address_sub: p.address_sub,
                      monthly_rent_krw: p.monthly_rent_krw,
                      deposit_krw: p.deposit_krw,
                    }))}
                    tenants={[
                      { id: tenant.id, name: tenant.name, rank: tenant.rank },
                    ]}
                    defaultValues={{ tenant_id: numId }}
                    realtyFeeDefaults={realtyFeeDefaults}
                  />
                </CreateDialog>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>매물 주소</TableHead>
                    <TableHead>임대인</TableHead>
                    <TableHead>계약기간</TableHead>
                    <TableHead className="text-right">월세</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leases.map((lease) => (
                    <TableRow key={lease.id} className="group">
                      <TableCell>
                        <Link
                          href={`/leases/${lease.id}`}
                          className="font-medium group-hover:underline"
                        >
                          {lease.address}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <Link
                          href={`/landlords/${lease.landlord_id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {lease.landlord_name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {formatDate(lease.start_date)} ~{" "}
                        {formatDate(lease.end_date)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatKRW(lease.monthly_rent_krw)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={lease.status}
                          label={leaseStatusMap[lease.status] ?? lease.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataPanel>
          ),
        },
        {
          key: "inspections",
          label: "입주/퇴거 점검",
          count: inspections.length,
          content: (
            <Inspections
              tenantId={numId}
              leaseId={inspectionLease?.id ?? null}
              propertyId={inspectionLease?.property_id ?? null}
              inspections={inspections.map((i) => ({
                id: i.id,
                type: i.type,
                status: i.status,
                summary: i.summary,
                checklist: i.checklist,
                inspected_at:
                  i.inspected_at instanceof Date
                    ? i.inspected_at.toISOString()
                    : String(i.inspected_at),
              }))}
            />
          ),
        },
        {
          key: "recurring",
          label: "정기 청구",
          count: recurringRows.length,
          content: (
            <TenantRecurringCharges
              tenantId={numId}
              recurring={recurringRows}
              presets={presetOptions}
              hasActiveLease={!!activeLease}
            />
          ),
        },
        {
          key: "charges",
          label: "청구",
          count: chargeRows.length,
          content: (
            <TenantCharges
              tenantId={numId}
              charges={chargeRows}
              hasActiveLease={!!activeLease}
            />
          ),
        },
        {
          key: "ledger",
          label: "원장",
          count: ledger.rows.length,
          content: (
            <TenantLedger
              tenantId={numId}
              rows={ledger.rows}
              totalReceipts={ledger.totalReceipts}
              totalDisbursements={ledger.totalDisbursements}
              balance={ledger.balance}
              canEdit={canEditLedger}
              exchangeVendors={exchangeVendors}
            />
          ),
        },
        {
          key: "payments",
          label: "납부 내역",
          count: payments.length,
          content: (
            <TenantPayments
              tenantId={numId}
              payments={payments}
              leases={leases.map((l) => ({
                id: l.id,
                tenant_name: tenant.name,
                property_address: l.address,
              }))}
              billPresets={presetOptions}
            />
          ),
        },
      ]}
    />
  );
}
