# Design — 지원금(OHA) by-rank popover on the tenant detail page

Date: 2026-06-17

On the tenant detail page (`/tenants/[id]`), clicking the **rank badge** opens a popover showing
the full **grouped OHA allowance table (지원금)** — the four housing rank-groups plus Utility and
MIHA rates — with the tenant's own group highlighted. Admins edit the amounts inline; the same
grouped rows are also edited from the Settings master, so both surfaces write one shared table.

This restructures the existing `oha_rate` model from per-individual-rank (placeholder USD seeds)
to **group-keyed KRW** rows matching the real OHA Rates sheet (effective 16 JAN 2025).

---

## Background / current state

- **Rank badge**: the tenant header renders a combined `branch · rank` chip
  (`<Badge variant="secondary">`, not clickable) — `tenants/[id]/page.tsx:256,466`.
- **OHA model**: `oha_rate` table keyed by individual `rank` + `dependent_status` + `region`,
  with effective-date history columns, seeded with **placeholder USD** amounts
  (`packages/db/src/migrations/012_oha_rate.ts`).
- **Master UI**: Settings → Data → "OHA 기준표" — a free-text per-rank add/end/delete table
  (`settings/_components/oha-rates.tsx`, actions in `settings/_actions.ts`, query in
  `settings/data/page.tsx`). All OHA mutations are **admin-gated** (`requireAdmin()`).
- **Tenant page**: already calls `getOhaLimit(rank, dependent_status)` (`lib/oha.ts`) and shows
  "OHA 한도" in the 군 정보 section as `$<amount> / 월` (`tenants/[id]/page.tsx:336-340`).
- **Rank values** are a fixed dropdown (`tenant-form.tsx:24-46`): `E-1`–`E-9`, `W-1`–`W-5`,
  `O-1`–`O-11`. No prior-enlisted `O-1E` variant is tracked.
- shadcn `popover`, `dialog`, `input`, `badge`, `tooltip` exist; `formatKRW` exists in `lib/utils`.

---

## Data model — group-keyed `oha_rate` (migration `013`)

Restructure `oha_rate` so it is keyed by a **code** (rank-group or special category) instead of an
individual rank. One *current* row per `(code, dependent_status)`, edited in place.

### Schema changes (migration `013_oha_grouped.ts`)
1. `DELETE FROM oha_rate` — drop all placeholder rows.
2. Rename column `rank` → `code`. Drop and recreate the lookup index on `(code, dependent_status)`.
3. Change the `currency` column default to `KRW` (existing rows are reseeded as KRW anyway).
4. Reseed the 12 rows below in **KRW**, `region = 'Default'`, `effective_from = '2025-01-16'`,
   `effective_to = null`.

The `effective_from`/`effective_to` columns are **kept** (forward-compat) but no versioning UI is
built — amounts are edited in place and `effective_from` is an editable "as of" date. Full
rate-change history is explicitly **out of scope** (YAGNI).

### Seed values (from the OHA Rates sheet, effective 16 JAN 2025, KRW)

| code | 계급 detail (full) | 비동반 (without) | 동반 (with) |
|---|---|--:|--:|
| `E1-E4` | E1~E4 | 2,909,999 | 3,233,333 |
| `E5-O4` | E5~E9, W1~W4, O1E~O3E, O1~O4 | 3,172,788 | 3,525,320 |
| `W5-O5` | W5, O5 | 3,600,000 | 4,000,000 |
| `O6-O10` | O6~O10 | 4,298,400 | 4,776,000 |
| `UTILITY` | 공과금 (Utility) | 780,367 | 1,040,490 |
| `MIHA` | MIHA (1회성) | 334,776 | 334,776 |

(12 rows = 6 codes × 2 dependent statuses. MIHA is identical for both statuses but stored as two
rows for schema uniformity.)

### `packages/db/src/types.ts`
Rename the `OhaRate.rank` field to `code` to match the renamed column.

---

## Rank → group mapping + display config (`apps/crm/src/lib/oha.ts`)

### `OHA_GROUPS` static config
An ordered array describing every code for display. One entry per code:

```ts
{ code, kind, shortLabel, detailLabel, oneTime, sort }
```

