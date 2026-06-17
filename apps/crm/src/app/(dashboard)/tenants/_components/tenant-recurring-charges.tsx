"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Repeat, Pencil } from "lucide-react";
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
  addRecurringCharge,
  updateRecurringCharge,
  deleteRecurringCharge,
  toggleRecurringChargeActive,
  generateTenantRecurringCharges,
} from "../_actions";

export interface RecurringRow {
  id: number;
  label: string;
  type: string;
  amount: string | null;
  currency: string;
  due_day: number;
  active: boolean;
  start_month: string | null;
  end_month: string | null;
}

export interface BillPresetOption {
  id: number;
  label: string;
  type: string;
  default_amount: string | null;
  default_currency: string;
  default_due_day: number;
  is_variable: boolean;
}

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

const typeOptions = [
  { value: "management", label: "관리비" },
  { value: "parking", label: "주차" },
  { value: "utility", label: "공과금" },
  { value: "custom", label: "기타" },
];

function fmtAmount(amount: string | null, currency: string) {
  if (amount == null) return "변동";
  return currency === "USD"
    ? `$${Number(amount).toLocaleString()}`
    : formatKRW(amount);
}

export function TenantRecurringCharges({
  tenantId,
  recurring,
  presets,
  hasActiveLease,
}: {
  tenantId: number;
  recurring: RecurringRow[];
  presets: BillPresetOption[];
  hasActiveLease: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRow | null>(null);
  const [pending, startTransition] = useTransition();

  // Pre-fill the add form when a preset is chosen.
  const [presetId, setPresetId] = useState<string>("");
  const preset = presets.find((p) => String(p.id) === presetId) ?? null;

  async function handleAdd(formData: FormData) {
    await addRecurringCharge(tenantId, formData);
    setOpen(false);
    setPresetId("");
  }

  async function handleEdit(formData: FormData) {
    if (!editing) return;
    await updateRecurringCharge(editing.id, tenantId, formData);
    setEditing(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          매달 자동으로 청구되는 정기 항목입니다. 월세는 계약에서 자동
          생성됩니다.
        </p>
        <div className="flex gap-2">
          {hasActiveLease && recurring.some((r) => r.active) && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={pending}
              onClick={() =>
                startTransition(() => generateTenantRecurringCharges(tenantId))
              }
            >
              <Repeat className="size-4" />
              이번 달 정기 청구 생성
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            정기 청구 추가
          </Button>
        </div>
      </div>

      <DataPanel>
        {recurring.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="정기 청구가 없습니다"
            description="관리비·주차 등 매달 청구되는 항목을 등록하세요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>항목</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>마감일</TableHead>
                <TableHead>활성</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurring.map((r) => (
                <TableRow key={r.id} className={r.active ? "" : "opacity-50"}>
                  <TableCell className="font-medium">
                    {r.label}
                    {r.amount == null && (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        변동
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {fmtAmount(r.amount, r.currency)}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    매월 {r.due_day}일
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={pending}
                      className="cursor-pointer"
                      onClick={() =>
                        startTransition(() =>
                          toggleRecurringChargeActive(
                            r.id,
                            tenantId,
                            !r.active,
                          ),
                        )
                      }
                    >
                      <Badge
                        variant="outline"
                        className={
                          r.active
                            ? "border-success/30 text-success"
                            : "text-muted-foreground"
                        }
                      >
                        {r.active ? "활성" : "중지"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="수정"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label="삭제"
                        onClick={() => {
                          if (confirm("이 정기 청구를 삭제하시겠습니까?"))
                            startTransition(() =>
                              deleteRecurringCharge(r.id, tenantId),
                            );
                        }}
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataPanel>

      {/* Add */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setPresetId("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>정기 청구 추가</DialogTitle>
          </DialogHeader>
          {presets.length > 0 && (
            <Field>
              <Label htmlFor="preset">프리셋</Label>
              <select
                id="preset"
                className={selectClassName}
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
              >
                <option value="">직접 입력</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <RecurringForm
            key={presetId || "blank"}
            action={handleAdd}
            defaults={
              preset
                ? {
                    label: preset.label,
                    type: preset.type,
                    amount: preset.is_variable ? null : preset.default_amount,
                    currency: preset.default_currency,
                    due_day: preset.default_due_day,
                  }
                : undefined
            }
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>정기 청구 수정</DialogTitle>
          </DialogHeader>
          {editing && (
            <RecurringForm
              action={handleEdit}
              defaults={{
                label: editing.label,
                type: editing.type,
                amount: editing.amount,
                currency: editing.currency,
                due_day: editing.due_day,
                start_month: editing.start_month,
                end_month: editing.end_month,
              }}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecurringForm({
  action,
  defaults,
  onCancel,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults?: {
    label?: string;
    type?: string;
    amount?: string | null;
    currency?: string;
    due_day?: number;
    start_month?: string | null;
    end_month?: string | null;
  };
  onCancel: () => void;
}) {
  const monthVal = (v?: string | null) => (v ? v.slice(0, 7) : "");
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <Label htmlFor="label">항목 이름</Label>
          <Input
            id="label"
            name="label"
            placeholder="예: 관리비"
            defaultValue={defaults?.label ?? ""}
            required
          />
        </Field>
        <Field>
          <Label htmlFor="type">분류</Label>
          <select
            id="type"
            name="type"
            className={selectClassName}
            defaultValue={defaults?.type ?? "custom"}
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <Label htmlFor="amount">금액 (비우면 변동)</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min={0}
            placeholder="매달 입력"
            defaultValue={defaults?.amount ?? ""}
          />
        </Field>
        <Field>
          <Label htmlFor="currency">통화</Label>
          <select
            id="currency"
            name="currency"
            className={selectClassName}
            defaultValue={defaults?.currency ?? "KRW"}
          >
            <option value="KRW">KRW (₩)</option>
            <option value="USD">USD ($)</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field>
          <Label htmlFor="due_day">마감일(일)</Label>
          <Input
            id="due_day"
            name="due_day"
            type="number"
            min={1}
            max={31}
            defaultValue={defaults?.due_day ?? 10}
          />
        </Field>
        <Field>
          <Label htmlFor="start_month">시작월</Label>
          <Input
            id="start_month"
            name="start_month"
            type="month"
            defaultValue={monthVal(defaults?.start_month)}
          />
        </Field>
        <Field>
          <Label htmlFor="end_month">종료월</Label>
          <Input
            id="end_month"
            name="end_month"
            type="month"
            defaultValue={monthVal(defaults?.end_month)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <SubmitButton label="저장" />
      </div>
    </form>
  );
}
