"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  FileText,
  Check,
  MoreHorizontal,
  Wallet,
  Ban,
  XCircle,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatKRW } from "@/lib/utils";
import { seoulDateString } from "@/lib/date";
import { useChargeTypes } from "@/components/charge-types-provider";
import {
  addCharge,
  generateTenantRecurringCharges,
  setChargeAmount,
  deleteCharge,
  settleCharge,
  waiveCharge,
  voidCharge,
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
  waived: { label: "면제", tone: "default" },
  void: { label: "무효", tone: "default" },
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

/** Per-row "⋯" menu: 수납(연결)/면제/정정 for outstanding charges, plus 삭제. */
function ChargeActions({
  charge,
  tenantId,
  onSettle,
}: {
  charge: ChargeRow;
  tenantId: number;
  onSettle: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const outstanding = charge.status === "billed" || charge.status === "overdue";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" disabled={pending} />}
        aria-label="작업"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {outstanding && (
          <>
            {charge.currency === "KRW" ? (
              <DropdownMenuItem onClick={onSettle}>
                <Wallet className="size-4" />
                수납
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem render={<Link href="/payments/new" />}>
                <Wallet className="size-4" />
                수납 등록으로 이동
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                if (
                  confirm("이 청구를 면제 처리하시겠습니까? (미수납으로 종결)")
                )
                  startTransition(() => waiveCharge(charge.id, tenantId));
              }}
            >
              <Ban className="size-4" />
              면제
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (
                  confirm("이 청구를 무효 처리하시겠습니까? (중복·오류 정정)")
                )
                  startTransition(() => voidCharge(charge.id, tenantId));
              }}
            >
              <XCircle className="size-4" />
              정정 (무효)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            if (confirm("이 청구 항목을 삭제하시겠습니까?"))
              startTransition(() => deleteCharge(charge.id, tenantId));
          }}
        >
          <Trash2 className="size-4" />
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 수납(연결) dialog body — records a linked KRW payment that settles the charge. */
function SettleForm({
  charge,
  tenantId,
  onDone,
}: {
  charge: ChargeRow;
  tenantId: number;
  onDone: () => void;
}) {
  const { resolve } = useChargeTypes();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function action(formData: FormData) {
    startTransition(async () => {
      try {
        await settleCharge(charge.id, tenantId, formData);
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  return (
    <form action={action} className="space-y-4">
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">
          {charge.memo ?? resolve(charge.type).label}
        </span>
        {charge.billing_month && (
          <span className="ml-2 text-muted-foreground">
            {new Date(charge.billing_month).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
            })}
          </span>
        )}
      </div>
      <Field>
        <Label htmlFor="settle-amount">금액 (₩)</Label>
        <Input
          id="settle-amount"
          name="amount"
          type="number"
          min={0}
          defaultValue={charge.amount ?? ""}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <Label htmlFor="settle-method">결제방법</Label>
          <select
            id="settle-method"
            name="payment_method"
            defaultValue="cash"
            className={selectClassName}
          >
            <option value="cash">현금</option>
            <option value="card">카드</option>
            <option value="transfer">계좌이체</option>
          </select>
        </Field>
        <Field>
          <Label htmlFor="settle-date">납부일</Label>
          <Input
            id="settle-date"
            name="payment_date"
            type="date"
            defaultValue={seoulDateString()}
            required
          />
        </Field>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={pending}
        >
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "등록 중..." : "수납 등록"}
        </Button>
      </div>
    </form>
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
  const [settleTarget, setSettleTarget] = useState<ChargeRow | null>(null);
  const [pending, startTransition] = useTransition();
  const { resolve } = useChargeTypes();

  // 연체·미납 worklist first: overdue → billed(청구됨) → 미청구 → 해결됨(수납/면제/무효);
  // newest billing month up within a group.
  const rank: Record<string, number> = {
    overdue: 0,
    billed: 1,
    unbilled: 2,
    paid: 3,
    waived: 4,
    void: 5,
  };
  const sorted = [...charges].sort((a, b) => {
    const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    return r !== 0
      ? r
      : (b.billing_month ?? "").localeCompare(a.billing_month ?? "");
  });
  const outstandingCount = charges.filter(
    (c) => c.status === "overdue" || c.status === "billed",
  ).length;

  async function handleAdd(formData: FormData) {
    await addCharge(tenantId, formData);
    setOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {outstandingCount > 0 ? (
            <>
              연체·미납{" "}
              <span className="font-semibold text-danger">
                {outstandingCount}건
              </span>
            </>
          ) : (
            "미납 없음"
          )}
        </p>
        <div className="flex gap-2">
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
              {sorted.map((c) => {
                const meta = statusMeta[c.status] ?? {
                  label: c.status,
                  tone: "default" as const,
                };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.memo ?? resolve(c.type).label}
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
                      <ChargeActions
                        charge={c}
                        tenantId={tenantId}
                        onSettle={() => setSettleTarget(c)}
                      />
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

      <Dialog
        open={settleTarget != null}
        onOpenChange={(o) => {
          if (!o) setSettleTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>수납 등록</DialogTitle>
          </DialogHeader>
          {settleTarget && (
            <SettleForm
              charge={settleTarget}
              tenantId={tenantId}
              onDone={() => setSettleTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
