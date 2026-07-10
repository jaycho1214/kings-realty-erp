# Tenant Workspace + Performance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tenants screen a one-screen master-detail workspace (old-ERP anatomy, Operations Desk skin) and eliminate the Vercel↔Seoul latency that makes every page feel slow.

**Architecture:** Phase 1 pins Vercel functions to Seoul (`icn1`) and flattens sequential DB-query blocks into single `Promise.all`s on the hottest paths. Phase 2 adds a `tenants/layout.tsx` route layout that renders a persistent client-side roster rail (search + status tabs + keyboard nav) beside the routed detail pane; the existing tenant `DetailView` stays, gaining `dense`/`mobileOnlyBack` props.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, Kysely/Postgres, Tailwind v4, shadcn/ui, node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-07-10-tenant-workspace-and-perf-design.md`

## Global Constraints

- Keep the Operations Desk design system exactly: indigo accent (`brand` tokens), mono money, status vocabulary, flat panels. **No design-token changes, no teal.**
- All UI copy in Korean, matching existing labels (입주 / 퇴거 / 휴지통 / 세입자 …).
- Workspace root: `/Users/jay/Codes/kingsrealty`. App package name is `crm` (`pnpm --filter crm …`).
- **Git hygiene:** an external auto-commit process also moves HEAD in this repo. `git add` ONLY the files you created/modified — never `git add -A` or `git add .`.
- Verification commands for every task: `pnpm --filter crm exec tsc --noEmit`, `pnpm --filter crm lint`, `pnpm --filter crm test` (unit tests), `pnpm --filter crm dev` (manual, port 5007).
- Existing behavior that must survive: deep links `/tenants/[id]` and `/tenants/[id]/<tab>`, the dashboard link `/tenants?status=inactive`, 휴지통 restore/purge actions (admin-only), the two create dialogs (계약서로 등록, 새 세입자).

---

### Task 1: Pin Vercel functions to Seoul

**Files:**
- Modify: `apps/crm/vercel.json`

**Interfaces:**
- Produces: deployment config only; no code interfaces.

- [ ] **Step 1: Add the region key**

Replace the entire content of `apps/crm/vercel.json` with:

```json
{
  "regions": ["icn1"],
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 18 * * *"
    }
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/crm/vercel.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add apps/crm/vercel.json
git commit -m "perf: pin Vercel functions to icn1 (Seoul) next to the Lightsail DB"
```

- [ ] **Step 4: Deploy-time verification note (manual, for Jay)**

Region selection requires a paid Vercel plan (Pro or above; Hobby is pinned to iad1). After the next deploy, confirm in Vercel dashboard → Project → Functions that the region shows `icn1`, and compare TTFB of `/tenants` from Korea before/after (browser devtools, Network tab, Doc request → Timing). Record both numbers in the PR/commit notes.

---

### Task 2: Flatten query waterfalls (dashboard layout + tenant detail)

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/layout.tsx`
- Modify: `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx`

**Interfaces:**
- Consumes: existing query expressions (moved verbatim, not rewritten).
- Produces: same variable names as before — downstream JSX is untouched.

- [ ] **Step 1: Dashboard layout — fold `getChargeTypeCatalog()` into the existing `Promise.all`**

In `apps/crm/src/app/(dashboard)/layout.tsx`, the layout currently runs the six count queries in a `Promise.all`, then afterwards `const chargeTypes = await getChargeTypeCatalog();` — a second sequential round trip. Change the destructure to include it:

```tsx
const [tenants, leases, properties, unpaid, services, notifications, chargeTypes] =
  await Promise.all([
    // …the six existing count queries, unchanged, in the same order…
    getChargeTypeCatalog(),
  ]);
```

Then delete the standalone line `const chargeTypes = await getChargeTypeCatalog();` further down. Nothing else changes (the `counts` object and JSX already use these names).

- [ ] **Step 2: Tenant detail — merge the sequential blocks into one `Promise.all`**

`apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx` currently has 5 sequential await blocks:
1. `tenant` fetch (must stay first — `notFound()` gate and `tenant.rank` feed later calls)
2. `Promise.all` #1 (9 queries: `familyMembers, pets, leases, payments, notes, baseLocations, documents, staff, tenantEvents`)
3. `Promise.all` #2 (10 members: `vacantProperties, realtyFeeRows, ledger, exchangeVendors, session, ohaLimit, charges, recurring, billPresets, ohaRateRows`)
4. `const usdRate = await getUsdToKrwRate();` (~line 376)
5. `const inspections = inspectionLease ? await db.selectFrom("inspection")… : [];` (~line 406)

Merge blocks 2–5 into ONE `Promise.all` directly after the tenant fetch. Move all 19 existing query/call expressions verbatim (order: the 9 from block 2, then the 10 from block 3), and append two new members — `getUsdToKrwRate()` and an inspections query that no longer waits on `leases` because it resolves the latest lease with a subquery:

```tsx
const [
  familyMembers,
  pets,
  leases,
  payments,
  notes,
  baseLocations,
  documents,
  staff,
  tenantEvents,
  vacantProperties,
  realtyFeeRows,
  ledger,
  exchangeVendors,
  session,
  ohaLimit,
  charges,
  recurring,
  billPresets,
  ohaRateRows,
  usdRate,
  inspections,
] = await Promise.all([
  // …the 19 existing expressions, moved verbatim…
  getUsdToKrwRate(),
  db
    .selectFrom("inspection")
    .select(["id", "type", "status", "inspected_at", "checklist", "summary"])
    // Latest lease by start_date — same lease `inspectionLease` (leases[0])
    // resolves to, but as a subquery so this doesn't wait on the leases result.
    // No lease → `lease_id = NULL` → zero rows, matching the old `[]` branch.
    .where("lease_id", "=", (eb) =>
      eb
        .selectFrom("lease")
        .select("lease.id")
        .where("lease.tenant_id", "=", numId)
        .orderBy("lease.start_date", "desc")
        .limit(1),
    )
    .orderBy("inspected_at", "desc")
    .execute(),
]);
```

Then:
- Delete the old block-3 `Promise.all` wrapper and its comment (keep the moved expressions).
- Delete `const usdRate = await getUsdToKrwRate();` (the `arrearsTotalKrw` code above it stays, still using `usdRate`).
- Delete the old `const inspections = inspectionLease ? await db… : [];` statement. Keep the `const inspectionLease = leases[0] ?? null;` line and its comment — the `<Inspections>` props still use `inspectionLease?.id` / `inspectionLease?.property_id`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter crm exec tsc --noEmit && pnpm --filter crm lint`
Expected: both pass with no new errors.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm --filter crm dev`, open `http://localhost:5007/tenants`, click into a tenant. Verify the detail renders identically: facts strip, 기본 정보, tabs with counts (문서/임대 계약/점검/정기 청구/청구/원장), notes aside, and the 점검 tab shows the same inspections as production for a tenant that has some.
Expected: no visual or data difference.

- [ ] **Step 5: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/layout.tsx" "apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx"
git commit -m "perf: collapse dashboard-layout and tenant-detail query waterfalls into single parallel blocks"
```

---

### Task 3: Roster filter logic (TDD)

**Files:**
- Create: `apps/crm/src/lib/tenant-roster.ts`
- Test: `apps/crm/src/lib/tenant-roster.test.ts`
- Modify: `apps/crm/package.json` (add the test file to the `test` script list)

**Interfaces:**
- Produces:
  - `type RosterView = "active" | "all" | "inactive" | "deleted"`
  - `filterRoster<T extends { name: string; phone: string | null; status: string; deleted: boolean }>(rows: T[], q: string, view: RosterView): T[]`
- Consumed by: `TenantRail` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `apps/crm/src/lib/tenant-roster.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRoster } from "./tenant-roster";

