# DB-driven payment types — design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)

## Problem

Payment/charge "types" are translated to Korean labels, badge colors, and filter
chips by **hardcoded maps duplicated across ~8 files**. Meanwhile staff add
"types" in the DB (`bill_preset`, via the collector's "+ 새 유형" and settings).
The two don't meet: a DB-added type can never become its own category, because
`createBulkPayment` collapses any unknown type to `"service"` and keeps the typed
name only in `payment.label`. So new types show with a generic badge, no filter
chip, and any genuinely new *category* requires a code change.

Goal: **remove the hardcoded maps entirely** — labels, colors, and filter chips
all come from the DB — and do it **without adding a table** (consolidate, don't
sprawl).

## How types are stored today

A payment's "type" is split across two `payment` columns:

- `payment_type` — the **category** key, but **capped**: `createBulkPayment`
  (`payments/new/_actions.ts:182`) stores `KNOWN_PAYMENT_TYPES.has(t) ? t : "service"`,
  so it can only be one of rent/utility/deposit/service/management/parking/prepayment.
- `label` — the **specific line item** free text (전기요금, 선불금, 내용).

`charge_item.type` and `recurring_charge.type` use the same category keys.
`bill_preset` is the quick-pick catalog (label + type + recurring defaults); its
`type` is copied onto charges/payments at pick time. There is **no FK** from
`bill_preset` to anything — it relates purely by value-copy.

## Findings: no table is cleanly removable

Mapped the 6 billing/type tables. Each backs a live feature:

| table | role | verdict |
|---|---|---|
| `payment` | money received | keep |
| `charge_item` | what the **tenant owes** (미납 board, collector 불러오기) | keep |
| `utility_bill` | what the **office owes a utility company** (대납: bearer/payee/paid_to_company) | keep — still inserted live from lease UI, drives utility-due calendar |
| `recurring_charge` | per-tenant recurring definition → cron → `charge_item` | keep |
| `bill_preset` | quick-pick catalog | **repurpose as single source of truth** |
| `utility_type` | utility **kinds** (전기/가스/수도) for `utility_bill` | keep — `utility_bill.utility_type_id` NOT NULL FK + calendar + settings |

- `charge_item` did **not** supersede `utility_bill` (tenant-owes vs office-owes; the 대납 fields were never absorbed).
- `utility_type` is **not** redundant with `bill_preset` (different granularity: a utility *kind* vs a payment *category*; merging would conflate them).
- The only genuinely dead artifact is **code**: `addPaymentUtilityType`
  (`payments/new/_actions.ts:276`) has zero callers — delete it.

## Target design

### 1. `bill_preset` becomes the single source of truth (no new table)

Add two columns:

- `variant` `varchar NOT NULL DEFAULT 'outline'` — badge color (a shadcn Badge
  variant: `default|secondary|destructive|outline`).
- `is_builtin` `boolean NOT NULL DEFAULT false` — structural keys code itself
  writes; cannot be deleted or have their `type` changed in settings.

**Invariant: one row per `type`** (a unique index on `type`). The catalog is
therefore a clean `type → { label, variant, sort_order }` map. Each preset is its
own filterable type ("what you add is what you filter by").

Seeds after migration:

| label | type | is_builtin | source |
|---|---|---|---|
| 월세 | `rent` | ✅ | new (code writes `rent` via 월세 추가 + rent charge gen) |
| 보증금 | `deposit` | ✅ | new (deposit settlement) |
| 기타 | `service` | ✅ | new (기타 line) |
| 관리비 | `management` | ❌ | existing seed |
| 주차 | `parking` | ❌ | existing seed |
| 공과금 | `utility` | ❌ | existing seed |
| 인터넷 | `internet` | ❌ | existing seed, **re-typed** from `utility`→`internet` to satisfy the unique invariant |
| 선불금 | `prepayment` | ❌ | from migration 023 |

Only `rent`/`deposit`/`service` are builtin — those are the keys live code paths
write directly. `management/parking/utility/internet/prepayment` are
catalog-driven and deletable.

### 2. Write side — drop the cap

- `createBulkPayment`: remove the `KNOWN_PAYMENT_TYPES → "service"` collapse;
  store `item.type` **verbatim** (it always comes from a catalog pick).
- `addBillPreset` (collector "+ 새 유형"): dedupe by `type`; set `variant='outline'`,
  `is_builtin=false`. Adding a type = new catalog row = new chip, automatically.
- Settings preset CRUD (`settings/_preset-actions.ts`): add `variant`; block
  delete and `type` change when `is_builtin`.
- Delete dead `addPaymentUtilityType`.

### 3. Read side — one resolver replaces every map

New server helper `lib/charge-types.ts`:

```ts
// React-cached per request; the single read of the catalog.
getChargeTypeCatalog(): Promise<{
  list: { type: string; label: string; variant: BadgeVariant; sort_order: number }[];
  map: Map<string, { label: string; variant: BadgeVariant }>;
}>
```

Label/variant resolution for a stored type: `map.get(type) ?? { label: type, variant: 'outline' }`
(raw-string fallback — still no hardcoded label map).

Hardcoded maps removed and rewired to the resolver:

- `payments/page.tsx` — `typeMap` + `typeOptions` (filter chips ← `list`)
- `payments/bundle/[bundleId]/_detail.tsx` — `paymentTypeMap`
- `payments/[id]/_detail.tsx` — `typeMap`
- `payments/new/page.tsx` — `typeKo`
- `lib/labels.ts` — `paymentTypeMap` (static export → drop; consumers take the resolved map)
- `lib/tasks/queries.ts` — `chargeTypeLabel`
- `tenants/_components/tenant-charges.tsx` — `typeLabel`
- `payments/_components/payment-form.tsx` — static `paymentTypeOptions` + `builtinTypes`

**Server components** call `getChargeTypeCatalog()` directly. **Client components**
(`payment-form`, `payment-collector`, `tenant-charges`, any client filter UI)
receive the catalog via props from their server parent — the way `billPresets`
already flows.

### 4. Settings — extend the existing manager

The `bill_preset` manager on `settings/data` gains: color picker (`variant`),
and delete/type-edit disabled for `is_builtin` rows. No new settings screen.

### 5. Migration (`024_payment_type_catalog.ts`)

1. `alter table bill_preset add column variant ... default 'outline'`, `add column is_builtin ... default false`.
2. Re-type the duplicate: `update bill_preset set type='internet' where type='utility' and label='인터넷'`.
3. Add unique index on `bill_preset.type`.
4. Seed builtins `rent`/`deposit`/`service` (`is_builtin=true`) if absent.
5. (023 already homed 선불금 → `prepayment`; nothing further.)

`utility_type` / `utility_bill` / calendar untouched.

## Consequences / decisions

- **The stopgap hardcoded-map edits from the prior 선불금 task are deleted** by
  this refactor (they were correct before we chose to go DB-driven).
- **Colors reset to `outline`** for all rows (the main list was already all-outline;
  the two detail views' `secondary`/`destructive` are dropped). Colors are now
  editable in settings.
- **Historical `인터넷` utility payments** keep `payment_type='utility'` (they
  predate the `internet` type) and display under the 공과금 chip. No backfill by
  default; a one-line `update payment set payment_type='internet' where payment_type='utility' and label='인터넷'`
  is available if wanted later — explicitly out of scope here.
- `utility_type` is *conceptually* adjacent to the catalog but stays separate;
  folding it in would conflate utility-kinds with payment-categories and touch the
  대납/calendar features — out of scope.

## Out of scope

- Touching `utility_bill` / `utility_type` / the 대납 feature / calendar.
- A whole-schema (40-table) audit beyond the billing/type tables.
- Backfilling historical `인터넷` payments to the new `internet` type.

## Testing

- `tsc --noEmit`, `eslint`, `next build`, `prettier` clean across touched files.
- Unit test for `getChargeTypeCatalog` fallback (unknown type → raw label, outline).
- Manual: add a type via collector "+ 새 유형" → it appears as a badge **and** a
  filter chip with no code change; rename/recolor it in settings → reflected on the
  list; builtin rows can't be deleted.
