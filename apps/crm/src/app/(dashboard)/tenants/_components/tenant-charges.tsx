"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
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
import {
  addCharge,
  generateTenantRecurringCharges,
  setChargeAmount,
  deleteCharge,
} from "../_actions";

interface ChargeRow {
  id: number;
  type: string;
  recurrence: string;
  billing_month: string | null;
  amount: string | null;
  currency: string;
  due_date: string | null;
  status: string;
  memo: string | null;
}

const statusMeta: Record<
  string,
  { label: string; tone: "default" | "success" | "danger" | "warning" }
> = {
  unbilled: { label: "미청구", tone: "default" },
  billed: { label: "청구됨", tone: "warning" },
  paid: { label: "수납완료", tone: "success" },
  overdue: { label: "미납", tone: "danger" },
};

const typeLabel: Record<string, string> = {
  rent: "월세",
  deposit: "보증금",
  prepayment: "선불금",
  realty_fee: "중개수수료",
  management: "관리비",
  parking: "주차",
  utility: "공과금",
};

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString("ko-KR") : "-";
}

function fmtAmount(amount: string, currency: string) {
  return currency === "USD"
    ? `$${Number(amount).toLocaleString()}`
    : formatKRW(amount);
}

/** Inline amount entry for a variable placeholder (미청구) charge. */
function PlaceholderAmount({
  chargeId,
  tenantId,
}: {
  chargeId: number;
  tenantId: number;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="금액 입력"
        className="h-7 w-28 text-right"
      />
      <Button
        size="icon-sm"
        variant="outline"
        disabled={pending || !value}
        aria-label="금액 저장"
        onClick={() =>
          startTransition(async () => {
            await setChargeAmount(chargeId, tenantId, Number(value));
          })
        }
      >
        <Check className="size-3.5" />
      </Button>
    </div>
  );
}

export function TenantCharges({
  tenantId,
  charges,
  hasActiveLease,
}: {
  tenantId: number;
  charges: ChargeRow[];
  hasActiveLease: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleAdd(formData: FormData) {
    await addCharge(tenantId, formData);
    setOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {hasActiveLease && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={pending}
            onClick={() =>
              startTransition(() => generateTenantRecurringCharges(tenantId))
            }
          >
            <FileText className="size-4" />
            이번 달 청구 생성
          </Button>
        )}
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          청구 추가
        </Button>
      </div>

      <DataPanel>
        {charges.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="청구 항목이 없습니다"
            description="월세 청구를 생성하거나 항목을 추가하세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>항목</TableHead>
                <TableHead>청구월</TableHead>
                <TableHead>마감일</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((c) => {
                const meta = statusMeta[c.status] ?? {
                  label: c.status,
                  tone: "default" as const,
                };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.memo ?? typeLabel[c.type] ?? c.type}
                      {c.recurrence === "monthly" && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          정기
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {c.billing_month
                        ? new Date(c.billing_month).toLocaleDateString(
                            "ko-KR",
                            {
                              year: "numeric",
                              month: "long",
                            },
                          )
                        : "-"}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {fmtDate(c.due_date)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {c.amount == null ? (
                        <PlaceholderAmount
                          chargeId={c.id}
                          tenantId={tenantId}
                        />
                      ) : (
                        fmtAmount(c.amount, c.currency)
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          meta.tone === "danger"
                            ? "border-danger/30 text-danger"
                            : meta.tone === "success"
                              ? "border-success/30 text-success"
                              : meta.tone === "warning"
                                ? "border-warning/30 text-warning"
                                : ""
                        }
                      >
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        onClick={() => {
                          if (confirm("이 청구 항목을 삭제하시겠습니까?"))
                            startTransition(() => deleteCharge(c.id, tenantId));
                        }}
                        aria-label="삭제"
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataPanel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>청구 추가</DialogTitle>
          </DialogHeader>
          <form action={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="type">항목</Label>
                <Input id="type" name="type" placeholder="예: 월세" required />
              </Field>
              <Field>
                <Label htmlFor="recurrence">반복</Label>
                <select
                  id="recurrence"
                  name="recurrence"
                  className={selectClassName}
                >
                  <option value="one_time">일회성</option>
                  <option value="monthly">월 정기</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="currency">통화</Label>
                <select
                  id="currency"
                  name="currency"
                  className={selectClassName}
                >
                  <option value="KRW">KRW (₩)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </Field>
              <Field>
                <Label htmlFor="amount">금액</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min={0}
                  required
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="billing_month">청구월</Label>
                <Input id="billing_month" name="billing_month" type="month" />
              </Field>
              <Field>
                <Label htmlFor="due_date">마감일</Label>
                <Input id="due_date" name="due_date" type="date" />
              </Field>
            </div>
            <Field>
              <Label htmlFor="memo">메모</Label>
              <Input id="memo" name="memo" placeholder="메모 (선택)" />
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
