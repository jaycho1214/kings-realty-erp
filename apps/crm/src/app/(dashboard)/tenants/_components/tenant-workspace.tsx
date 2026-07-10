"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Two-pane master-detail shell for the tenants section. The roster rail and
 * page header live in the route layout so they never unmount while navigating
 * between tenants (the old-ERP "index cards" feel).
 *
 * Mobile: the rail IS the /tenants index screen; on a tenant detail the rail
 * and header hide and the detail's own breadcrumb takes over.
 */
export function TenantWorkspace({
  header,
  rail,
  children,
}: {
  header: React.ReactNode;
  rail: React.ReactNode;
  children: React.ReactNode;
}) {
  // null → the /tenants index page; a value → the [id] subtree is active.
  const onIndex = useSelectedLayoutSegment() === null;

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(!onIndex && "hidden lg:block")}>{header}</div>
      <div className="flex items-start gap-5">
        <aside
          className={cn(
            "w-full lg:block lg:w-[300px] lg:shrink-0",
            !onIndex && "hidden",
            // Own scroll column under the sticky topbar (offset matches the
            // detail aside's xl:top-[4.75rem] convention).
            "lg:sticky lg:top-[4.75rem] lg:h-[calc(100svh-6.5rem)]",
          )}
        >
          {rail}
        </aside>
        <div className={cn("min-w-0 flex-1", onIndex && "hidden lg:block")}>
          {children}
        </div>
      </div>
    </div>
  );
}
