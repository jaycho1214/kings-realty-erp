"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, CreditCard, Pencil, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import {
  formatKRW,
  formatUSD,
  formatBillingMonth,
  formatDate,
} from "@/lib/utils";
import { paymentStatusMap, paymentTypeMap } from "@/lib/labels";
import { PaymentForm } from "../../payments/_components/payment-form";
import { updatePropertyPayment } from "../../payments/_actions";

type PaymentLease = {
  id: number;
  tenant_name: string;
  property_address: string;
};

export type PropertyPaymentRow = {
  id: number;
  lease_id: number;
  billing_month: Date | string;
  payment_type: string;
  amount_krw: string | number;
  amount_paid: string | number;
  currency_paid: string;
  payment_method: string;
  status: string;
  payment_date: Date | string;
  notes: string | null;
  bundle_id: string | null;
  tenant_id: number;
  tenant_name: string;
};

type Bundle = {
  bundleId: string;
  items: PropertyPaymentRow[];
  totalKrw: number;
  billingMonth: Date | string;
  paymentDate: Date | string;
  tenantId: number;
  tenantName: string;
  status: string;
};

type DisplayItem =
  | { kind: "single"; payment: PropertyPaymentRow }
  | { kind: "bundle"; bundle: Bundle };

/** Local "YYYY-MM" for a <input type="month">, matching formatBillingMonth. */
function toMonthInput(value: Date | string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Local "YYYY-MM-DD" for a <input type="date">, matching formatDate. */
function toDateInput(value: Date | string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Group rows that share a bundle_id (paid together in one 수납) so a single
 * transaction reads as one line with its component items beneath it, mirroring
 * the main /payments list. Order follows each group's first occurrence.
 */
function groupPayments(payments: PropertyPaymentRow[]): DisplayItem[] {
  const byBundle = new Map<string, PropertyPaymentRow[]>();
  for (const p of payments) {
    if (!p.bundle_id) continue;
    if (!byBundle.has(p.bundle_id)) byBundle.set(p.bundle_id, []);
    byBundle.get(p.bundle_id)!.push(p);
  }

  const items: DisplayItem[] = [];
  const seen = new Set<string>();
  for (const p of payments) {
    if (p.bundle_id) {
      if (seen.has(p.bundle_id)) continue;
      seen.add(p.bundle_id);
      const group = byBundle.get(p.bundle_id)!;
      items.push({
        kind: "bundle",
        bundle: {
          bundleId: p.bundle_id,
          items: group,
          totalKrw: group.reduce((sum, r) => sum + Number(r.amount_krw), 0),
          billingMonth: p.billing_month,
          paymentDate: p.payment_date,
          tenantId: p.tenant_id,
          tenantName: p.tenant_name,
          status: p.status,
        },
      });
    } else {
      items.push({ kind: "single", payment: p });
    }
  }
  return items;
}

function paidAmount(row: {
  amount_paid: string | number;
  currency_paid: string;
}) {
  return row.currency_paid === "USD"
    ? formatUSD(row.amount_paid)
    : formatKRW(row.amount_paid);
}

/** Right-click menu shared by every editable payment row. */
function RowMenu({
  payment,
  onEdit,
}: {
  payment: PropertyPaymentRow;
  onEdit: (p: PropertyPaymentRow) => void;
}) {
  return (
    <ContextMenuContent>
      <ContextMenuItem onClick={() => onEdit(payment)}>
        <Pencil />
        수정
      </ContextMenuItem>
      <ContextMenuItem render={<Link href={`/payments/${payment.id}`} />}>
        <ExternalLink />
        상세 보기
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

export function PropertyPayments({
  propertyId,
  payments,
  leases,
  billPresets,
}: {
  propertyId: number;
  payments: PropertyPaymentRow[];
  leases: PaymentLease[];
  billPresets?: { id: number; label: string; type: string }[];
}) {
  const displayItems = groupPayments(payments);
  const [editing, setEditing] = useState<PropertyPaymentRow | null>(null);

  if (displayItems.length === 0) {
    return (
      <DataPanel>
        <EmptyState
          icon={CreditCard}
          title="수납 내역이 없습니다"
          description="이 매물의 수납 기록이 아직 없습니다."
        />
      </DataPanel>
    );
  }

  return (
    <>
      <DataPanel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>청구월</TableHead>
              <TableHead>세입자</TableHead>
              <TableHead>유형</TableHead>
              <TableHead className="text-right">금액(&#8361;)</TableHead>
              <TableHead className="text-right">납부금액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>납부일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayItems.map((item) => {
              if (item.kind === "single") {
                const p = item.payment;
                return (
                  <ContextMenu key={p.id}>
                    <ContextMenuTrigger
                      render={
                        <tr className="group cursor-context-menu border-b transition-colors hover:bg-muted/50 data-[popup-open]:bg-muted/50" />
                      }
                    >
                      <TableCell className="tabular">
                        <Link
                          href={`/payments/${p.id}`}
                          className="font-medium group-hover:underline"
                        >
                          {formatBillingMonth(p.billing_month)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <Link
                          href={`/tenants/${p.tenant_id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {p.tenant_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {paymentTypeMap[p.payment_type] ?? p.payment_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatKRW(p.amount_krw)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {paidAmount(p)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={p.status}
                          label={paymentStatusMap[p.status] ?? p.status}
                        />
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {formatDate(p.payment_date)}
                      </TableCell>
                    </ContextMenuTrigger>
                    <RowMenu payment={p} onEdit={setEditing} />
                  </ContextMenu>
                );
              }

              const { bundle } = item;
              return (
                <BundleRows
                  key={bundle.bundleId}
                  bundle={bundle}
                  onEdit={setEditing}
                />
              );
            })}
          </TableBody>
        </Table>
      </DataPanel>

      <PaymentEditDialog
        propertyId={propertyId}
        payment={editing}
        leases={leases}
        billPresets={billPresets}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function BundleRows({
  bundle,
  onEdit,
}: {
  bundle: Bundle;
  onEdit: (p: PropertyPaymentRow) => void;
}) {
  return (
    <>
      {/* Bundle header — one 수납 paid together (aggregate, not directly editable) */}
      <TableRow className="border-b-0 bg-muted/50">
        <TableCell className="tabular">
          <Link
            href={`/payments/bundle/${bundle.bundleId}`}
            className="font-medium hover:underline"
          >
            {formatBillingMonth(bundle.billingMonth)}
          </Link>
        </TableCell>
        <TableCell className="text-muted-foreground">
          <Link
            href={`/tenants/${bundle.tenantId}`}
            className="hover:text-foreground hover:underline"
          >
            {bundle.tenantName}
          </Link>
        </TableCell>
        <TableCell>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Package className="size-3" />
            묶음 {bundle.items.length}건
          </span>
        </TableCell>
        <TableCell className="tabular text-right font-medium">
          {formatKRW(bundle.totalKrw)}
        </TableCell>
        <TableCell />
        <TableCell>
          <StatusBadge
            status={bundle.status}
            label={paymentStatusMap[bundle.status] ?? bundle.status}
          />
        </TableCell>
        <TableCell className="tabular text-muted-foreground">
          {formatDate(bundle.paymentDate)}
        </TableCell>
      </TableRow>
      {/* Component items within the 수납 — each editable on its own */}
      {bundle.items.map((p) => (
        <ContextMenu key={p.id}>
          <ContextMenuTrigger
            render={
              <tr className="group cursor-context-menu border-b-0 bg-muted/20 transition-colors last:border-b hover:bg-muted/40 data-[popup-open]:bg-muted/40" />
            }
          >
            <TableCell className="pl-8">
              <Link
                href={`/payments/${p.id}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                상세
              </Link>
            </TableCell>
            <TableCell />
            <TableCell>
              <Badge variant="outline" className="text-[10px]">
                {paymentTypeMap[p.payment_type] ?? p.payment_type}
              </Badge>
            </TableCell>
            <TableCell className="tabular text-right text-xs">
              {formatKRW(p.amount_krw)}
            </TableCell>
            <TableCell className="tabular text-right text-xs text-muted-foreground">
              {paidAmount(p)}
            </TableCell>
            <TableCell />
            <TableCell />
          </ContextMenuTrigger>
          <RowMenu payment={p} onEdit={onEdit} />
        </ContextMenu>
      ))}
    </>
  );
}

function PaymentEditDialog({
  propertyId,
  payment,
  leases,
  billPresets,
  onClose,
}: {
  propertyId: number;
  payment: PropertyPaymentRow | null;
  leases: PaymentLease[];
  billPresets?: { id: number; label: string; type: string }[];
  onClose: () => void;
}) {
  async function handleSave(formData: FormData) {
    if (!payment) return;
    await updatePropertyPayment(payment.id, propertyId, formData);
    onClose();
  }

  return (
    <Dialog open={!!payment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>수납 수정</DialogTitle>
        </DialogHeader>
        {payment && (
          // Reuse the exact same form as creating a payment, wired to save in
          // place (stay on the property page and close) instead of redirecting.
          <PaymentForm
            key={payment.id}
            variant="plain"
            paymentId={payment.id}
            leases={leases}
            billPresets={billPresets}
            action={handleSave}
            submitLabel="저장"
            defaultValues={{
              lease_id: payment.lease_id,
              payment_type: payment.payment_type,
              billing_month: toMonthInput(payment.billing_month),
              amount_krw: String(payment.amount_krw),
              currency_paid: payment.currency_paid,
              amount_paid: String(payment.amount_paid),
              payment_method: payment.payment_method,
              payment_date: toDateInput(payment.payment_date),
              status: payment.status,
              notes: payment.notes,
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
