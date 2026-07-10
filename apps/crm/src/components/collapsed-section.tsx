import { ChevronRight } from "lucide-react";

/** Native-details collapsed block for below-the-fold card sections. */
export function CollapsedSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group rounded-xl bg-card ring-1 ring-foreground/10"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
        {title}
        {count != null && count > 0 && (
          <span className="tabular text-[11px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </summary>
      <div className="border-t border-border/60">{children}</div>
    </details>
  );
}
