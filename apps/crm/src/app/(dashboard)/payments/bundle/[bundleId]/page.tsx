import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@kingsrealty/db";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import {
  DetailView,
  DefinitionGrid,
  DefGroup,
  Def,
  type Fact,
} from "@/components/detail";
import {
  formatKRW,
  formatUSD,
  formatDateCompact,
  formatBillingMonth,
} from "@/lib/utils";
import { currencyPaidLabel, methodMap } from "@/lib/labels";
import { BillPaidToggle } from "../../_components/bill-paid-toggle";

const paymentTypeMap: Record<
  string,
  {
    label: string;
    variant?: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  rent: { label: "월세", variant: "outline" },
  utility: { label: "공과금", variant: "secondary" },
  deposit: { label: "보증금", variant: "outline" },
  service: { label: "AS비", variant: "destructive" },
};

const statusMap: Record<string, string> = {
  paid: "납부완료",
  pending: "미납",
  overdue: "연체",
};

export default async function BundleDetailPage({
  params,
}: {
  params: Promise<{ bundleId: string }>;
}) {
  const { bundleId } = await params;
  const db = getDb();

  const payments = await db
    .selectFrom("payment")
    .innerJoin("lease", "lease.id", "payment.lease_id")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .innerJoin("property", "property.id", "lease.property_id")
    .select([
      "payment.id",
      "payment.lease_id",
      "payment.payment_type",
      "payment.billing_month",
      "payment.amount_krw",
      "payment.amount_paid",
      "payment.currency_paid",
      "payment.payment_method",
      "payment.payment_date",
      "payment.status",
      "payment.bill_paid",
      "payment.bill_paid_at",
      "payment.bill_paid_by",
      "payment.notes",
      "tenant.id as tenant_id",
      "tenant.name as tenant_name",
      "property.id as property_id",
      "property.address as property_address",
    ])
    .where("payment.bundle_id", "=", bundleId)
    .orderBy("payment.created_at", "asc")
    .execute();

  if (payments.length === 0) notFound();

  const first = payments[0];
  const totalKrw = payments.reduce((sum, p) => sum + Number(p.amount_krw), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const allBillPaid = payments.every((p) => p.bill_paid);
  const billingMonthDisplay = formatBillingMonth(first.billing_month);

  const paidByIds = [
    ...new Set(payments.map((p) => p.bill_paid_by).filter(Boolean)),
  ] as number[];
  const paidByUsers =
    paidByIds.length > 0
      ? await db
          .selectFrom("user")
          .select(["id", "name"])
          .where("id", "in", paidByIds)
          .execute()
      : [];
  const userNameMap = new Map(paidByUsers.map((u) => [u.id, u.name]));

  const types = [...new Set(payments.map((p) => p.payment_type))];
  const totalPaidDisplay =
    first.currency_paid === "USD" ? formatUSD(totalPaid) : formatKRW(totalPaid);

  const facts: Fact[] = [
    { label: "청구월", value: billingMonthDisplay },
    { label: "총 금액", value: formatKRW(totalKrw) },
    { label: "총 납부금액", value: totalPaidDisplay },
    { label: "통화", value: currencyPaidLabel(first.currency_paid) },
    {
      label: "정산",
      value: allBillPaid ? "완료" : "미정산",
      tone: allBillPaid ? "success" : "warning",
    },
  ];

  const summary = (
    <DefinitionGrid>
      <DefGroup label="수납 정보">
        <Def label="세입자">
          <Link
            href={`/tenants/${first.tenant_id}`}
            className="text-brand hover:underline"
          >
            {first.tenant_name}
          </Link>
        </Def>
        <Def label="매물">
          <Link
            href={`/properties/${first.property_id}`}
            className="text-brand hover:underline"
          >
            {first.property_address}
          </Link>
        </Def>
        <Def label="총 금액" mono>
          {formatKRW(totalKrw)}
        </Def>
        <Def label="총 납부금액" mono>
          {totalPaidDisplay}
        </Def>
        <Def label="결제방법">
          {methodMap[first.payment_method] ?? first.payment_method}
        </Def>
        <Def label="납부일" mono>
          {formatDateCompact(first.payment_date)}
        </Def>
      </DefGroup>
      <DefGroup label="정산">
        <Def label="정산 상태">
          <BillPaidToggle bundleId={bundleId} paid={allBillPaid} />
        </Def>
        {first.notes && (
          <Def label="메모" full>
            <span className="whitespace-pre-wrap">{first.notes}</span>
          </Def>
        )}
      </DefGroup>
    </DefinitionGrid>
  );

  const breakdown = (
    <DataPanel>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>유형</TableHead>
            <TableHead className="text-right">금액(&#8361;)</TableHead>
            <TableHead className="text-right">납부금액</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>정산</TableHead>
            <TableHead>정산일</TableHead>
            <TableHead>정산자</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => {
            const typeInfo = paymentTypeMap[payment.payment_type] ?? {
              label: payment.payment_type,
              variant: "outline" as const,
            };
            const paidAmount =
              payment.currency_paid === "USD"
                ? formatUSD(payment.amount_paid)
                : formatKRW(payment.amount_paid);
            return (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">
                  <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                </TableCell>
                <TableCell className="tabular text-right">
                  {formatKRW(payment.amount_krw)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {paidAmount}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={payment.status}
                    label={statusMap[payment.status] ?? payment.status}
                  />
                </TableCell>
                <TableCell>
                  <BillPaidToggle
                    paymentId={payment.id}
                    paid={payment.bill_paid}
                  />
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  {payment.bill_paid && payment.bill_paid_at
                    ? formatDateCompact(payment.bill_paid_at)
                    : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {payment.bill_paid && payment.bill_paid_by
                    ? (userNameMap.get(payment.bill_paid_by) ?? "-")
                    : "-"}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/payments/${payment.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    상세
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </DataPanel>
  );

  return (
    <DetailView
      back={{ href: "/payments", label: "수납" }}
      title={`${first.tenant_name} · 묶음 수납`}
      badges={
        <>
          <StatusBadge
            status={first.status}
            label={statusMap[first.status] ?? first.status}
          />
          {types.map((t) => {
            const typeInfo = paymentTypeMap[t];
            return typeInfo ? (
              <Badge key={t} variant={typeInfo.variant}>
                {typeInfo.label}
              </Badge>
            ) : null;
          })}
          <Badge variant="outline">{payments.length}건</Badge>
        </>
      }
      facts={facts}
      tabs={[
        { label: "요약", content: summary },
        { label: "묶음 내역", count: payments.length, content: breakdown },
      ]}
    />
  );
}