const mk = (over: Partial<Row> = {}): Row => ({
  name: "BOUCHER,Jeremy",
  phone: "010-8037-7805",
  status: "active",
  deleted: false,
  ...over,
});
type Row = {
  name: string;
  phone: string | null;
  status: string;
  deleted: boolean;
};

test("view filters: active / inactive / all / deleted", () => {
  const rows = [
    mk(),
    mk({ name: "PHAM,hyh", status: "inactive" }),
    mk({ name: "Gone", deleted: true }),
  ];
  assert.deepEqual(
    filterRoster(rows, "", "active").map((r) => r.name),
    ["BOUCHER,Jeremy"],
  );
  assert.deepEqual(
    filterRoster(rows, "", "inactive").map((r) => r.name),
    ["PHAM,hyh"],
  );
  // 전체 = every non-deleted tenant regardless of status.
  assert.deepEqual(
    filterRoster(rows, "", "all").map((r) => r.name),
    ["BOUCHER,Jeremy", "PHAM,hyh"],
  );
  assert.deepEqual(
    filterRoster(rows, "", "deleted").map((r) => r.name),
    ["Gone"],
  );
});

test("name search is case-insensitive substring", () => {
  const rows = [mk(), mk({ name: "Tyler Perry" })];
  assert.deepEqual(
    filterRoster(rows, "boucher", "active").map((r) => r.name),
    ["BOUCHER,Jeremy"],
  );
  assert.equal(filterRoster(rows, "  perry ", "active").length, 1);
  assert.equal(filterRoster(rows, "zzz", "active").length, 0);
});

test("phone search matches on digits only, any formatting", () => {
  const rows = [mk(), mk({ name: "No Phone", phone: null })];
  assert.equal(filterRoster(rows, "8037", "active").length, 1);
  assert.equal(filterRoster(rows, "010-8037", "active").length, 1);
  // A numeric query must not crash on null phones.
  assert.equal(filterRoster(rows, "9999", "active").length, 0);
});

