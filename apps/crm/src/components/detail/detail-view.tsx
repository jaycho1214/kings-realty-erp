"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KeyFacts, type Fact } from "./key-facts";
import { useIsWide } from "@/hooks/use-wide";
import { cn } from "@/lib/utils";

export interface DetailTab {
  /**
   * URL slug for this tab's subroute, e.g. "leases" → `${basePath}/leases`.
   * The default tab (shown at `basePath`) uses an empty string.
   */
  key: string;
  label: string;
  count?: number;
  /** Render the count as a danger pill (attention items like open AS). */
  alert?: boolean;
  content: React.ReactNode;
}

export interface DetailViewProps {
  /** Breadcrumb parent, e.g. { href: "/tenants", label: "세입자" }. */
  back: { href: string; label: string };
  /**
   * Entity base path, e.g. "/tenants/123". Tabs hang off this as subroutes so a
   * refresh (or a shared link) lands on the same tab instead of resetting.
   */
  basePath: string;
  /** Active tab key from the route's optional catch-all segment ("" = default). */
  activeTab?: string;
  title: string;
  /** Status / identity chips rendered next to the title. */
  badges?: React.ReactNode;
  /** Secondary line under the title (e.g. address, full-width, never clipped). */
  subtitle?: React.ReactNode;
  facts?: Fact[];
  /** The primary "기본 정보" tab, split into a read view and an edit form. */
  info?: { label?: string; read: React.ReactNode; edit: React.ReactNode };
  /** Additional tabs (collections, related tables) after the info tab. */
  tabs?: DetailTab[];
  /** Entity-specific header actions (e.g. 계약서 PDF, 상태 변경). */
  actions?: React.ReactNode;
  /**
   * Optional desktop side rail (e.g. a persistent notes panel). On xl+ it sits
   * beside the tabs in a sticky right column; below xl it collapses into a tab
   * (labeled `asideLabel`) instead of stacking, to spare vertical space.
   */
  aside?: React.ReactNode;
  /** Tab label used for `aside` when it collapses below xl. */
  asideLabel?: string;
}

export function DetailView({
  back,
  basePath,
  activeTab = "",
  title,
  badges,
  subtitle,
  facts,
  info,
  tabs = [],
  actions,
  aside,
  asideLabel = "메모",
}: DetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = React.useTransition();
  const isWide = useIsWide();

  // The aside sits in a sticky rail on wide screens; below xl it becomes a tab.
  const asideInRail = aside != null && isWide;
  const asideAsTab = aside != null && !isWide;

  const infoLabel = info?.label ?? "기본 정보";
  // The info tab is always the default (key ""); other tabs carry their own slug.
  const allTabs: DetailTab[] = [
    ...(info ? [{ key: "", label: infoLabel, content: null }] : []),
    ...tabs,
    ...(asideAsTab
      ? [{ key: "notes", label: asideLabel, content: aside }]
      : []),
  ];

  // Resolve the active tab from the route segment, falling back to the first tab
  // for unknown/stale slugs so a bad deep-link still renders something sane.
  const current = allTabs.find((t) => t.key === activeTab) ?? allTabs[0];
  const currentKey = current?.key ?? "";
  const onInfoTab = info != null && currentKey === "";

  // Edit lives as `?edit=1` on the base (info) route. Keeping it in the URL means
  // a refresh preserves edit mode, and the update action's redirect back to
  // basePath (without the param) naturally returns to the read view.
  const editing = onInfoTab && searchParams.get("edit") === "1";
  const infoContent = info ? (editing ? info.edit : info.read) : null;

  function hrefFor(key: string) {
    return key === "" ? basePath : `${basePath}/${key}`;
  }

  function changeTab(key: string) {
    if (!key && key !== "") return;
    if (key === currentKey) return;
    startTransition(() => router.push(hrefFor(key)));
  }

  function toggleEdit() {
    const href = editing ? basePath : `${basePath}?edit=1`;
    startTransition(() => router.replace(href));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link
            href={back.href}
            className="hover:text-foreground hover:underline"
          >
            {back.label}
          </Link>
          <ChevronRight className="size-3.5 text-muted-foreground/60" />
          <span className="text-foreground">{title}</span>
        </nav>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && <div className="mt-1">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {info && (
              <Button
                variant={editing ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={toggleEdit}
              >
                {editing ? (
                  <>
                    <X className="size-4" />
                    취소
                  </>
                ) : (
                  <>
                    <Pencil className="size-4" />
                    편집
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {facts && facts.length > 0 && <KeyFacts items={facts} />}

      {/* Work area: tabs, optionally beside a sticky side rail on xl+. */}
      <div
        className={cn(
          asideInRail && "xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-6",
        )}
      >
        <div className="min-w-0">
          {/* Tabs */}
          <Tabs value={currentKey} onValueChange={changeTab}>
            <TabsList
              variant="line"
              className="h-9 w-full items-stretch justify-start gap-0 overflow-x-auto p-0 scrollbar-none"
            >
              {allTabs.map((tab) => {
                const isActive = tab.key === currentKey;
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className={cn(
                      // The active indicator is a real bottom border (painted inside
                      // the box, so overflow-x-auto can't clip it). gap-0 keeps the
                      // per-tab borders touching into one continuous rail: muted
                      // under inactive tabs, brand under the active one — same line.
                      "flex-none rounded-none border-0 border-b-2 border-border px-3 text-muted-foreground after:hidden",
                      "data-active:border-b-brand data-active:font-semibold data-active:text-foreground",
                    )}
                  >
                    {tab.label}
                    {tab.count != null && (
                      <span
                        className={cn(
                          "tabular ml-0.5 inline-flex min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-medium",
                          tab.alert
                            ? "bg-danger-weak text-danger"
                            : isActive
                              ? "bg-brand-weak text-brand"
                              : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {allTabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key} className="mt-5">
                {info && tab.key === "" ? infoContent : tab.content}
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {asideInRail && (
          // Stretched grid cell so the sticky child has room to travel as the
          // tab content scrolls. Below xl the aside renders as a tab instead.
          <div className="mt-4 xl:mt-0">
            <div className="xl:sticky xl:top-[4.75rem]">{aside}</div>
          </div>
        )}
      </div>
    </div>
  );
}
