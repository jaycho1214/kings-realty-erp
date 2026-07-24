"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filterRoster, type RosterView } from "@/lib/tenant-roster";
import { cn, formatPhone } from "@/lib/utils";
import { TenantLifecycleActions } from "./tenant-lifecycle-actions";

export interface RailTenant {
  id: number;
  name: string;
  rank: string | null;
  status: string;
  deleted: boolean;
  /** Moved out while a contracted lease is still running (조기 퇴거). */
  earlyMoveOut: boolean;
  /** Active/pending lease address (지번 preferred), if any. */
  address: string | null;
  phone: string | null;
}

const VIEWS: { value: RosterView; label: string }[] = [
  { value: "active", label: "입주" },
  { value: "all", label: "전체" },
  { value: "inactive", label: "퇴거" },
  { value: "deleted", label: "휴지통" },
];

export function TenantRail({
  tenants,
  isAdmin,
}: {
  tenants: RailTenant[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const selectedId = params.id ? Number(params.id) : null;

  // Honor the dashboard's /tenants?status=inactive deep link as the initial tab.
  const initialStatus = useSearchParams().get("status");
  const [view, setView] = React.useState<RosterView>(
    initialStatus === "inactive" ||
      initialStatus === "all" ||
      initialStatus === "deleted"
      ? initialStatus
      : "active",
  );
  const [q, setQ] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);

  // The roster is 100+ rows and every keystroke used to re-filter and
  // re-reconcile all of them synchronously, which is what staff feel as typing
  // lag on weak desks. Deferring the query lets React paint the keystroke
  // first and rebuild the list at lower priority (interruptible, so a fast
  // typist never queues up work); the memo keeps unrelated re-renders — a
  // selection change, a router update — from re-filtering at all.
  const deferredQ = React.useDeferredValue(q);
  const rows = React.useMemo(
    () => filterRoster(tenants, deferredQ, view),
    [tenants, deferredQ, view],
  );

  // Keep the selected row visible when selection changes (click or ↑/↓).
  React.useEffect(() => {
    if (selectedId == null) return;
    listRef.current
      ?.querySelector(`[data-tenant-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function moveSelection(delta: -1 | 1) {
    if (view === "deleted" || rows.length === 0) return;
    const idx = rows.findIndex((t) => t.id === selectedId);
    const next =
      idx === -1
        ? delta === 1
          ? 0
          : rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, idx + delta));
    const target = rows[next];
    if (target && target.id !== selectedId)
      router.push(`/tenants/${target.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5" onKeyDown={onKeyDown}>
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 또는 전화번호 검색..."
          className="pl-8"
          aria-label="세입자 검색"
        />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as RosterView)}>
        <TabsList className="w-full" aria-label="세입자 상태 필터">
          {VIEWS.map((v) => (
            <TabsTrigger
              key={v.value}
              value={v.value}
              className="flex-1 whitespace-nowrap"
            >
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="px-0.5 text-[11px] font-medium text-muted-foreground">
        {VIEWS.find((v) => v.value === view)?.label}{" "}
        <span className="tabular">{rows.length}</span>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60 bg-card"
      >
        {rows.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            결과가 없습니다
          </div>
        ) : view === "deleted" ? (
          rows.map((t) => (
            <div
              key={t.id}
              data-tenant-id={t.id}
              className="roster-row flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{t.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {t.address ?? (t.phone ? formatPhone(t.phone) : "-")}
                </div>
              </div>
              {isAdmin && <TenantLifecycleActions tenantId={t.id} deleted />}
            </div>
          ))
        ) : (
          rows.map((t) => {
            const selected = t.id === selectedId;
            return (
              <Link
                key={t.id}
                href={`/tenants/${t.id}`}
                data-tenant-id={t.id}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "roster-row relative block border-b border-border/40 px-3 py-2 last:border-b-0",
                  selected
                    ? "bg-brand-weak before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand"
                    : "hover:bg-muted/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      selected && "text-brand",
                    )}
                  >
                    {t.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {t.rank && (
                      <span className="text-[11px] text-muted-foreground">
                        {t.rank}
                      </span>
                    )}
                    {t.status === "inactive" && (
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          t.earlyMoveOut
                            ? "bg-warning"
                            : "bg-muted-foreground/40",
                        )}
                        title={t.earlyMoveOut ? "조기 퇴거" : "퇴거"}
                      />
                    )}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {t.address ?? (t.phone ? formatPhone(t.phone) : "-")}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