test("empty query returns the whole view", () => {
  const rows = [mk(), mk({ name: "B" })];
  assert.equal(filterRoster(rows, "   ", "active").length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter crm exec node --import tsx --test src/lib/tenant-roster.test.ts`
Expected: FAIL — cannot find module `./tenant-roster`.

- [ ] **Step 3: Write the implementation**

Create `apps/crm/src/lib/tenant-roster.ts`:

```ts
/**
 * Client-side roster filtering for the tenant workspace rail.
 * The full roster (~150–300 rows) ships to the client once; search and the
 * 입주/전체/퇴거/휴지통 tabs filter it locally so switching is instant.
 */
export type RosterView = "active" | "all" | "inactive" | "deleted";

const digits = (s: string) => s.replace(/\D/g, "");

export function filterRoster<
  T extends { name: string; phone: string | null; status: string; deleted: boolean },
>(rows: T[], q: string, view: RosterView): T[] {
  const inView = rows.filter((r) => {
    if (view === "deleted") return r.deleted;
    if (r.deleted) return false;
    if (view === "all") return true;
    return r.status === view;
  });

  const query = q.trim().toLowerCase();
  if (!query) return inView;

  const queryDigits = digits(query);
  return inView.filter(
    (r) =>
      r.name.toLowerCase().includes(query) ||
      (queryDigits.length > 0 &&
        r.phone != null &&
        digits(r.phone).includes(queryDigits)),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter crm exec node --import tsx --test src/lib/tenant-roster.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register the test file**

In `apps/crm/package.json`, append ` src/lib/tenant-roster.test.ts` to the end of the `"test"` script's file list (single line, space-separated like the existing entries).

Run: `pnpm --filter crm test`
Expected: all suites pass, including the new one.

- [ ] **Step 6: Commit**

```bash
git add apps/crm/src/lib/tenant-roster.ts apps/crm/src/lib/tenant-roster.test.ts apps/crm/package.json
git commit -m "feat(tenants): roster filter logic for the workspace rail"
```

---

### Task 4: DetailView `mobileOnlyBack` + `dense` props

**Files:**
- Modify: `apps/crm/src/components/detail/detail-view.tsx`
- Modify: `apps/crm/src/components/detail/key-facts.tsx`

**Interfaces:**
- Produces (consumed by Task 6):
  - `DetailViewProps` gains `mobileOnlyBack?: boolean` (hide the breadcrumb on `lg+`) and `dense?: boolean` (tighter vertical rhythm; also passed through to `KeyFacts`).
  - `KeyFacts({ items, dense }: { items: Fact[]; dense?: boolean })`.
- Both props are optional and default to current behavior — **no other call site changes**.

- [ ] **Step 1: Extend `KeyFacts` with `dense`**

In `apps/crm/src/components/detail/key-facts.tsx`, change the component signature and the two class lists:

```tsx
export function KeyFacts({ items, dense }: { items: Fact[]; dense?: boolean }) {
  return (
    <div className="scrollbar-none flex overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      {items.map((f, i) => (
        <div
          key={i}
          className={cn(
            "min-w-[140px] flex-1 border-r border-border/55 last:border-r-0",
            dense ? "px-3.5 py-1.5" : "px-4 py-2.5",
          )}
        >
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
            {f.label}
          </div>
          <div
            className={cn(
              "mt-0.5 font-semibold",
              dense ? "text-sm" : "text-base",
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
```

(Everything above the component — imports, `Fact`, `toneClass` — is unchanged.)

- [ ] **Step 2: Extend `DetailView`**

In `apps/crm/src/components/detail/detail-view.tsx`:

Add to `DetailViewProps` (after `asideLabel`):

```tsx
  /** Hide the breadcrumb on lg+ (workspace layouts render their own list rail). */
  mobileOnlyBack?: boolean;
  /** Tighter vertical rhythm for dense workspace screens (tenant workspace). */
  dense?: boolean;
```

Add both to the destructure (`mobileOnlyBack = false, dense = false`), then apply:

1. Root wrapper: `<div className="space-y-4">` → `<div className={cn("space-y-4", dense && "space-y-3")}>`
2. Breadcrumb nav: `<nav className="flex items-center gap-1 text-xs text-muted-foreground">` → `<nav className={cn("flex items-center gap-1 text-xs text-muted-foreground", mobileOnlyBack && "lg:hidden")}>`
3. Facts strip: `{facts && facts.length > 0 && <KeyFacts items={facts} />}` → `{facts && facts.length > 0 && <KeyFacts items={facts} dense={dense} />}`
4. Tab content: `<TabsContent key={tab.key} value={tab.key} className="mt-5">` → `<TabsContent key={tab.key} value={tab.key} className={cn("mt-5", dense && "mt-3.5")}>`

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter crm exec tsc --noEmit && pnpm --filter crm lint`
Expected: pass. (No call site passes the new props yet; landlords/leases/properties/payments detail pages must render unchanged.)

- [ ] **Step 4: Commit**

```bash
git add apps/crm/src/components/detail/detail-view.tsx apps/crm/src/components/detail/key-facts.tsx
git commit -m "feat(detail): opt-in dense rhythm and mobile-only breadcrumb for workspace layouts"
```

---

### Task 5: Tenant workspace — layout, rail, index page

**Files:**
- Create: `apps/crm/src/app/(dashboard)/tenants/layout.tsx`
- Create: `apps/crm/src/app/(dashboard)/tenants/_components/tenant-workspace.tsx`
- Create: `apps/crm/src/app/(dashboard)/tenants/_components/tenant-rail.tsx`
- Rewrite: `apps/crm/src/app/(dashboard)/tenants/page.tsx`

**Interfaces:**
- Consumes: `filterRoster`, `RosterView` from `@/lib/tenant-roster` (Task 3); `TenantLifecycleActions` from `./tenant-lifecycle-actions` (existing); `TenantForm`, `LeaseIntakeForm`, `PageHeader`, `CreateDialog`, `EmptyState` (existing).
- Produces: `RailTenant` type (exported from `tenant-rail.tsx`); route layout that renders `children` into the right pane — Task 6's loading boundaries land inside it.

- [ ] **Step 1: Create the workspace shell (client)**

Create `apps/crm/src/app/(dashboard)/tenants/_components/tenant-workspace.tsx`:

```tsx
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
```

- [ ] **Step 2: Create the roster rail (client)**

Create `apps/crm/src/app/(dashboard)/tenants/_components/tenant-rail.tsx`:

```tsx
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

  const rows = filterRoster(tenants, q, view);

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
    if (target && target.id !== selectedId) router.push(`/tenants/${target.id}`);
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
              className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
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
                  "relative block border-b border-border/40 px-3 py-2 last:border-b-0",
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
```

- [ ] **Step 3: Create the route layout (server)**

Create `apps/crm/src/app/(dashboard)/tenants/layout.tsx`. It absorbs the roster + create-dialog data the old page fetched, renders the persistent chrome, and streams `children` into the right pane. Note `tenantsList` for the lease-intake combobox is derived from the roster query instead of a separate query.

```tsx
import { getDb, sql } from "@kingsrealty/db";
import { seoulYMD } from "@/lib/date";
import { getSession } from "@/lib/session";
import { isAdmin, canViewSensitive } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { CreateDialog } from "@/components/create-dialog";
import { TenantForm } from "./_components/tenant-form";
import { LeaseIntakeForm } from "../leases/_components/lease-intake-dialog";
import { TenantWorkspace } from "./_components/tenant-workspace";
import { TenantRail, type RailTenant } from "./_components/tenant-rail";

export default async function TenantsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = getDb();
  const session = await getSession();
  const admin = isAdmin(session?.user?.role);
  const canViewRrn = canViewSensitive(session?.user?.role);

  // 조기 퇴거 flag needs "today" in Seoul, same as the old list page.
  const { year: sy, month: sm, day: sd } = seoulYMD();
  const today = new Date(sy, sm - 1, sd);

  const [rosterRows, baseLocations, landlordsList, propertiesList] =
    await Promise.all([
      db
        .selectFrom("tenant")
        .select((eb) => [
          "tenant.id",
          "tenant.name",
          "tenant.rank",
          "tenant.status",
          "tenant.phone",
          "tenant.deleted_at",
          eb
            .exists(
              eb
                .selectFrom("lease")
                .select("lease.id")
                .whereRef("lease.tenant_id", "=", "tenant.id")
                .where("lease.end_date", ">", today),
            )
            .as("lease_running"),
          eb
            .selectFrom("lease")
            .innerJoin("property", "property.id", "lease.property_id")
            .select(
              sql<string>`coalesce(property.address_jibeon, property.address)`.as(
                "address",
              ),
            )
            .whereRef("lease.tenant_id", "=", "tenant.id")
            .where("lease.status", "in", ["active", "pending"])
            .orderBy("lease.start_date", "desc")
            .limit(1)
            .as("address"),
        ])
        .orderBy("tenant.name", "asc")
        .execute(),
      db
        .selectFrom("base_location")
        .select(["id", "name", "name_ko"])
        .orderBy("sort_order", "asc")
        .execute(),
      db
        .selectFrom("landlord")
        .select(["id", "name"])
        .orderBy("name", "asc")
        .execute(),
      db
        .selectFrom("property")
        .select(["id", "address", "address_jibeon", "landlord_id"])
        .orderBy("address", "asc")
        .execute(),
    ]);

  const roster: RailTenant[] = rosterRows.map((r) => ({
    id: r.id,
    name: r.name,
    rank: r.rank,
    status: r.status,
    deleted: r.deleted_at != null,
    earlyMoveOut: r.status === "inactive" && !!r.lease_running,
    address: r.address ?? null,
    phone: r.phone,
  }));

  const activeCount = roster.filter(
    (t) => !t.deleted && t.status === "active",
  ).length;
  const tenantsList = rosterRows
    .filter((r) => r.deleted_at == null && r.status === "active")
    .map((r) => ({ id: r.id, name: r.name, rank: r.rank }));

  return (
    <TenantWorkspace
      header={
        <PageHeader
          title="세입자"
          count={activeCount}
          actions={
            <div className="flex gap-2">
              <CreateDialog
                title="계약서로 등록"
                buttonLabel="계약서로 등록"
                wide
                closeOnSuccess
              >
                <LeaseIntakeForm
                  landlords={landlordsList}
                  properties={propertiesList}
                  tenants={tenantsList}
                  baseLocations={baseLocations}
                  canViewRrn={canViewRrn}
                />
              </CreateDialog>
              <CreateDialog title="새 세입자" buttonLabel="새 세입자" wide>
                <TenantForm variant="plain" baseLocations={baseLocations} />
              </CreateDialog>
            </div>
          }
        />
      }
      rail={<TenantRail tenants={roster} isAdmin={admin} />}
    >
      {children}
    </TenantWorkspace>
  );
}
```

- [ ] **Step 4: Rewrite the index page**

Replace the entire content of `apps/crm/src/app/(dashboard)/tenants/page.tsx` with:

```tsx
import { Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

/**
 * /tenants index — the right pane when no tenant is selected. On mobile the
 * workspace shell hides this and shows the roster rail full-width instead.
 */
export default function TenantsIndexPage() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center rounded-xl border border-dashed border-border/70">
      <EmptyState
        icon={Users}
        title="세입자를 선택하세요"
        description="왼쪽 목록에서 세입자를 클릭하거나 이름·전화번호로 검색해 보세요."
      />
    </div>
  );
}
```

This deletes the old table page (search params, branch filter, pagination, tenant table) — all replaced by the rail. `_actions.ts` and `TenantLifecycleActions` are untouched and keep working (`revalidatePath("/tenants")` now refreshes the layout's roster).

**On "instant" navigation (spec's prefetch requirement):** rail rows are plain `<Link>`s on purpose — Next's default prefetching loads the shared layout + loading boundary for visible links, and Task 6's `[id]/loading.tsx` paints the pane skeleton immediately on click while only the `[id]` segment streams in (~1 fast Seoul-local render after Task 1). Do NOT set `prefetch={true}` on rail rows: that would issue a full dynamic render per visible row (~200 requests) on every rail scroll.

- [ ] **Step 5: Typecheck + lint + tests**

Run: `pnpm --filter crm exec tsc --noEmit && pnpm --filter crm lint && pnpm --filter crm test`
Expected: pass. If `tsc` complains about the Kysely scalar subquery `.as("address")` select, the fix is to cast via `sql<string | null>` inside the subquery select — keep the subquery, don't fall back to N+1 queries.

- [ ] **Step 6: Manual verification**

Run: `pnpm --filter crm dev`, then verify at `http://localhost:5007`:
1. `/tenants` (desktop width): header + rail + "세입자를 선택하세요" pane; rail shows the 입주 roster with addresses.
2. Click a tenant: detail renders in the right pane; the rail stays put (search text and scroll survive); the clicked row is highlighted with the indigo marker.
3. Search `010` → list filters; ↑/↓ keys move through tenants and the detail follows.
4. Tabs: 퇴거 shows moved-out tenants (warning dot on 조기 퇴거); 휴지통 shows deleted tenants with 복원/영구삭제 (as admin) and rows do not navigate.
5. `/tenants?status=inactive` (the dashboard link) opens with the 퇴거 tab active.
6. Deep link `/tenants/<id>/ledger` still renders the 원장 tab inside the workspace.
7. Narrow window (<1024px): `/tenants` shows the rail full-width; opening a tenant hides the rail and shows the detail with its breadcrumb.
8. Create a tenant via 새 세입자 → after the action completes, the new tenant appears in the rail.

- [ ] **Step 7: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/layout.tsx" "apps/crm/src/app/(dashboard)/tenants/_components/tenant-workspace.tsx" "apps/crm/src/app/(dashboard)/tenants/_components/tenant-rail.tsx" "apps/crm/src/app/(dashboard)/tenants/page.tsx"
git commit -m "feat(tenants): master-detail workspace with persistent roster rail"
```

---

### Task 6: Loading boundaries + detail-pane integration

**Files:**
- Rewrite: `apps/crm/src/app/(dashboard)/tenants/loading.tsx`
- Create: `apps/crm/src/app/(dashboard)/tenants/[id]/loading.tsx`
- Modify: `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx` (DetailView call only)

**Interfaces:**
- Consumes: `mobileOnlyBack` / `dense` from Task 4; the workspace layout from Task 5 (both loading files render inside its right pane).

- [ ] **Step 1: Right-pane skeleton for the index segment**

`tenants/loading.tsx` sits *inside* `tenants/layout.tsx` (layout → loading → page), so it only covers the right pane — the rail and header stay interactive. Replace the entire content of `apps/crm/src/app/(dashboard)/tenants/loading.tsx` with:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

/** Right-pane fallback while the tenants index/detail segment loads. */
export default function TenantsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}
```

- [ ] **Step 2: Detail skeleton for tenant→tenant navigation**

Create `apps/crm/src/app/(dashboard)/tenants/[id]/loading.tsx` (same skeleton — repeated on purpose so each boundary is self-contained):

```tsx
import { Skeleton } from "@/components/ui/skeleton";

/** Fallback while a tenant detail loads (also fires on id→id navigation). */
export default function TenantDetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}
```

- [ ] **Step 3: Wire the new DetailView props in the tenant detail**

In `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx`, the `return (<DetailView back={{ href: "/tenants", label: "세입자" }} …` call gains two props right after `back`:

```tsx
    <DetailView
      back={{ href: "/tenants", label: "세입자" }}
      mobileOnlyBack
      dense
      basePath={`/tenants/${numId}`}
```

Nothing else in the file changes. (The breadcrumb stays for mobile, where the rail is hidden; on desktop the rail replaces it.)

- [ ] **Step 4: Typecheck + lint + tests**

Run: `pnpm --filter crm exec tsc --noEmit && pnpm --filter crm lint && pnpm --filter crm test`
Expected: pass.

- [ ] **Step 5: Manual verification**

With `pnpm --filter crm dev`:
1. Navigate tenant → tenant from the rail: the right pane shows the skeleton (not a full-page blank), rail/header never flicker.
2. Desktop detail: no "세입자 >" breadcrumb; facts strip and tabs sit tighter (dense). At a 1366×768 window the name, facts (월세/보증금/DEROS/미납/총 납부), and the top of 기본 정보 are visible without scrolling.
3. Narrow window: breadcrumb "세입자 > <name>" is back and returns to the roster.
4. Other entity pages (landlords/leases/properties detail) still render with the roomy default — no dense/mobileOnlyBack applied there.

- [ ] **Step 6: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/loading.tsx" "apps/crm/src/app/(dashboard)/tenants/[id]/loading.tsx" "apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx"
git commit -m "feat(tenants): pane-scoped loading skeletons and dense workspace detail"
```

---

## Out of scope (tracked in the spec)

- Phase 3 dashboard big-number cards — separate effort.
- Rail virtualization (only if the roster grows past ~1k).
- Client-side hydration/bundle audit — only if the app still feels slow on office hardware after Tasks 1–2 ship.
