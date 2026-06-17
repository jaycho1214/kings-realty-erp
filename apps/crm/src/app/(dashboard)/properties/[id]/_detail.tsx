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
import {
  DetailView,
  DefinitionGrid,
  DefGroup,
  Def,
  type Fact,
} from "@/components/detail";
import { formatKRW, formatDate } from "@/lib/utils";
import { PropertyForm } from "../_components/property-form";
import { PropertyEquipment } from "../_components/property-equipment";
import { PropertyPayments } from "../_components/property-payments";
import { deleteProperty } from "../_actions";

const LEASE_STATUS_LABEL: Record<string, string> = {
  active: "활성",
  expired: "만료",
  terminated: "해지",
  pending: "대기",
};

const propertyTypeMap: Record<string, string> = {
  apartment: "아파트",
  villa: "빌라",
  house: "단독주택",
  officetel: "오피스텔",
};

const statusMap: Record<string, string> = {
  vacant: "공실",
  pending: "입주대기중",
  occupied: "입주중",
  move_out: "퇴거",
  maintenance: "수리",
  terminated: "계약해지",
};

const permissionMap: Record<string, string> = {
  pending: "대기",
  approved: "승인",
  rejected: "거절",
};

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  const activeTab = tab?.[0] ?? "";
  const numId = Number(id);
  const db = getDb();

  const [property, landlords, leases, payments, equipment, billPresets] =
    await Promise.all([
      db
        .selectFrom("property")
        .innerJoin("landlord", "landlord.id", "property.landlord_id")
        .select([
          "property.id",
          "property.address",
          "property.address_jibeon",
          "property.address_detail",
          "property.property_type",
          "property.rooms",
          "property.bathrooms",
          "property.size_pyeong",
          "property.monthly_rent_krw",
          "property.deposit_krw",
          "property.status",
          "property.permission_status",
          "property.landlord_id",
          "property.management_phone",
          "property.address_en",
          "property.notes",
          "property.moveout_date",
          "landlord.name as landlord_name",
        ])
        .where("property.id", "=", numId)
        .executeTakeFirst(),
      db
        .selectFrom("landlord")
        .select(["id", "name"])
        .orderBy("name", "asc")
        .execute(),
      db
        .selectFrom("lease")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select([
          "lease.id",
          "lease.tenant_id",
          "lease.start_date",
          "lease.end_date",
          "lease.monthly_rent_krw",
          "lease.deposit_krw",
          "lease.status",
          "tenant.name as tenant_name",
        ])
        .where("lease.property_id", "=", numId)
        .where("tenant.deleted_at", "is", null)
        .orderBy("lease.start_date", "desc")
        .execute(),
      db
        .selectFrom("payment")
        .innerJoin("lease", "lease.id", "payment.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select([
          "payment.id",
          "payment.lease_id",
          "payment.billing_month",
          "payment.payment_type",
          "payment.amount_krw",
          "payment.amount_paid",
          "payment.currency_paid",
          "payment.payment_method",
          "payment.bundle_id",
          "payment.status",
          "payment.payment_date",
          "payment.notes",
          "tenant.id as tenant_id",
          "tenant.name as tenant_name",
        ])
        .where("lease.property_id", "=", numId)
        .where("tenant.deleted_at", "is", null)
        .orderBy("payment.billing_month", "desc")
        .orderBy("payment.created_at", "desc")
        .execute(),
      db
        .selectFrom("property_equipment")
        .selectAll()
        .where("property_id", "=", numId)
        .orderBy("created_at", "asc")
        .execute(),
      db
        .selectFrom("bill_preset")
        .select(["id", "label", "type"])
        .orderBy("sort_order", "asc")
        .execute(),
    ]);

  if (!property) notFound();

  const deleteWithId = deleteProperty.bind(null, numId);

  const facts: Fact[] = [
    { label: "월세", value: formatKRW(property.monthly_rent_krw) },
    { label: "보증금", value: formatKRW(property.deposit_krw), tone: "muted" },
    {
      label: "평수",
      value: property.size_pyeong ? `${Number(property.size_pyeong)}평` : "-",
    },
    { label: "계약", value: `${leases.length}건` },
    { label: "수납", value: `${payments.length}건` },
  ];

  const readView = (
    <div className="space-y-4">
      <DefinitionGrid>
        <DefGroup label="매물 정보">
          <Def label="유형">
            {propertyTypeMap[property.property_type] ?? property.property_type}
          </Def>
          <Def label="임대인">
            <Link
              href={`/landlords/${property.landlord_id}`}
              className="text-brand hover:underline"
            >
              {property.landlord_name}
            </Link>
          </Def>
          <Def label="방" mono>
            {property.rooms}
          </Def>
          <Def label="화장실" mono>
            {property.bathrooms}
          </Def>
          <Def label="월세" mono>
            {formatKRW(property.monthly_rent_krw)}
          </Def>
          <Def label="보증금" mono>
            {formatKRW(property.deposit_krw)}
          </Def>
        </DefGroup>
        <DefGroup label="주소">
          <Def label="도로명 주소">{property.address || "-"}</Def>
          <Def label="지번 주소">{property.address_jibeon || "-"}</Def>
          <Def label="상세 주소">{property.address_detail || "-"}</Def>
          <Def label="영문 주소">{property.address_en || "-"}</Def>
          <Def label="관리실 연락처" mono>
            {property.management_phone || "-"}
          </Def>
        </DefGroup>
        <DefGroup label="상태">
          <Def label="매물 상태">
            <StatusBadge
              status={property.status}
              label={statusMap[property.status] ?? property.status}
            />
          </Def>
          <Def label="허가">
            <StatusBadge
              status={property.permission_status}
              label={
                permissionMap[property.permission_status] ??
                property.permission_status
              }
            />
          </Def>
          {property.notes && (
            <Def label="메모" full>
              <span className="whitespace-pre-wrap">{property.notes}</span>
            </Def>
          )}
        </DefGroup>
      </DefinitionGrid>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <DeleteButton action={deleteWithId} />
      </div>
    </div>
  );

  const editView = (
    <PropertyForm
      variant="plain"
      propertyId={numId}
      landlords={landlords}
      defaultValues={{
        address: property.address,
        address_jibeon: property.address_jibeon ?? null,
        address_detail: property.address_detail,
        address_en: property.address_en ?? null,
        property_type: property.property_type,
        rooms: property.rooms,
        bathrooms: property.bathrooms,
        size_pyeong: property.size_pyeong ? Number(property.size_pyeong) : null,
        monthly_rent_krw: Number(property.monthly_rent_krw),
        deposit_krw: Number(property.deposit_krw),
        status: property.status,
        permission_status: property.permission_status,
        landlord_id: property.landlord_id,
        notes: property.notes,
        management_phone: property.management_phone,
        moveout_date: property.moveout_date
          ? new Date(property.moveout_date).toISOString().split("T")[0]
          : null,
      }}
    />
  );

  return (
    <DetailView
      back={{ href: "/properties", label: "매물" }}
      basePath={`/properties/${numId}`}
      activeTab={activeTab}
      title={property.address}
      badges={
        <>
          <StatusBadge
            status={property.status}
            label={statusMap[property.status] ?? property.status}
          />
          <Badge variant="secondary">
            {propertyTypeMap[property.property_type] ?? property.property_type}
          </Badge>
        </>
      }
      facts={facts}
      info={{ read: readView, edit: editView }}
      tabs={[
        {
          key: "equipment",
          label: "장비/설비",
          count: equipment.length,
          content: (
            <PropertyEquipment propertyId={numId} equipment={equipment} />
          ),
        },
        {
          key: "leases",
          label: "임대 계약",
          count: leases.length,
          content: (
            <DataPanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>임차인</TableHead>
                    <TableHead>시작일</TableHead>
                    <TableHead>종료일</TableHead>
                    <TableHead className="text-right">월세</TableHead>
                    <TableHead className="text-right">보증금</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leases.map((lease) => (
                    <TableRow key={lease.id} className="group">
                      <TableCell className="font-medium">
                        <Link
                          href={`/tenants/${lease.tenant_id}`}
                          className="group-hover:underline"
                        >
                          {lease.tenant_name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        <Link
                          href={`/leases/${lease.id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {formatDate(lease.start_date)}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        <Link
                          href={`/leases/${lease.id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {formatDate(lease.end_date)}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatKRW(lease.monthly_rent_krw)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {formatKRW(lease.deposit_krw)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={lease.status}
                          label={
                            LEASE_STATUS_LABEL[lease.status] ?? lease.status
                          }
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
          key: "payments",
          label: "수납 내역",
          count: payments.length,
          content: (
            <PropertyPayments
              propertyId={numId}
              payments={payments}
              leases={leases.map((l) => ({
                id: l.id,
                tenant_name: l.tenant_name,
                property_address: property.address_jibeon || property.address,
              }))}
              billPresets={billPresets}
            />
          ),
        },
      ]}
    />
  );
}
