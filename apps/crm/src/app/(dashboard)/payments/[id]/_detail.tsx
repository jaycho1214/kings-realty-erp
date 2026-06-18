import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, sql } from "@kingsrealty/db";
import { DeleteButton } from "@/components/delete-button";
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
  type DetailTab,
  type Fact,
} from "@/components/detail";
import { formatDateCompact, formatKRW, formatUSD } from "@/lib/utils";
import { currencyPaidLabel, methodMap } from "@/lib/labels";
import { PaymentForm } from "../_components/payment-form";
import { deletePayment } from "../_actions";
import { BillPaidToggle } from "../_components/bill-paid-toggle";
import { DocumentList } from "@/components/document-list";

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
  prepayment: { label: "선불금", variant: "outline" },
  service: { label: "AS비", variant: "destructive" },
};

const statusMap: Record<string, string> = {
  paid: "납부완료",
  pending: "미납",
  overdue: "연체",
};

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  const activeTab = tab?.[0] ?? "";
  const numId = Number(id);
  const db = getDb();

  const payment = await db
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
      "payment.exchange_rate_id",
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
      sql<string>`coalesce(property.address_jibeon, property.address)`.as(
        "property_address",
      ),
    ])
    .where("payment.id", "=", numId)
    .executeTakeFirst();

  if (!payment) notFound();

  const billingMonth = new Date(payment.billing_month);
  const billingMonthStr = `${billingMonth.getFullYear()}-${String(billingMonth.getMonth() + 1).padStart(2, "0")}`;
  const billingMonthDisplay = `${billingMonth.getFullYear()}.${String(billingMonth.getMonth() + 1).padStart(2, "0")}`;

  const billPaidByUser = payment.bill_paid_by
    ? await db
        .selectFrom("user")
        .select("name")
        .where("id", "=", payment.bill_paid_by)
        .executeTakeFirst()
    : null;

  const [leases, utilityBills, documents, billPresets] = await Promise.all([
    db
      .selectFrom("lease")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "lease.id",
        "tenant.name as tenant_name",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as(
          "property_address",
        ),
      ])
      .where((eb) =>
        eb.or([
          eb("lease.status", "=", "active"),
          eb("lease.id", "=", payment.lease_id),
        ]),
      )
      .orderBy("tenant.name", "asc")
      .execute(),
    payment.payment_type === "utility"
      ? db
          .selectFrom("utility_bill")
          .innerJoin(
            "utility_type",
            "utility_type.id",
            "utility_bill.utility_type_id",
          )
          .select([
            "utility_bill.id",
            "utility_bill.amount_krw",
            "utility_bill.billing_month",
            "utility_bill.due_date",
            "utility_bill.paid_to_company",
            "utility_bill.paid_to_company_date",
            "utility_bill.notes",
            "utility_type.name as utility_type_name",
          ])
          .where((eb) =>
            eb.or([
              eb("utility_bill.payment_id", "=", numId),
              eb.and([
                eb("utility_bill.lease_id", "=", payment.lease_id),
                eb(
                  "utility_bill.billing_month",
                  "=",
                  new Date(payment.billing_month),
                ),
              ]),
            ]),
          )
          .orderBy("utility_type.name", "asc")
          .execute()
      : Promise.resolve([]),
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
      .where("entity_type", "=", "payment")
      .where("entity_id", "=", numId)
      .orderBy("created_at", "desc")
      .execute(),
    db
      .selectFrom("bill_preset")
      .select(["id", "label", "type"])
      .orderBy("sort_order", "asc")
      .execute(),
  ]);

  const deleteAction = deletePayment.bind(null, numId);
  const paymentType = paymentTypeMap[payment.payment_type];
  const method = methodMap[payment.payment_method] ?? payment.payment_method;
  const paidAmount =
    payment.currency_paid === "USD"
      ? formatUSD(payment.amount_paid)
      : formatKRW(payment.amount_paid);
  const utilityTypeLabel =
    payment.payment_type === "utility" && utilityBills.length > 0
      ? utilityBills.map((b) => b.utility_type_name).join(", ")
      : null;

  const facts: Fact[] = [
    { label: "청구월", value: billingMonthDisplay },
    { label: "금액", value: formatKRW(payment.amount_krw) },
    { label: "납부금액", value: paidAmount },
    { label: "결제방법", value: method, mono: false },
    {
      label: "정산",
      value: payment.bill_paid ? "완료" : "미정산",
      tone: payment.bill_paid ? "success" : "warning",
    },
  ];

  const readView = (
    <div className="space-y-4">
      <DefinitionGrid>
        <DefGroup label="수납 정보">
          <Def label="세입자">
            <Link
              href={`/tenants/${payment.tenant_id}`}
              className="text-brand hover:underline"
            >
              {payment.tenant_name}
            </Link>
          </Def>
          <Def label="매물">
            <Link
              href={`/properties/${payment.property_id}`}
              className="text-brand hover:underline"
            >
              {payment.property_address}
            </Link>
          </Def>
          <Def label="청구월" mono>
            {billingMonthDisplay}
          </Def>
          <Def label="금액" mono>
            {formatKRW(payment.amount_krw)}
          </Def>
          <Def label="납부통화" mono>
            {currencyPaidLabel(payment.currency_paid)}
          </Def>
          <Def label="납부금액" mono>
            {paidAmount}
          </Def>
          <Def label="결제방법">{method}</Def>
          <Def label="납부일" mono>
            {formatDateCompact(payment.payment_date)}
          </Def>
        </DefGroup>
        <DefGroup label="정산">
          <Def label="정산 상태">
            <BillPaidToggle paymentId={numId} paid={payment.bill_paid} />
          </Def>
          {payment.bill_paid && payment.bill_paid_at && (
            <Def label="정산일" mono>
              {formatDateCompact(payment.bill_paid_at)}
            </Def>
          )}
          {payment.bill_paid && billPaidByUser && (
            <Def label="정산자">{billPaidByUser.name}</Def>
          )}
          {payment.notes && (
            <Def label="메모" full>
              <span className="whitespace-pre-wrap">{payment.notes}</span>
            </Def>
          )}
        </DefGroup>
      </DefinitionGrid>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <DeleteButton
          action={deleteAction}
          title="수납 내역을 삭제하시겠습니까?"
          description="수납 내역을 삭제하면 관련 데이터에 영향을 줄 수 있습니다. 이 작업은 되돌릴 수 없습니다."
        />
      </div>
    </div>
  );

  const editView = (
    <PaymentForm
      defaultValues={{
        lease_id: payment.lease_id,
        payment_type: payment.payment_type,
        billing_month: billingMonthStr,
        amount_krw: String(payment.amount_krw),
        currency_paid: payment.currency_paid,
        amount_paid: String(payment.amount_paid),
        payment_method: payment.payment_method,
        payment_date: new Date(payment.payment_date)
          .toISOString()
          .split("T")[0],
        status: payment.status,
        notes: payment.notes,
      }}
      paymentId={numId}
      leases={leases}
      billPresets={billPresets}
    />
  );

  const tabs: DetailTab[] = [
    {
      key: "documents",
      label: "문서",
      count: documents.length,
      content: (
        <DocumentList
          entityType="payment"
          entityId={numId}
          documents={documents}
        />
      ),
    },
  ];

  if (utilityBills.length > 0) {
    tabs.push({
      key: "utility-bill",
      label: "공과금 청구서",
      count: utilityBills.length,
      content: (
        <DataPanel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>유형</TableHead>
                <TableHead className="text-right">금액(&#8361;)</TableHead>
                <TableHead>청구월</TableHead>
                <TableHead>납부기한</TableHead>
                <TableHead>회사 납부</TableHead>
                <TableHead>회사 납부일</TableHead>
                <TableHead>비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {utilityBills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium">
                    {bill.utility_type_name}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatKRW(bill.amount_krw)}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {new Date(bill.billing_month).getFullYear()}.
                    {String(
                      new Date(bill.billing_month).getMonth() + 1,
                    ).padStart(2, "0")}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {bill.due_date ? formatDateCompact(bill.due_date) : "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={bill.paid_to_company ? "paid" : "pending"}
                      label={bill.paid_to_company ? "완료" : "미납"}
                    />
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {bill.paid_to_company_date
                      ? formatDateCompact(bill.paid_to_company_date)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {bill.notes ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataPanel>
      ),
    });
  }

  return (
    <DetailView
      back={{ href: "/payments", label: "수납" }}
      basePath={`/payments/${numId}`}
      activeTab={activeTab}
      title={payment.tenant_name}
      badges={
        <>
          <StatusBadge
            status={payment.status}
            label={statusMap[payment.status] ?? payment.status}
          />
          {paymentType && (
            <Badge variant={paymentType.variant}>{paymentType.label}</Badge>
          )}
          {utilityTypeLabel && (
            <Badge variant="outline">{utilityTypeLabel}</Badge>
          )}
        </>
      }
      facts={facts}
      info={{ read: readView, edit: editView }}
      tabs={tabs}
    />
  );
}
