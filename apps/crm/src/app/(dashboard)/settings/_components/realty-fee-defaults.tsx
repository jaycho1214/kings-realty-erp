"use client";

import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { updateRealtyFeeDefault } from "../_actions";

interface RealtyFeeRow {
  currency: string;
  amount: string;
}

export function RealtyFeeDefaults({ rows }: { rows: RealtyFeeRow[] }) {
  return (
    <div className="space-y-3 p-3">
      <p className="text-xs text-muted-foreground">
        계약 생성 시 채워지는 중개 수수료(realty fee) 기본값입니다. 계약별로
        변경할 수 있습니다.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <form
            key={r.currency}
            action={updateRealtyFeeDefault}
            className="flex items-end gap-2"
          >
            <input type="hidden" name="currency" value={r.currency} />
            <div className="w-16 pb-2 text-sm font-medium">
              {r.currency === "USD" ? "USD ($)" : "KRW (₩)"}
            </div>
            <Input
              name="amount"
              type="number"
              min={0}
              defaultValue={Number(r.amount)}
              className="w-40"
            />
            <SubmitButton label="저장" />
          </form>
        ))}
      </div>
    </div>
  );
}
