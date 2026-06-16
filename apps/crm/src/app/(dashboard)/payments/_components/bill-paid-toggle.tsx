"use client";

import { useTransition } from "react";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleBillPaid, toggleBundleBillPaid } from "../_actions";

export function BillPaidToggle({
  paymentId,
  bundleId,
  paid,
  className,
}: {
  paymentId?: number;
  bundleId?: string;
  paid: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      if (bundleId) {
        await toggleBundleBillPaid(bundleId);
      } else if (paymentId) {
        await toggleBillPaid(paymentId);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:opacity-50",
        paid
          ? "bg-success-weak text-success hover:bg-success/15"
          : "bg-warning-weak text-warning hover:bg-warning/15",
        className,
      )}
    >
      {paid ? (
        <>
          <Check className="size-3" />
          정산완료
        </>
      ) : (
        <>
          <Circle className="size-3" />
          미정산
        </>
      )}
    </button>
  );
}
