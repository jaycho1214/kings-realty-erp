import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@kingsrealty/db";
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
import { daysUntil } from "@/lib/date";
import {
  sexMap,
  branchMap,
  leaseStatusMap,
  paymentStatusMap,
  paymentTypeMap,
} from "@/lib/labels";
import { buildTenantLedger } from "@/lib/ledger";
import { getOhaLimit } from "@/lib/oha";
import { getSession } from "@/lib/session";
import { canViewSensitive } from "@/lib/authz";
import { TenantLedger } from "../_components/tenant-ledger";
import { TenantCharges } from "../_components/tenant-charges";
import { TenantForm } from "../_components/tenant-form";
import { FamilyMembers } from "../_components/family-members";
import { TenantPets } from "../_components/tenant-pets";
import { TenantNotes } from "../_components/tenant-notes";
import { DocumentList } from "@/components/document-list";
import { CreateDialog } from "@/components/create-dialog";
import { deleteTenant } from "../_actions";
import { TenantStatusButton } from "../_components/tenant-status-button";
import { LeaseForm } from "../../leases/_components/lease-form";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
        "property.address",
        "landlord.id as landlord_id",
        "landlord.name as landlord_name",
        "landlord.phone as landlord_phone",
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
        "payment.billing_month",
        "payment.payment_type",
        "payment.amount_krw",
        "payment.status",
        "payment.payment_date",
        "property.address",
      ])
      .where("lease.tenant_id", "=", numId)
      .orderBy("payment.billing_month", "desc")
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
  ] = await Promise.all([
    db
      .selectFrom("property")
      .innerJoin("landlord", "landlord.id", "property.landlord_id")
      .select([
        "property.id",
        "property.address",
        "property.monthly_rent_krw",
        "property.deposit_krw",
        "landlord.name as landlord_name",
      ])
      .where("property.status", "=", "vacant")
      .orderBy("property.address", "asc")
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
  ]);

  const canEditLedger = canViewSensitive(session?.user?.role);

  const chargeRows = charges.map((c) => ({
    ...c,
    billing_month: c.billing_month
      ? new Date(c.billing_month).toISOString().split("T")[0]
      : null,
    amount: String(c.amount),
    due_date: c.due_date
      ? new Date(c.due_date).toISOString().split("T")[0]
      : null,
  }));

  const realtyFeeDefaults: { USD?: string; KRW?: string } = {};
  for (const row of realtyFeeRows) {
    realtyFeeDefaults[row.currency as "USD" | "KRW"] = String(row.amount);
  }

  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount_krw), 0);

  const unpaidCount = payments.filter(
    (p) => p.status === "pending" || p.status === "overdue",
  ).length;

  const activeLease =
    leases.find((l) => l.status === "active" || l.status === "pending") ?? null;

  const baseLocation = tenant.base_location_id
    ? baseLocations.find((b) => b.id === tenant.base_location_id)
    : null;

  const derosDays = tenant.deros ? daysUntil(tenant.deros) : null;

  const statusLabel = tenant.status === "active" ? "활성" : "비활성";
  const branchLabel = tenant.branch
    ? (branchMap[tenant.branch] ?? tenant.branch)
    : null;
  const identityChip = [branchLabel, tenant.rank].filter(Boolean).join(" · ");

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
      value: `${unpaidCount}건`,
      tone: unpaidCount > 0 ? "danger" : "success",
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
              {ohaLimit
                ? `$${ohaLimit.amount.toLocaleString()} / 월`
                : "기준표 없음"}
            </Def>
          </DefGroup>
        </DefinitionGrid>

        <DetailPanel
          title="현재 계약"
          action={
            activeLease ? (
              <Link
                href={`/leases/${activeLease.id}`}
                className="text-xs text-brand hover:underline"
              >
                계약 상세 →
              </Link>
            ) : null
          }
        >
          {activeLease ? (
            <>
              <DetailRow label="매물">
                <Link
                  href={`/properties/${activeLease.property_id}`}
                  className="text-brand hover:underline"
                >
                  {activeLease.address}
                </Link>
              </DetailRow>
              <DetailRow label="임대인">
                <Link
                  href={`/landlords/${activeLease.landlord_id}`}
                  className="text-brand hover:underline"
                >
                  {activeLease.landlord_name}
                </Link>
              </DetailRow>
              <DetailRow label="임대인 연락처" mono>
                {activeLease.landlord_phone}
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
            </>
          ) : (
            <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">
              활성 계약이 없습니다.
            </p>
          )}
        </DetailPanel>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
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
      title={tenant.name}
      badges={
        <>
          <StatusBadge status={tenant.status} label={statusLabel} />
          {identityChip && <Badge variant="secondary">{identityChip}</Badge>}
        </>
      }
      facts={facts}
      info={{ read: readView, edit: editView }}
      tabs={[
        {
          label: "가족 구성원",
          count: familyMembers.length,
          content: <FamilyMembers tenantId={numId} members={familyMembers} />,
        },
        {
          label: "반려동물",
          count: pets.length,
          content: <TenantPets tenantId={numId} pets={pets} />,
        },
        {
          label: "메모",
          count: notes.length,
          content: (
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
          ),
        },
        {
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
          label: "납부 내역",
          count: payments.length,
          content: (
            <DataPanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>청구월</TableHead>
                    <TableHead>매물 주소</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">금액(&#8361;)</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>납부일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id} className="group">
                      <TableCell className="tabular">
                        <Link
                          href={`/payments/${payment.id}`}
                          className="font-medium group-hover:underline"
                        >
                          {new Date(payment.billing_month).toLocaleDateString(
                            "ko-KR",
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.address}
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
                        {new Date(payment.payment_date).toLocaleDateString(
                          "ko-KR",
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataPanel>
          ),
        },
      ]}
    />
  );
}
