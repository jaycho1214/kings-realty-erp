"use client";

import { useRef } from "react";
import { Trash2, CalendarOff } from "lucide-react";
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
import { addOhaRate, endOhaRate, deleteOhaRate } from "../_actions";

interface OhaRateRow {
  id: number;
  rank: string;
  dependent_status: string;
  region: string;
  amount: string;
  currency: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
}

const selectClassName =
  "h-9 rounded-md border border-input bg-transparent px-2.5 text-sm";

function fmt(v: string | Date | null) {
  if (!v) return "현행";
  // `effective_from`/`effective_to` are Postgres `date` columns returned as
  // "YYYY-MM-DD" strings. Parsing with new Date(s) yields UTC midnight, which
  // toLocaleDateString then shifts back a day for viewers west of UTC. Build a
  // local-midnight Date from the date-only string before formatting.
  const d = typeof v === "string" ? new Date(`${v.slice(0, 10)}T00:00:00`) : v;
  return d.toLocaleDateString("ko-KR");
}

export function OhaRates({ rates }: { rates: OhaRateRow[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  const addAction = async (formData: FormData) => {
    await addOhaRate(formData);
    formRef.current?.reset();
  };

  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-muted-foreground">
        시딩된 금액은 예시값입니다. 실제 OHA 금액표로 수정하세요. 요율 개정 시
        기존 행을 &quot;종료&quot; 처리하고 새 행을 추가하면 이력이 보존됩니다.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>계급</TableHead>
            <TableHead>부양</TableHead>
            <TableHead>지역</TableHead>
            <TableHead className="text-right">금액</TableHead>
            <TableHead>적용 시작</TableHead>
            <TableHead>적용 종료</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.map((r) => {
            const ended = !!r.effective_to;
            return (
              <TableRow key={r.id} className={ended ? "opacity-50" : ""}>
                <TableCell className="font-medium">{r.rank}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {r.dependent_status === "with" ? "동반" : "비동반"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.region}
                </TableCell>
                <TableCell className="tabular text-right">
                  {r.currency === "USD" ? "$" : "₩"}
                  {Number(r.amount).toLocaleString()}
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  {fmt(r.effective_from)}
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  {fmt(r.effective_to)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {!ended && (
                      <form action={endOhaRate.bind(null, r.id)}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="종료"
                          title="요율 종료"
                        >
                          <CalendarOff className="size-3.5" />
                        </Button>
                      </form>
                    )}
                    <form action={deleteOhaRate.bind(null, r.id)}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="삭제"
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <form
        ref={formRef}
        action={addAction}
        className="flex flex-wrap items-end gap-2 border-t border-border/60 p-3"
      >
        <Input
          name="rank"
          placeholder="계급 (예: E-5)"
          className="w-28"
          required
        />
        <select
          name="dependent_status"
          defaultValue="with"
          className={selectClassName}
        >
          <option value="with">동반</option>
          <option value="without">비동반</option>
        </select>
        <Input
          name="region"
          placeholder="지역"
          defaultValue="Default"
          className="w-28"
        />
        <Input
          name="amount"
          type="number"
          placeholder="금액"
          className="w-28"
          required
        />
        <select name="currency" defaultValue="USD" className={selectClassName}>
          <option value="USD">USD</option>
          <option value="KRW">KRW</option>
        </select>
        <Input name="effective_from" type="date" className="w-40" />
        <Button type="submit">추가</Button>
      </form>
    </div>
  );
}
