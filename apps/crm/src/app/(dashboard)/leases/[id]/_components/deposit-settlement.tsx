"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import { formatKRW } from "@/lib/utils";
import {
  saveDepositSettlement,
  confirmDepositSettlement,
} from "../../_actions";

interface Deduction {
  amount: number;
  reason: string;
}

interface SettlementData {
  deposit_amount: string;
  deductions: string | null;
  deduction_total: string;
  refund_amount: string;
  refund_method: string | null;
  refunded_date: string | null;
  status: string;
}

function parseDeductions(json: string | null): Deduction[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function DepositSettlement({
  leaseId,
  depositKrw,
  settlement,
  canConfirm,
}: {
  leaseId: number;
  depositKrw: number;
  settlement: SettlementData | null;
  canConfirm: boolean;
}) {
  const confirmed = settlement?.status === "confirmed";
  const [deductions, setDeductions] = useState<Deduction[]>(
    parseDeductions(settlement?.deductions ?? null),
  );
  const [refundMethod, setRefundMethod] = useState(
    settlement?.refund_method ?? "",
  );
  const [refundedDate, setRefundedDate] = useState(
    settlement?.refunded_date
      ? new Date(settlement.refunded_date).toISOString().split("T")[0]
      : "",
  );
  const [pending, startTransition] = useTransition();

  const deposit = settlement ? Number(settlement.deposit_amount) : depositKrw;
  const deductionTotal = deductions.reduce(
    (s, d) => s + (Number(d.amount) || 0),
    0,
  );
  const refund = deposit - deductionTotal;

  function addDeduction() {
    setDeductions((p) => [...p, { amount: 0, reason: "" }]);
  }
  function updateDeduction(i: number, patch: Partial<Deduction>) {
    setDeductions((p) =>
      p.map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
    );
  }
  function removeDeduction(i: number) {
    setDeductions((p) => p.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    const fd = new FormData();
    fd.set("deposit_amount", String(deposit));
    fd.set("deductions", JSON.stringify(deductions));
    fd.set("refund_method", refundMethod);
    fd.set("refunded_date", refundedDate);
    startTransition(() => saveDepositSettlement(leaseId, fd));
  }

  function handleConfirm() {
    if (
      confirm(
        "보증금 정산을 확정하시겠습니까? 확정 후에는 수정할 수 없으며 환급이 원장에 기록됩니다.",
      )
    ) {
      startTransition(() => confirmDepositSettlement(leaseId));
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="받은 보증금" value={formatKRW(deposit)} />
        <Stat
          label="차감 합계"
          value={formatKRW(deductionTotal)}
          tone="danger"
        />
        <Stat
          label="최종 환급액"
          value={formatKRW(refund)}
          tone={refund < 0 ? "danger" : "success"}
        />
      </div>

      <DataPanel>
        <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
          <span className="text-sm font-semibold">차감 항목</span>
          <div className="flex items-center gap-2">
            {confirmed && (
              <Badge
                variant="outline"
                className="border-success/30 text-success"
              >
                <Lock className="mr-1 size-3" />
                확정됨
              </Badge>
            )}
            {!confirmed && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={addDeduction}
                disabled={pending}
              >
                <Plus className="size-4" />
                차감 추가
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2 p-3">
          {deductions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              차감 항목이 없습니다.
            </p>
          ) : (
            deductions.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_160px_40px] gap-2">
                <Input
                  value={d.reason}
                  onChange={(e) =>
                    updateDeduction(i, { reason: e.target.value })
                  }
                  placeholder="사유 (예: 벽지 파손)"
                  disabled={confirmed}
                />
                <Input
                  type="number"
                  min={0}
                  value={d.amount || ""}
                  onChange={(e) =>
                    updateDeduction(i, { amount: Number(e.target.value) })
                  }
                  placeholder="금액"
                  disabled={confirmed}
                />
                {!confirmed && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeDeduction(i)}
                    aria-label="삭제"
                  >
                    <Trash2 className="size-3.5 text-danger" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DataPanel>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <Label htmlFor="refund_method">환급 방법</Label>
          <Input
            id="refund_method"
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value)}
            placeholder="예: 계좌 이체"
            disabled={confirmed}
          />
        </Field>
        <Field>
          <Label htmlFor="refunded_date">환급일</Label>
          <Input
            id="refunded_date"
            type="date"
            value={refundedDate}
            onChange={(e) => setRefundedDate(e.target.value)}
            disabled={confirmed}
          />
        </Field>
      </div>

      {!confirmed && (
        <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
          <Button variant="outline" onClick={handleSave} disabled={pending}>
            저장
          </Button>
          {canConfirm && (
            <Button onClick={handleConfirm} disabled={pending || !settlement}>
              정산 확정
            </Button>
          )}
        </div>
      )}
      {!confirmed && !settlement && (
        <p className="text-xs text-muted-foreground">
          먼저 저장한 후 확정할 수 있습니다.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "success"
        ? "text-success"
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
