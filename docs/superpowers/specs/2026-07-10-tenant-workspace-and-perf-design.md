# Tenant Workspace + Performance Foundation — Design

**Date:** 2026-07-10
**Status:** Approved direction (option B: workspace + perf, no re-theme)

## 1. Problem

Staff at the office don't use the new CRM. Their feedback, plus observation:

1. **"Looks foreign."** They lived for years in 유비플러스 SMART 고객관리 — a native
   Windows ERP whose 고객 screen is a one-screen master-detail: searchable
   customer roster always visible on the left, the entire record (보증금 · 월세 ·
   계약시작/만료 · 주인연락처 · 메모 …) on the right, sales history below. Zero
   page navigation. Our CRM is page-per-entity: list → navigate → detail →
   scroll → back. The load-bearing difference is **screen anatomy**, not color
   (decision: keep the indigo Operations Desk identity — no teal re-theme).
2. **"Slow website."** Staff use old, low-power computers. The app is on
   Vercel with **no region config** (functions default to `iad1`, US East)
   while the Postgres DB is on **Lightsail Seoul**. Every server render pays
   Korea→US East (~180ms) plus ~200ms **per sequential query round trip**
   US East→Seoul. The tenant detail page has 4+ sequential await blocks
   (session/tenant → Promise.all #1 → Promise.all #2 → usdRate → inspections),
   so a single click costs well over a second before hydration starts.

Staff live almost exclusively in the **tenants** screen, so that screen gets
the familiarity investment.

## 2. Goals / Non-goals

**Goals**
- Make tenant lookup feel like the old ERP: roster always visible, switching
  tenants instant, whole record one glance away.
- Cut server latency dramatically for all pages (region pinning + waterfall
  fixes).
- Keep the Operations Desk design system: indigo accent, mono money, status
  vocabulary, flat panels. Modern skin, legacy skeleton.

**Non-goals**
- No teal re-theme, no dark icon rail, no F-key emulation.
- No changes to payments/calendar/dashboard screens in this effort
  (dashboard big-number cards are a follow-up, phase 3).

## 3. Design

### Phase 1 — Performance foundation (do first; benefits every page)

1. **Pin Vercel functions to Seoul**: add `"regions": ["icn1"]` to
   `apps/crm/vercel.json` (verify the Vercel plan supports region selection;
   Pro does). Function↔DB latency drops ~200ms → ~2ms per round trip; the
   user→function hop also becomes domestic.
2. **Flatten query waterfalls on the tenant screens**:
   - `tenants/[id]/_detail.tsx`: merge the two sequential `Promise.all`
     blocks; only the `tenant` row fetch must precede queries that depend on
     tenant fields (`getOhaLimit(tenant.rank, …)`). Move `getUsdToKrwRate()`
     and the inspections query into the parallel blocks (inspections can key
     off the leases result inside the same block via a subquery on the
     tenant's latest lease).
   - `tenants/page.tsx`: already one `Promise.all`; verify session fetch
     overlaps rather than precedes.
3. **Measure before/after** (TTFB from Korea for `/tenants` and
   `/tenants/[id]`) so the win is verified, not assumed.
4. Client-side heaviness on old machines (hydration cost, table DOM size) is
   a **second pass only if** the app still feels slow after 1–3.

### Phase 2 — Tenant master-detail workspace

Rebuild `/tenants` as a persistent master-detail workspace using a route
layout, mirroring the old 고객 screen's anatomy.

**Structure**
- `tenants/layout.tsx` (new): renders a slim page header (title + the two
  existing create actions: 계약서로 등록, 새 세입자) above a two-pane body:
  a **left roster rail** (~300px, sticky, own scroll) and the routed right
  pane (`children`).
- The rail is a client component fed by a server query in the layout: the
  full non-deleted roster (id, name, rank, status, active-lease 주소/동,
  phone) — ~150–300 rows, loaded once, filtered client-side. The rail
  **never unmounts** while navigating between tenants (layouts don't
  re-render on child navigation), so scroll position and search text persist
  — the "index cards" feel of the old ERP.

**Rail contents** (top → bottom)
- Search input (이름/전화번호, client-side filter, autofocus on `/tenants`).
- Status filter tabs: 입주(default) / 전체 / 퇴거 / 휴지통 (admin-gated as
  today).
- Roster rows (~36px): name (bold) + rank badge, second line 동/주소 muted;
  status dot for 퇴거/조기퇴거. Active tenant row gets the design-system
  selected treatment (accent-weak fill + 2px indigo inset marker).
- Count in the rail header (e.g. `입주 153`), mono.
- Keyboard: ↑/↓ move selection through the filtered list (navigates), Enter
  focuses detail. Hover/focus **prefetches** the tenant route so clicks
  feel instant.

**Right pane**
- `/tenants` (index): a lightweight "select a tenant" empty state with the
  roster count; on desktop it can auto-highlight nothing (no redirect —
  keeps deep links and the mobile list sane).
- `/tenants/[id]`: the existing `DetailView` content unchanged in substance
  (facts strip, definition grid, 임대인/현재 계약 panels, notes aside, tabs:
  문서 / 임대 계약 / 점검 / 정기 청구 / 청구 / 원장 / 결제). Two adjustments:
  - Remove the now-redundant back-link ("← 세입자") since the roster is
    always present on desktop.
  - A light density pass so the record reads in one screenful at 1366×768
    (staff hardware): tighter facts strip and definition-grid rhythm on this
    screen only; no design-token changes.

**What happens to the current tenants table**
- The rail replaces the table as the browsing surface on desktop.
- 휴지통 (deleted) view moves into the rail's status tabs; in that mode rows
  show the existing restore/permanent-delete lifecycle actions (admin only)
  instead of navigating (deleted tenants have no detail page today).
- Branch (군종) filter: dropped from the primary UI (rarely a browsing axis;
  search + status cover daily use). If staff miss it, add a small filter
  popover to the rail later.
- Pagination: unnecessary at roster scale (~200 rows); the rail renders the
  full filtered roster in one scroll (matches the old ERP).

**Mobile / narrow screens**
- Below `lg`: the rail is hidden on `/tenants/[id]` (back-link returns) and
  `/tenants` renders the roster list full-width. Same components, stacked
  presentation — no separate mobile page.

### Phase 3 — Dashboard big-numbers (follow-up, separate effort)

Three metric stat-cards in the old dashboard's spirit (이번달 신규 세입자,
이번달 수납액, 미납 현황) with last-month deltas, using the existing stat-card
spec. Not part of this implementation; listed so it isn't lost.

## 4. Error handling & edge cases

- Tenant not found / deleted → existing `notFound()` behavior unchanged.
- Roster query failure → layout error boundary (existing global error page).
- A tenant moved out while selected: rail refetches on server revalidation;
  the row moves lists but the detail stays valid.
- Very long rosters (future growth): the rail is a simple list now;
  virtualization is deliberately deferred until row count hurts (>1k).

## 5. Testing & success criteria

- **Perf:** record TTFB for `/tenants` and `/tenants/[id]` from Korea before
  and after phase 1; expect several hundred ms improvement per navigation.
- **Behavior:** typecheck + lint + existing test suite; manual pass over
  roster search/filter/keyboard, 휴지통 lifecycle actions, mobile stacking,
  deep links (`/tenants/123/ledger` still works inside the workspace).
- **Adoption (the real metric):** staff can look up a tenant's 보증금/월세/
  계약만료 without leaving the screen or waiting; ask the office after a week.
