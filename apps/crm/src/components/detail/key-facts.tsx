import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FactTone = "default" | "success" | "warning" | "danger" | "muted";

export interface Fact {
  label: string;
  value: ReactNode;
  /** Smaller trailing context shown next to the value (e.g. a date under a D-count). */
  sub?: ReactNode;
  tone?: FactTone;
  /** Figures default to tabular mono; set false for a plain-text fact value. */
  mono?: boolean;
}

const toneClass: Record<FactTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
};

/**
 * Horizontal key-facts band under the DetailHeader. Carries the at-a-glance
 * operational figures (money, counts, countdowns) in tabular mono. Scrolls
 * horizontally on narrow screens rather than wrapping into a ragged grid.
 */
export function KeyFacts({ items }: { items: Fact[] }) {
  return (
    <div className="scrollbar-none flex overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      {items.map((f, i) => (
        <div
          key={i}
          className="min-w-[140px] flex-1 border-r border-border/55 px-4 py-2.5 last:border-r-0"
        >
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
            {f.label}
          </div>
          <div
            className={cn(
              "mt-0.5 text-base font-semibold",
              f.mono !== false && "tabular",
              toneClass[f.tone ?? "default"],
            )}
          >
            {f.value}
            {f.sub != null && (
              <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                {f.sub}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
