"use client";

import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setExchangeRate } from "../exchange-rate/_actions";

function QuickSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="h-8" disabled={pending}>
      {pending ? "..." : "등록"}
    </Button>
  );
}

/**
 * Compact dashboard widget to register today's USD→KRW rate for the two
 * denominations staff use most ($100, $20). Posts to the shared setExchangeRate
 * action (admin-only); the panel's full-page link covers other denominations.
 */
export function ExchangeRateQuick({
  today,
  rate100,
  rate20,
}: {
  today: string;
  rate100?: string;
  rate20?: string;
}) {
  return (
    <form action={setExchangeRate} className="flex items-end gap-2 px-3.5 py-3">
      <input type="hidden" name="date" value={today} />
      <div className="space-y-1">
        <span className="tabular block text-[11px] text-muted-foreground">
          $100
        </span>
        <Input
          name="rate_100"
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder="₩"
          defaultValue={rate100 ?? ""}
          className="h-8 w-24 text-right"
        />
      </div>
      <div className="space-y-1">
        <span className="tabular block text-[11px] text-muted-foreground">
          $20
        </span>
        <Input
          name="rate_20"
          type="number"
          step="0.01"
          inputMode="decimal"
          placeholder="₩"
          defaultValue={rate20 ?? ""}
          className="h-8 w-24 text-right"
        />
      </div>
      <QuickSubmit />
    </form>
  );
}
