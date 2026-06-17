"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { formatKRW } from "@/lib/utils";
import { createBillPreset, deleteBillPreset } from "../_preset-actions";

interface BillPresetRow {
  id: number;
  label: string;
  type: string;
  default_amount: string | null;
  default_currency: string;
  default_due_day: number;
  is_variable: boolean;
}

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function BillPresets({ presets }: { presets: BillPresetRow[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await createBillPreset(formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead className="text-right">기본 금액</TableHead>
            <TableHead>마감일</TableHead>
            <TableHead className="w-[60px]">{""}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {presets.map((p) => {
            const deleteAction = deleteBillPreset.bind(null, p.id);
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.label}
                  {p.is_variable && (
                    <Badge variant="outline" className="ml-2">
                      변동
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="tabular text-right">
                  {p.is_variable || p.default_amount == null
                    ? "-"
                    : p.default_currency === "USD"
                      ? `$${Number(p.default_amount).toLocaleString()}`
                      : formatKRW(p.default_amount)}
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  매월 {p.default_due_day}일
                </TableCell>
                <TableCell>
                  <form action={deleteAction}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-danger"
                      aria-label="삭제"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="border-t p-3">
        <form
          ref={formRef}
          action={addAction}
          className="flex flex-wrap items-end gap-2"
        >
          <Input
            name="label"
            required
            placeholder="이름 (예: 관리비)"
            className="w-40"
          />
          <Input
            name="default_amount"
            type="number"
            min={0}
            placeholder="기본 금액"
            className="w-28"
          />
          <select
            name="default_currency"
            className={selectClassName}
            defaultValue="KRW"
          >
            <option value="KRW">₩</option>
            <option value="USD">$</option>
          </select>
          <Input
            name="default_due_day"
            type="number"
            min={1}
            max={31}
            defaultValue={10}
            className="w-16"
            aria-label="마감일"
          />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="is_variable" />
            변동
          </label>
          <SubmitButton label="추가" />
        </form>
      </div>
    </div>
  );
}
