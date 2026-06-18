# Tenant page: 연체 worklist + charge actions (수납 / 면제 / 정정)

**Date:** 2026-06-18
**Status:** Design — pending review

## Problem

A tenant's outstanding charges (billed/overdue) are visible on the tenant
detail page's **청구** tab, but the only row actions are *delete* and
*fill-amount*. To settle a charge you must leave for `/payments/new`, record a
payment, and rely on it being linked. There is no in-place way to (a) quickly
mark a charge collected, (b) waive it, or (c) void an erroneous/duplicate one.

## Goal

Turn the **청구** tab into the per-tenant 연체 worklist: surface outstanding
charges and give each a one-step resolution — **수납** (collect, creating a
linked payment), **면제** (waive), or **정정** (void). No new route/tab.

## Non-goals

- No global/cross-tenant 연체 page (the dashboard + `/payments?status=overdue`
  already cover that).
- The quick **수납** does not replace `/payments/new` for rich cases (USD
  split, multi-charge, partial). Those still go through the collector.
- No partial-payment model — settlement stays binary (matches migration 016).

## UX — 청구 tab (`tenant-charges.tsx`)

- **Ordering:** outstanding charges (`overdue` then `billed`) sort to the top;
  `paid` / `waived` / `void` fall below. A small count of outstanding items
  shows in the panel header (e.g. "연체·미납 3건").
- **Row actions** (only on `billed` / `overdue` rows) — a compact action group:
  - **수납** — opens a small dialog (see below).
  - **면제** — confirm, then `waiveCharge`.
  - **정정** — confirm, then `voidCharge`.
  - Delete stays available (rare; for truly removing a manual one-off).
- `paid` rows show 수납완료 + (if linked) a link to the payment; `waived` shows
  면제; `void` shows 무효 (muted). These rows have no actions.

### 수납 dialog

- Fields: **금액** (prefilled = charge amount, editable), **결제방법**
  (현금/카드/계좌이체), **납부일** (default = Seoul today).
- On submit → `settleCharge` creates one payment linked to the charge and flips
  it to 수납완료. Button disabled while pending (no double-submit).
- **KRW only.** For a non-KRW charge the dialog is replaced by a "수납 등록으로
  이동" link to `/payments/new?lease=<id>` (the collector handles FX). KRW covers
  rent + the overwhelming majority of charges.

## Data model — two new terminal charge statuses

Add to the `charge_item.status` vocabulary:

- **`waived`** (면제) — forgiven/discounted; not collected, not revenue.
- **`void`** (무효) — duplicate/error; should never have been outstanding.
  **Soft** (a row, not a delete) so the recurring cron's
  `(recurring_charge_id, billing_month)` uniqueness still blocks regeneration.

Both are terminal and must be preserved by status recomputation:

- `recomputeChargeStatus` (charges.ts): prepend
  `when status in ('waived','void') then status` to the derived-status CASE so a
  later payment edit can't revert them.
- `markOverdueCharges` only touches `status='billed'` — unaffected.
- `reconcileCharges` only touches `status in ('billed','overdue')` — unaffected.
- `CHARGE_STATUSES` set (tenants/_actions.ts) gains `waived`, `void`.

### Query impact — one small change

Most 미납/연체 surfaces already filter `status in ('billed','overdue')` — dashboard
`openCharges`, `/payments` obligation tabs, `/payments/new` `openCharges`,
`tasks/queries` suggestions — so `waived`/`void` are auto-excluded there.

The one exception: the dashboard **`monthCharges`** loop loads *all* statuses for
the current month and buckets non-paid/non-overdue as 미납, so it must `continue`
past `waived`/`void` (otherwise they'd inflate 미납 + expected). That's the only
query/loop touched.

## Server actions (tenants/_actions.ts)

All require an authenticated user and scope by `tenant_id`.

- **`settleCharge(chargeId, tenantId, { amount, method, date })`** — in one
  transaction: re-read the charge `FOR UPDATE`, **abort if
  `paid_by_payment_id IS NOT NULL`** (already settled — idempotent), insert a
  `payment` (`lease_id`, `payment_type` = charge type normalized to a known type
  else `service`, `label` = memo ?? type label, `billing_month` = charge month,
  `amount_krw` = amount, `currency_paid='KRW'`, `amount_paid` = amount,
  `payment_method`, `payment_date`, `status='paid'`, `received_by`), then set the
  charge `paid_by_payment_id` + `status='paid'`. revalidate `/tenants/[id]`,
  `/payments`, `/`.
- **`waiveCharge(chargeId, tenantId)`** — `status='waived'` where id+tenant and
  `paid_by_payment_id IS NULL`. revalidate `/tenants/[id]`, `/`.
- **`voidCharge(chargeId, tenantId)`** — `status='void'` where id+tenant and
  `paid_by_payment_id IS NULL`. revalidate `/tenants/[id]`, `/`.

The `paid_by_payment_id IS NULL` guard on all three prevents acting on an
already-collected charge.

## Edge cases

- Double-click 수납 → second call sees `paid_by_payment_id` set, no-ops (no
  orphan payment). UI also disables during the transition.
- Waive/void an already-paid charge → guarded no-op.
- Voiding a recurring-generated charge → the soft `void` row keeps the
  `(recurring_charge_id, billing_month)` slot filled, so the cron won't
  regenerate it. (Hard delete would regenerate — that's why void is soft.)
- A waived/void charge later needs reopening → out of scope; delete + regenerate
  or add a manual charge. (Future: an "undo" that returns it to billed.)

## Testing

- Unit: `recomputeChargeStatus` preserves `waived`/`void` (doesn't revert to
  overdue) — extend the charges-status reasoning if a test harness exists; else a
  one-off SQL assertion.
- Manual/DB: settle creates exactly one linked payment and one paid charge;
  double-submit yields no second payment; waived/void drop out of the dashboard
  연체 count and `/payments?status=overdue`.

## Out of scope / future

- Bulk actions (수납/면제 multiple at once).
- "Undo waive/void".
- USD quick-settle (routes to `/payments/new`).
