import Link from "next/link";
import { getDb, sql } from "@kingsrealty/db";
import { SearchInput } from "@/components/search-input";
import { Pagination } from "@/components/pagination";
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
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import {
  formatKRW,
  formatUSD,
  formatDateCompact,
  formatBillingMonth,
} from "@/lib/utils";
import { currencyPaidLabel, methodMap } from "@/lib/labels";
import { Package, CreditCard } from "lucide-react";
import { BillPaidToggle } from "./_components/bill-paid-toggle";

const PAGE_SIZE = 200;

const statusLabelMap: Record<string, string> = {
  paid: "납부완료",
  pending: "미납",
  overdue: "연체",
};

const typeMap: Record<
  string,
  {
    label: string;
    variant?: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  rent: { label: "월세", variant: "outline" },
  utility: { label: "공과금", variant: "outline" },
  deposit: { label: "보증금", variant: "outline" },
  service: { label: "AS비", variant: "outline" },
};

const typeOptions = [
  { value: "all", label: "전체" },
  { value: "rent", label: "월세" },
  { value: "utility", label: "공과금" },
  { value: "deposit", label: "보증금" },
  { value: "service", label: "AS비" },
];

const statusOptions = [
  { value: "all", label: "전체 상태" },
  { value: "paid", label: "납부완료" },
  { value: "pending", label: "미납" },
  { value: "overdue", label: "연체" },
];

type PaymentRow = {
  id: number;
  billing_month: Date | string;
  payment_type: string;
  label: string | null;
  amount_krw: string | number;
  amount_paid: string | number;
  currency_paid: string;
  payment_method: string;
  payment_date: Date | string;
  status: string;
  bill_paid: boolean;
  bill_paid_at: Date | string | null;
  bundle_id: string | null;
  tenant_id: number;
  tenant_name: string;
  property_id: number;
  property_address: string;
};

type BundleGroup = {
  bundleId: string;
  payments: PaymentRow[];
  totalKrw: number;
  totalPaid: number;
  tenantName: string;
  tenantId: number;
  propertyAddress: string;
  propertyId: number;
  billingMonth: Date | string;
  paymentDate: Date | string;
  paymentMethod: string;
  currencyPaid: string;
  status: string;
};

type DisplayItem =
  | { kind: "single"; payment: PaymentRow }
  | { kind: "bundle"; bundle: BundleGroup };

