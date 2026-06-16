import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Flat ringed panel matching the Card/DataPanel surface, used for read views. */
export function DetailPanel({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  /** Right-aligned header slot, e.g. a "계약 상세 →" link. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
          {title && <span className="text-[13px] font-semibold">{title}</span>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** A key/value line inside a DetailPanel (used for relationship summaries). */
export function DetailRow({
  label,
  children,
  mono,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 px-3.5 py-2.5 text-sm last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right font-medium",
          mono && "tabular",
        )}
      >
        {children}
      </span>
    </div>
  );
}

/** Read-mode definition grid: a ringed panel holding labeled field groups. */
export function DefinitionGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A labeled group of fields inside a DefinitionGrid, laid out two-up. */
export function DefGroup({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border/60 last:border-b-0">
      <div className="bg-muted/40 px-3.5 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-1 [&>*]:border-b [&>*]:border-border/45 sm:grid-cols-2 sm:[&>*:nth-child(odd)]:border-r sm:[&>*:nth-last-child(-n+1)]:border-b-0 sm:[&>*:nth-last-child(2):nth-child(odd)]:border-b-0 [&>*:last-child]:border-b-0">
        {children}
      </div>
    </div>
  );
}

/** A single read-mode field cell. Set `full` to span both columns. */
export function Def({
  label,
  children,
  mono,
  full,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 px-3.5 py-2.5",
        full && "sm:col-span-2",
      )}
    >
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-sm text-foreground", mono && "tabular")}>
        {children}
      </span>
    </div>
  );
}
