import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Flat panel used to frame data tables. Matches the Card surface (rounded-xl,
 * hairline ring, no resting shadow) and styles the shadcn <Table> placed inside
 * it: a sunken muted header, muted header labels, and roomier cell padding —
 * without touching the ui/table primitive.
 */
function DataPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="data-panel"
      className={cn(
        "overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10",
        // Header row
        "[&_thead]:bg-muted/40 [&_thead_tr]:border-b-0",
        "[&_th]:h-9 [&_th]:px-3 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground",
        // Body cells
        "[&_td]:px-3 [&_td]:py-2.5",
        "[&_tbody_tr]:border-border/70",
        className,
      )}
      {...props}
    />
  );
}

export { DataPanel };