- `kind`: `"housing" | "utility" | "miha"`
- `shortLabel`: compact row label (`"E1~E4"`, `"E5~O4"`, `"W5/O5"`, `"O6~O10"`, `"공과금"`, `"MIHA"`)
- `detailLabel`: the full 계급 detail (e.g. `"E5~E9, W1~W4, O1E~O3E, O1~O4"`) shown on the
  highlighted/own row
- `oneTime`: `true` for MIHA (renders a "1회성" tag)
- `sort`: housing groups first (in rank order), then Utility, then MIHA

### `rankToGroupCode(rank: string | null): string | null`
Parses the stored rank (`"E-5"`) into letter + number and maps to a housing code:

| rank | code |
|---|---|
| `E-1`–`E-4` | `E1-E4` |
| `E-5`–`E-9` | `E5-O4` |
| `W-1`–`W-4` | `E5-O4` |
| `O-1`–`O-4` | `E5-O4` |
| `W-5` | `W5-O5` |
| `O-5` | `W5-O5` |
| `O-6`–`O-11` | `O6-O10` |

Unknown/blank rank → `null` (popover still renders, nothing highlighted, badge still clickable but
shows no "현재 계급" note). Utility/MIHA are never a rank's group.

### `getOhaLimit(rank, dependentStatus, ...)` update
Map `rank → rankToGroupCode(rank)`, then query `oha_rate` by `code` (housing codes only). Returns
KRW now. Signature/return shape unchanged (`{ amount, currency } | null`), so its one caller keeps
working; only the displayed currency changes (see below).

---

## Tenant page changes (`tenants/[id]/page.tsx`)

### Data loading
Add a parallel query for all current `oha_rate` rows (`code, dependent_status, amount,
currency, effective_from`, where `effective_to is null`). Compute
`groupCode = rankToGroupCode(tenant.rank)` and pass `isAdmin(session.user.role)` through. Reshape
the flat rows into `{ code → { with, without } }` for the table component.

### Rank badge → popover trigger
Split the combined `branch · rank` chip:
- **branch** stays as plain context (its own muted `Badge variant="secondary"`, or inline text).
- **rank** becomes its own chip rendered by the new client component, acting as the popover
  trigger: badge-styled button with `cursor-pointer`, a subtle hover ring, and a small `Coins`
  (lucide) icon to signal interactivity.
- If `tenant.rank` is null, render nothing for rank (no trigger).

### "OHA 한도" currency display
Change `tenants/[id]/page.tsx:336-340` from `` `$${ohaLimit.amount.toLocaleString()} / 월` `` to
`` `${formatKRW(ohaLimit.amount)} / 월` `` (KRW).

---

## Popover component (`tenants/_components/oha-allowance-popover.tsx`, client)

A `Popover` anchored to the rank chip trigger.

- **Trigger**: the rank chip (above).
- **Width**: ~`w-[420px]`; on small screens it stays a popover but is allowed to shrink/scroll.
- **Header**: title `지원금 (OHA)`, the effective date (`2025-01-16` formatted), and a
  `전체 기준표 →` link to `/settings/data` (the OHA 기준표 tab).
- **Body**: the shared `OhaRateTable` (below) with the tenant's `groupCode` passed in as the
  highlighted row. The highlighted row uses `bg-brand-weak` + a brand left border, shows the
  **full `detailLabel`**, and a small `현재 계급: {tenant.rank}` note. Other rows show `shortLabel`.
- **Edit affordance**: amounts render as live KRW `<Input>`s for admins; read-only formatted
  amounts (`formatKRW`) for non-admins. A single **저장** button at the footer (admins only),
  disabled until a value changes, commits all changed cells in one action and shows a success
  toast. MIHA row shows a "1회성" tag.

### Shared `OhaRateTable` (`tenants/_components/oha-rate-table.tsx` or `components/oha/…`)
A client component rendering the grouped table, reused by both the popover and the Settings master:

Props: `rows` (`{ code, dependent statuses → amount }`), `highlightCode?`, `editable: boolean`,
`onSave(changes)` (or wires the server action directly). Columns: **계급 | 비동반 | 동반**.
Rows are ordered by `OHA_GROUPS.sort`. Keeps local input state, diffs against initial values, and
calls the shared action with only changed `(code, dependent_status, amount)` tuples.

---

## Shared edit action (`updateOhaRates`)

A single admin-gated server action used by both surfaces:

