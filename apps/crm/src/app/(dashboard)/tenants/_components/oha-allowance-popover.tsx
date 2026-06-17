"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { OhaRateTable } from "@/components/oha-rate-table";
import { formatDate, cn } from "@/lib/utils";

interface OhaAllowancePopoverProps {
  rank: string;
  /** The tenant's OHA group code, or null if the rank doesn't map. */
  currentGroupCode: string | null;
  rows: Record<string, { with: string; without: string }>;
  effectiveFrom: string | null;
  editable: boolean;
}

export function OhaAllowancePopover({
  rank,
  currentGroupCode,
  rows,
  effectiveFrom,
  editable,
}: OhaAllowancePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          badgeVariants({ variant: "secondary" }),
          "cursor-pointer gap-1 ring-1 ring-transparent transition hover:ring-brand/40",
        )}
      >
        <Coins className="size-3" />
        {rank}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[420px] max-w-[calc(100vw-2rem)]"
      >
        <PopoverHeader className="flex-row items-center justify-between">
          <PopoverTitle>지원금 (OHA)</PopoverTitle>
          <Link
            href="/settings/data"
            className="text-xs text-brand hover:underline"
          >
            전체 기준표 →
          </Link>
        </PopoverHeader>
        {effectiveFrom && (
          <p className="text-[11px] text-muted-foreground">
            시행일 {formatDate(effectiveFrom)}
          </p>
        )}
        <OhaRateTable
          rows={rows}
          highlightCode={currentGroupCode}
          currentRank={rank}
          editable={editable}
        />
      </PopoverContent>
    </Popover>
  );
}
