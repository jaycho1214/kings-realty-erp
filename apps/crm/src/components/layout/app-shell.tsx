"use client";

import * as React from "react";
import { Topbar } from "@/components/layout/topbar";
import { SidebarNav, type NavCounts } from "@/components/layout/sidebar-nav";

export function AppShell({
  counts,
  children,
}: {
  counts: NavCounts;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-svh flex-col">
      <Topbar onMenu={() => setMobileOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <SidebarNav
          counts={counts}
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
        <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-5">
          {children}
        </main>
      </div>
    </div>
  );
}