```ts
updateOhaRates(changes: { code: string; dependent_status: "with" | "without"; amount: number }[])
```

- `await requireAdmin()`.
- Validate each amount is finite and ≥ 0.
- For each change, UPDATE the current row (`effective_to is null`) matching `code` +
  `dependent_status` + `region = 'Default'`, setting `amount`.
- `revalidatePath("/settings")` and `revalidatePath("/tenants/[id]", "page")` (or the specific
  tenant path) so both surfaces reflect the new values.

Location: add to `settings/_actions.ts` (already the OHA actions home) and import into the tenant
component, **or** a small dedicated `lib/oha-actions.ts` — decided in the implementation plan. The
old `addOhaRate` / `endOhaRate` / `deleteOhaRate` per-rank actions are removed (the group set is
fixed).

---

## Settings master rework (`settings/_components/oha-rates.tsx`)

Replace the free-text per-rank add/end/delete table with the shared `OhaRateTable` (editable,
`highlightCode` unset, admin-only — the Settings page is already admin-scoped). Update:
- `settings/data/page.tsx` query: select `code` instead of `rank`, reshape into the table's row
  prop, drop the effective_to-based ordering nuance (one current row per code).
- `settings/data/_components/data-settings.tsx`: the `OhaRateRow` interface (`rank` → `code`) and
  the props passed to the OHA tab.
- `settings/_actions.ts`: remove `addOhaRate` / `endOhaRate` / `deleteOhaRate`; add
  `updateOhaRates`.

---

## Permissions

- Viewing: any approved user can open the popover and see amounts.
- Editing (popover 저장 and Settings table): **admin only**, enforced server-side by
  `requireAdmin()` in `updateOhaRates`, and reflected client-side by passing `isAdmin` so
  non-admins see read-only formatted amounts (no inputs, no 저장 button).

---

## Out of scope (YAGNI)

- Rate-change versioning/history UI (columns kept, but in-place edit only).
- Region dimension beyond `Default` (kept in schema, not surfaced).
- Tracking prior-enlisted `O-1E`–`O-3E` ranks (not in the app's rank dropdown; they'd map to
  `E5-O4` anyway).
- Auto-applying Utility/MIHA to any payment or ledger flow — these are reference amounts only.

---

## File map

| File | Change |
|---|---|
| `packages/db/src/migrations/013_oha_grouped.ts` | **new** — rename `rank`→`code`, clear+reseed KRW grouped rows |
| `packages/db/src/types.ts` | `OhaRate.rank` → `code` |
| `apps/crm/src/lib/oha.ts` | `OHA_GROUPS` config, `rankToGroupCode`, `getOhaLimit` (code lookup, KRW) |
| `apps/crm/src/app/(dashboard)/tenants/[id]/page.tsx` | load OHA rows, split rank chip → popover trigger, KRW "OHA 한도" |
| `apps/crm/src/app/(dashboard)/tenants/_components/oha-allowance-popover.tsx` | **new** — rank chip trigger + popover |
| `apps/crm/src/app/(dashboard)/tenants/_components/oha-rate-table.tsx` | **new** — shared grouped editable table |
| `apps/crm/src/app/(dashboard)/settings/_actions.ts` | drop per-rank OHA actions, add `updateOhaRates` |
| `apps/crm/src/app/(dashboard)/settings/_components/oha-rates.tsx` | rework to shared `OhaRateTable` |
| `apps/crm/src/app/(dashboard)/settings/data/page.tsx` | query `code`, reshape rows |
| `apps/crm/src/app/(dashboard)/settings/data/_components/data-settings.tsx` | `OhaRateRow` `rank`→`code`, props |

---

## Testing / verification

- Migration runs cleanly; `oha_rate` holds exactly the 12 seeded KRW rows.
- Tenant with `rank = "E-5"`: badge clickable → popover highlights the `E5-O4` row, shows
  `현재 계급: E-5` and the full detail label; "OHA 한도" in 군 정보 shows `formatKRW` of 3,172,788 /
  3,525,320 per dependent status.
- Tenant with null rank: no rank chip / no trigger; page renders.
- Admin edits an amount in the popover → 저장 persists; Settings OHA 기준표 reflects the same value
  (and vice-versa).
- Non-admin: popover is read-only (no inputs, no 저장).
- `getOhaLimit` returns the correct KRW amount for representative ranks across all four groups.