function groupPayments(payments: PaymentRow[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  const bundleMap = new Map<string, PaymentRow[]>();
  const seen = new Set<string>();

  // First pass: collect bundles
  for (const p of payments) {
    if (p.bundle_id) {
      if (!bundleMap.has(p.bundle_id)) bundleMap.set(p.bundle_id, []);
      bundleMap.get(p.bundle_id)!.push(p);
    }
  }

  // Second pass: build display list preserving order
  for (const p of payments) {
    if (p.bundle_id) {
      if (seen.has(p.bundle_id)) continue;
      seen.add(p.bundle_id);
      const group = bundleMap.get(p.bundle_id)!;
      items.push({
        kind: "bundle",
        bundle: {
          bundleId: p.bundle_id,
          payments: group,
          totalKrw: group.reduce((sum, r) => sum + Number(r.amount_krw), 0),
          totalPaid: group.reduce((sum, r) => sum + Number(r.amount_paid), 0),
          tenantName: p.tenant_name,
          tenantId: p.tenant_id,
          propertyAddress: p.property_address,
          propertyId: p.property_id,
          billingMonth: p.billing_month,
          paymentDate: p.payment_date,
          paymentMethod: p.payment_method,
          currencyPaid: p.currency_paid,
          status: p.status,
        },
      });
    } else {
      items.push({ kind: "single", payment: p });
    }
  }

  return items;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    type?: string;
    status?: string;
  }>;
}) {
  const { q, page, type, status } = await searchParams;
  const currentPage = Math.max(1, Math.floor(Number(page) || 1));
  const offset = (currentPage - 1) * PAGE_SIZE;
  const activeType = type ?? "all";
  const activeStatus = status ?? "all";
  const db = getDb();

  // A "display group" is a bundle (rows sharing bundle_id) or a single payment.
  // Paginate over groups, not raw rows, so a bundle never straddles a page
  // boundary and the page count matches the number of visible rows.
  const groupKey = sql<string>`coalesce(payment.bundle_id, 'single-' || payment.id::text)`;

  let filtered = db
    .selectFrom("payment")
    .innerJoin("lease", "lease.id", "payment.lease_id")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .innerJoin("property", "property.id", "lease.property_id")
    .where("tenant.deleted_at", "is", null);

  if (q) {
    filtered = filtered.where((eb) =>
      eb.or([
        eb("tenant.name", "ilike", `%${q}%`),
        eb("property.address", "ilike", `%${q}%`),
        eb("property.address_jibeon", "ilike", `%${q}%`),
      ]),
    );
  }
  if (activeType !== "all") {
    filtered = filtered.where("payment.payment_type", "=", activeType);
  }
  if (activeStatus !== "all") {
    filtered = filtered.where("payment.status", "=", activeStatus);
  }

  const [groupRows, totalResult] = await Promise.all([
    filtered
      .select(groupKey.as("gkey"))
      .groupBy(groupKey)
      .orderBy(sql`max(payment.created_at)`, "desc")
      .limit(PAGE_SIZE)
      .offset(offset)
      .execute(),
    filtered
      .select(sql<number>`count(distinct ${groupKey})`.as("count"))
      .executeTakeFirst(),
  ]);

  const keys = groupRows.map((g) => g.gkey);
  const total = Number(totalResult?.count ?? 0);

  const payments =
    keys.length === 0
      ? []
      : await filtered
          .select([
            "payment.id",
            "payment.billing_month",
            "payment.payment_type",
            "payment.label",
            "payment.amount_krw",
            "payment.amount_paid",
            "payment.currency_paid",
            "payment.payment_method",
            "payment.payment_date",
            "payment.status",
            "payment.bill_paid",
            "payment.bill_paid_at",
            "payment.bundle_id",
            "tenant.id as tenant_id",
            "tenant.name as tenant_name",
            "property.id as property_id",
            sql<string>`coalesce(property.address_jibeon, property.address)`.as(
              "property_address",
            ),
          ])
          .where(groupKey, "in", keys)
          .orderBy("payment.created_at", "desc")
          .execute();

  // Preserve the paginated group order exactly (handles created_at ties).
  const groupOrder = new Map(keys.map((k, i) => [k, i]));
  const displayItems = groupPayments(payments as PaymentRow[]).sort((a, b) => {
    const ka =
      a.kind === "bundle" ? a.bundle.bundleId : `single-${a.payment.id}`;
    const kb =
      b.kind === "bundle" ? b.bundle.bundleId : `single-${b.payment.id}`;
    return (groupOrder.get(ka) ?? 0) - (groupOrder.get(kb) ?? 0);
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="수납"
        count={total}
        createHref="/payments/new"
        createLabel="새 수납"
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="세입자 또는 주소 검색..." />
        <div className="flex flex-wrap gap-2">
          <FilterTabs paramKey="type" options={typeOptions} />
          <FilterTabs paramKey="status" options={statusOptions} />
        </div>
      </div>

      <DataPanel>
        {displayItems.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="수납 내역이 없습니다"
            description="검색 조건을 바꾸거나 새 수납을 등록해 보세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>청구월</TableHead>
                <TableHead>세입자</TableHead>
                <TableHead>매물주소</TableHead>
                <TableHead>유형</TableHead>
                <TableHead className="text-right">금액(₩)</TableHead>
                <TableHead className="text-right">납부금액</TableHead>
                <TableHead>통화</TableHead>
                <TableHead>결제방법</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>정산</TableHead>
                <TableHead>날짜</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayItems.map((item) => {
                if (item.kind === "single") {
                  const payment = item.payment;
                  const baseType = typeMap[payment.payment_type] ?? {
                    label: payment.payment_type,
                    variant: "outline" as const,
                  };
                  const paymentType = payment.label
                    ? { ...baseType, label: payment.label }
                    : baseType;
                  const paidAmount =
                    payment.currency_paid === "USD"
                      ? formatUSD(payment.amount_paid)
                      : formatKRW(payment.amount_paid);
                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/payments/${payment.id}`}
                          className="hover:underline"
                        >
                          {formatBillingMonth(payment.billing_month)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/tenants/${payment.tenant_id}`}
                          className="hover:underline"
                        >
                          {payment.tenant_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/properties/${payment.property_id}`}
                          className="hover:underline"
                        >
                          {payment.property_address}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentType.variant}>
                          {paymentType.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatKRW(payment.amount_krw)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {paidAmount}
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {currencyPaidLabel(payment.currency_paid)}
                      </TableCell>
                      <TableCell>
                        {methodMap[payment.payment_method] ??
                          payment.payment_method}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={payment.status}
                          label={
                            statusLabelMap[payment.status] ?? payment.status
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <BillPaidToggle
                            paymentId={payment.id}
                            paid={payment.bill_paid}
                          />
                          {payment.bill_paid && payment.bill_paid_at && (
                            <span className="text-[10px] text-muted-foreground">
                              {formatDateCompact(payment.bill_paid_at)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {formatDateCompact(payment.payment_date)}
                      </TableCell>
                    </TableRow>
                  );
                }

                // Bundle row
                const { bundle } = item;
                return <BundleRows key={bundle.bundleId} bundle={bundle} />;
              })}
            </TableBody>
          </Table>
        )}
      </DataPanel>

      <Pagination total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}

function BundleRows({ bundle }: { bundle: BundleGroup }) {
  return (
    <>
      {/* Bundle header row */}
      <TableRow className="bg-muted/50 border-b-0">
        <TableCell className="font-medium">
          <Link
            href={`/payments/bundle/${bundle.bundleId}`}
            className="hover:underline"
          >
            {formatBillingMonth(bundle.billingMonth)}
          </Link>
        </TableCell>
        <TableCell>
          <Link
            href={`/tenants/${bundle.tenantId}`}
            className="hover:underline"
          >
            {bundle.tenantName}
          </Link>
        </TableCell>
        <TableCell>
          <Link
            href={`/properties/${bundle.propertyId}`}
            className="hover:underline"
          >
            {bundle.propertyAddress}
          </Link>
        </TableCell>
        <TableCell>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Package className="size-3" />
            묶음 {bundle.payments.length}건
          </span>
        </TableCell>
        <TableCell className="tabular text-right font-medium">
          {formatKRW(bundle.totalKrw)}
        </TableCell>
        <TableCell className="tabular text-right">
          {bundle.currencyPaid === "USD"
            ? formatUSD(bundle.totalPaid)
            : formatKRW(bundle.totalPaid)}
        </TableCell>
        <TableCell className="tabular text-muted-foreground">
          {currencyPaidLabel(bundle.currencyPaid)}
        </TableCell>
        <TableCell>
          {methodMap[bundle.paymentMethod] ?? bundle.paymentMethod}
        </TableCell>
        <TableCell>
          <StatusBadge
            status={bundle.status}
            label={statusLabelMap[bundle.status] ?? bundle.status}
          />
        </TableCell>
        <TableCell />
        <TableCell className="tabular text-muted-foreground">
          {formatDateCompact(bundle.paymentDate)}
        </TableCell>
      </TableRow>
      {/* Individual items within bundle */}
      {bundle.payments.map((payment) => {
        const baseType = typeMap[payment.payment_type] ?? {
          label: payment.payment_type,
          variant: "outline" as const,
        };
        const paymentType = payment.label
          ? { ...baseType, label: payment.label }
          : baseType;
        return (
          <TableRow
            key={payment.id}
            className="bg-muted/20 border-b-0 last:border-b"
          >
            <TableCell className="pl-8">
              <Link
                href={`/payments/${payment.id}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                상세
              </Link>
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell>
              <Badge variant={paymentType.variant} className="text-[10px]">
                {paymentType.label}
              </Badge>
            </TableCell>
            <TableCell className="tabular text-right text-xs">
              {formatKRW(payment.amount_krw)}
            </TableCell>
            <TableCell className="tabular text-right text-xs">
              {payment.currency_paid === "USD"
                ? formatUSD(payment.amount_paid)
                : formatKRW(payment.amount_paid)}
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell>
              <div className="flex flex-col items-start gap-1">
                <BillPaidToggle
                  paymentId={payment.id}
                  paid={payment.bill_paid}
                />
                {payment.bill_paid && payment.bill_paid_at && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatDateCompact(payment.bill_paid_at)}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell />
          </TableRow>
        );
      })}
    </>
  );
}
