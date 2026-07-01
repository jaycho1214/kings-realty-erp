# Cmd+K → robust tenant search with dual actions

**Date:** 2026-07-01
**Status:** Approved

## Problem

The Cmd/Ctrl+K command palette can't reliably find a tenant by name. Two issues:

1. **Matching is too narrow.** The search API matches `name ILIKE '%q%'` — a single
   contiguous substring. Typing the name loosely ("smith john" for "John Smith", or
   partial tokens) returns nothing.
2. **From a hit there's only one destination.** A tenant result navigates to the detail
   page. The operator's frequent task — recording a payment — takes several more clicks.

The operator only wants to search **tenants, by name**. Property/landlord results are
noise for this workflow.

## Goals

- Type a tenant's name (any word order, partial tokens) and reliably surface them.
- From a hit, go **either** to the tenant detail page **or** straight into recording a
  new payment for that tenant.

## Non-goals

- Searching other entities (properties, landlords, appliances, services, leases, payments).
- Typo/fuzzy tolerance (would need a `pg_trgm` extension + migration). Deferred.

## Design

### 1. Token matching (`apps/crm/src/lib/search.ts`, new — pure & unit-tested)

`nameSearchPatterns(q: string): string[]`

- Split `q` on whitespace, drop empty tokens.
- `escapeLike` each token, wrap as `%token%`.
- Return `[]` when there are no tokens.

Unit tests (`search.test.ts`, added to the `test` script): word order, collapsed
whitespace, empty/whitespace-only input, wildcard escaping, single token.

### 2. Search API (`apps/crm/src/app/api/search/route.ts`)

- Tenant-only. Drop the property and landlord queries and their result groups.
- Build the tenant `where` from `nameSearchPatterns(q)`: **every** pattern must
  `ILIKE` the `name` (AND). Empty patterns → return `{ results: { tenants: [] } }`.
- Keep: auth + `isStaffOrAdmin` guard, `deleted_at IS NULL`. Add `ORDER BY name`,
  raise `LIMIT` 5 → 10.
- Also select each tenant's **active lease id** via a correlated subquery:
  most recent `lease` with `status = 'active'` (matches what `/payments/new` lists,
  so the preselect resolves) as `activeLeaseId` (nullable).
- Response: `{ results: { tenants: [{ id, name, phone, status, activeLeaseId }] } }`.

### 3. Command menu (`apps/crm/src/components/layout/command-menu.tsx`)

- Remove the properties/landlords rendering and their `SearchResults` fields. Keep the
  single 세입자 group. Static **Pages** / **Quick actions** sections unchanged.
- Each tenant hit exposes two actions:
  - **Primary** (Enter / row click) → `/tenants/{id}`.
  - **Payment** → `/payments/new?lease={activeLeaseId}`, shown only when
    `activeLeaseId` is present, via:
    - a trailing **수납** button on the row (stops propagation so it doesn't trigger
      the primary), and
    - **⌘↵ / Ctrl↵** on the highlighted row — a capture-phase keydown handler reads the
      `data-payment-href` of the `[data-selected="true"]` item and navigates.
- Footer hint: `↵ 상세 · ⌘↵ 수납` (⌘/Ctrl per `useIsMac`).

## Edge cases

- Tenant with no active lease → no `activeLeaseId` → payment action hidden; ⌘↵ no-ops.
- Empty / whitespace-only query → no tenant results (static sections still render).
- Wildcard characters in the query are escaped and matched literally.

## Files touched

- `apps/crm/src/lib/search.ts` (new) + `search.test.ts` (new, registered in `test`)
- `apps/crm/src/app/api/search/route.ts`
- `apps/crm/src/components/layout/command-menu.tsx`
