"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KeyFacts, type Fact } from "./key-facts";
import { cn } from "@/lib/utils";

export interface DetailTab {
  label: string;
  count?: number;
  /** Render the count as a danger pill (attention items like open AS). */
  alert?: boolean;
  content: React.ReactNode;
}

export interface DetailViewProps {
  /** Breadcrumb parent, e.g. { href: "/tenants", label: "세입자" }. */
  back: { href: string; label: string };
  title: string;
  /** Status / identity chips rendered next to the title. */
  badges?: React.ReactNode;
  facts?: Fact[];
  /** The primary "기본 정보" tab, split into a read view and an edit form. */
  info?: { label?: string; read: React.ReactNode; edit: React.ReactNode };
  /** Additional tabs (collections, related tables) after the info tab. */
  tabs?: DetailTab[];
  /** Entity-specific header actions (e.g. 계약서 PDF, 상태 변경). */
  actions?: React.ReactNode;
}

export function DetailView({
  back,
  title,
  badges,
  facts,
  info,
  tabs = [],
  actions,
}: DetailViewProps) {
  const [active, setActive] = React.useState("0");
  const [editing, setEditing] = React.useState(false);

  const infoLabel = info?.label ?? "기본 정보";
  const allTabs: DetailTab[] = info
    ? [{ label: infoLabel, content: editing ? info.edit : info.read }, ...tabs]
    : tabs;

  const onInfoTab = info != null && active === "0";

  // Discard any in-progress edit when navigating to a different tab, so the
  // header button's label/variant and toggleEdit's branch stay in sync. Handled
  // in the change event (not an effect) to avoid cascading-render setState.
  function changeTab(v: string) {
    if (!v) return;
    if (v !== "0") setEditing(false);
    setActive(v);
  }

  function toggleEdit() {
    if (editing) {
      setEditing(false);
    } else {
      setActive("0");
      setEditing(true);
    }
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
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {title}
            </h1>
            {badges}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {info && (
              <Button
                variant={editing && onInfoTab ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={toggleEdit}
              >
                {editing && onInfoTab ? (
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

      {/* Tabs */}
      <Tabs value={active} onValueChange={changeTab} className="flex-col">
        <TabsList
          variant="line"
          className="h-9 w-full items-stretch justify-start gap-0 overflow-x-auto p-0 scrollbar-none"
        >
          {allTabs.map((tab, i) => {
            const isActive = active === String(i);
            return (
              <TabsTrigger
                key={tab.label}
                value={String(i)}
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
        {allTabs.map((tab, i) => (
          <TabsContent key={tab.label} value={String(i)} className="mt-5">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
