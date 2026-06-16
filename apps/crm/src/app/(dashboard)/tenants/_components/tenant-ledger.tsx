"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SubmitButton } from "@/components/submit-button";
import { formatKRW } from "@/lib/utils";
import { currencyPaidLabel } from "@/lib/labels";
import { addLedgerEntry, deleteLedgerEntry } from "../_actions";
import { Wallet } from "lucide-react";

interface LedgerRow {
  key: string;
  date: string;
  direction: "receipt" | "disbursement";
  type: string;
  currency: string | null;
  denomination: number | null;
  exchangeRate: number | null;
  vendor: string | null;
  krw: number;
  memo: string | null;
  source: "payment" | "utility" | "manual";
  manualId: number | null;
  balance: number;
}

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

const sourceLabel: Record<string, string> = {
  payment: "수금",
  utility: "대납",
  manual: "수동",
};

export function TenantLedger({
  tenantId,
  rows,
  totalReceipts,
  totalDisbursements,
  balance,
  canEdit,
  exchangeVendors,
}: {
  tenantId: number;
  rows: LedgerRow[];
  totalReceipts: number;
  totalDisbursements: number;
  balance: number;
  canEdit: boolean;
  exchangeVendors: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("KRW");
  const [pending, startTransition] = useTransition();

  async function handleAdd(formData: FormData) {
    await addLedgerEntry(tenantId, formData);
    setOpen(false);
  }

  function handleDelete(id: number) {
    if (!confirm("이 원장 기록을 삭제하시겠습니까?")) return;
    startTransition(() => deleteLedgerEntry(id, tenantId));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="총 입금"
          value={formatKRW(totalReceipts)}
          tone="success"
        />
        <SummaryCard
          label="총 출금"
          value={formatKRW(totalDisbursements)}
          tone="danger"
        />
        <SummaryCard
          label="잔액"
          value={formatKRW(balance)}
          tone={balance >= 0 ? "default" : "danger"}
        />
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            원장 기록 추가
          </Button>
        </div>
      )}

      <DataPanel>
        {rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="원장 기록이 없습니다"
            description="수금·대납 내역과 수동 기록이 여기에 표시됩니다."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead>구분</TableHead>
                <TableHead>항목</TableHead>
                <TableHead>통화/권종</TableHead>
                <TableHead>환율/환전업체</TableHead>
                <TableHead className="text-right">금액(&#8361;)</TableHead>
                <TableHead className="text-right">잔액</TableHead>
                {canEdit && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="tabular text-muted-foreground">
                    {r.date}
                  </TableCell>
                  <TableCell>
                    {r.direction === "receipt" ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <ArrowDownLeft className="size-3.5" />
                        입금
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-danger">
                        <ArrowUpRight className="size-3.5" />
                        출금
                      </span>
                    )}
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {sourceLabel[r.source]}
                    </span>
                  </TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {currencyPaidLabel(r.currency)}
                    {r.denomination ? ` · $${r.denomination}` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.exchangeRate
                      ? `₩${Number(r.exchangeRate).toLocaleString()}`
                      : "-"}
                    {r.vendor ? ` · ${r.vendor}` : ""}
                  </TableCell>
                  <TableCell
                    className={`tabular text-right ${r.direction === "receipt" ? "text-success" : "text-danger"}`}
                  >
                    {r.direction === "receipt" ? "+" : "−"}
                    {formatKRW(r.krw)}
                  </TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {formatKRW(r.balance)}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      {r.source === "manual" && r.manualId != null && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          onClick={() => handleDelete(r.manualId!)}
                          aria-label="삭제"
                        >
                          <Trash2 className="size-3.5 text-danger" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataPanel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>원장 기록 추가</DialogTitle>
          </DialogHeader>
          <form action={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="direction">구분</Label>
                <select
                  id="direction"
                  name="direction"
                  className={selectClassName}
                >
                  <option value="receipt">입금</option>
                  <option value="disbursement">출금</option>
                </select>
              </Field>
              <Field>
                <Label htmlFor="entry_date">날짜</Label>
                <Input id="entry_date" name="entry_date" type="date" required />
              </Field>
            </div>
            <Field>
              <Label htmlFor="category">항목</Label>
              <Input
                id="category"
                name="category"
                placeholder="예: 월세, 보증금, 조정"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="currency">통화</Label>
                <select
                  id="currency"
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={selectClassName}
                >
                  <option value="KRW">KRW (₩)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </Field>
              <Field>
                <Label htmlFor="amount">금액 ({currency})</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min={0}
                  required
                />
              </Field>
            </div>
            {currency === "USD" && (
              <div className="grid grid-cols-3 gap-4">
                <Field>
                  <Label htmlFor="exchange_rate">환율</Label>
                  <Input
                    id="exchange_rate"
                    name="exchange_rate"
                    type="number"
                    min={0}
                    placeholder="₩/$"
                    required
                  />
                </Field>
                <Field>
                  <Label htmlFor="denomination">권종</Label>
                  <select
                    id="denomination"
                    name="denomination"
                    className={selectClassName}
                  >
                    <option value="">-</option>
                    <option value="100">$100</option>
                    <option value="50">$50</option>
                    <option value="20">$20</option>
                    <option value="10">$10</option>
                  </select>
                </Field>
                <Field>
                  <Label htmlFor="exchange_vendor_id">환전업체</Label>
                  <select
                    id="exchange_vendor_id"
                    name="exchange_vendor_id"
                    className={selectClassName}
                  >
                    <option value="">-</option>
                    {exchangeVendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <Field>
              <Label htmlFor="description">메모</Label>
              <Input
                id="description"
                name="description"
                placeholder="메모 (선택)"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <SubmitButton label="추가" />
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3.5 py-2.5">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className={`tabular mt-0.5 text-base font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
