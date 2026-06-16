import type { ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  count,
  actions,
  createHref,
  createLabel,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** Optional record count shown as a chip next to the title. */
  count?: number;
  /** Arbitrary action node(s) rendered on the right (e.g. a CreateDialog). */
  actions?: ReactNode;
  createHref?: string;
  createLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {count != null && (
            <span className="tabular inline-flex h-5 items-center rounded-md bg-secondary px-1.5 text-xs font-medium text-muted-foreground">
              {count.toLocaleString("ko-KR")}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(actions || createHref) && (
        <div className="flex items-center gap-2">
          {actions}
          {createHref && (
            <Link href={createHref}>
              <Button className="gap-1.5">
                <Plus className="size-4" />
                {createLabel ?? "추가"}
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
