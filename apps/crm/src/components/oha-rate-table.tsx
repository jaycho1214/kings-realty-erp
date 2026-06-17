"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { OHA_GROUPS } from "@/lib/oha-groups";
import { formatKRW, cn } from "@/lib/utils";
import { updateOhaRates } from "@/app/(dashboard)/settings/_actions";

interface OhaAmounts {
  with: string;
  without: string;
}

interface OhaRateTableProps {
  /** Amounts keyed by group code: { "E1-E4": { with, without }, ... }. */
  rows: Record<string, OhaAmounts>;
  /** Group code to highlight (the tenant's own group). */
  highlightCode?: string | null;
  /** Shown as "현재 계급: …" on the highlighted row. */
  currentRank?: string | null;
  /** Admins get editable inputs + 저장; others see read-only amounts. */
  editable: boolean;
}

export function OhaRateTable({
  rows,
  highlightCode,
  currentRank,
  editable,
}: OhaRateTableProps) {
  return (
    <form action={updateOhaRates} className="space-y-2.5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>계급</TableHead>
            <TableHead className="text-right">비동반</TableHead>
            <TableHead className="text-right">동반</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {OHA_GROUPS.map((g) => {
            const r = rows[g.code] ?? { with: "0", without: "0" };
            const on = highlightCode === g.code;
            return (
              <TableRow key={g.code} className={cn(on && "bg-brand-weak/60")}>
                <TableCell
                  className={cn(
                    "font-medium",
                    on && "border-l-2 border-brand",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1.5">
                      {on ? g.detailLabel : g.shortLabel}
                      {g.oneTime && (
                        <span className="rounded bg-secondary px-1 text-[10px] text-muted-foreground">
                          1회성
                        </span>
                      )}
                    </span>
                    {on && currentRank && (
                      <span className="text-[11px] text-brand">
                        현재 계급: {currentRank}
                      </span>
                    )}
                  </div>
                </TableCell>
                {(["without", "with"] as const).map((dep) => (
                  <TableCell key={dep} className="text-right">
                    {editable ? (
                      <Input
                        type="number"
                        name={`amount__${g.code}__${dep}`}
                        defaultValue={r[dep]}
                        className="tabular ml-auto h-8 w-28 text-right"
                      />
                    ) : (
                      <span className="tabular">
                        {formatKRW(Number(r[dep]))}
                      </span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {editable && (
        <div className="flex justify-end">
          <SubmitButton label="저장" />
        </div>
      )}
    </form>
  );
}
