# Design — Recurring bills + auto-inferred 미납 (arrears)

Date: 2026-06-17

## Goal

Make 미납(arrears) a **derived fact** instead of a hand-maintained flag, and let staff
register **recurring bills** per tenant (관리비, 주차, 인터넷, metered 공과금…) beyond rent.

Three layers, cleanly separated:

- **Definition** (`recurring_charge`) — "이 세입자는 매달 관리비 ₩200,000, 10일 마감" (what recurs).
- **Charge** (`charge_item`) — the concrete monthly bill (what is owed) → drives 미납.
- **Payment** (`payment`) — the receipt (what was received). A charge links to the payment
  that settled it.

Rent already auto-generates monthly via `lib/charges.ts` + the daily cron. This feature
**adds the definition layer for non-rent bills** and **wires charge↔payment settlement** so
status (특히 미납) is computed, not typed.

## Decisions (from brainstorming)

- Definitions attach **per tenant** (one active lease per tenant in this business).
- A definition's `amount` is **optional** — blank = variable; generation creates an
  amount-pending placeholder (`unbilled`) excluded from 미납 until an amount is entered.
- Settlement is **explicit allocation at payment time** (the operator confirms which charges a
  payment covers), **with no partial payments** — a charge is binary: 미납 or 수납완료.
- **Rent stays lease-derived** (existing path); definitions cover non-rent only. Both produce
  `charge_item` rows reconciled identically.
- 미납 is **forward-looking** — no fabricated arrears for the 1,899 imported legacy payments.
- Customizable **preset catalog** in `settings/data` seeds quick-add templates.

## Data model — migration `016_recurring_charge.ts` (+ `types.ts` regen)

**New `recurring_charge`** (per-tenant definition):

| column | type | notes |
| --- | --- | --- |
| id | serial pk | |
| tenant_id | int, FK → tenant `on delete cascade` | |
| label | varchar, not null | e.g. "관리비", "주차" |
| type | varchar, not null, default `'custom'` | category key (`management`/`parking`/`utility`/`custom`) |
| amount | decimal, **null** | null = variable (amount entered each month) |
| currency | varchar, not null, default `'KRW'` | |
| due_day | int, not null, default 10 | day of month; clamped to month length at generation |
| active | boolean, not null, default true | soft on/off |
| start_month | date, null | first billing month (null = from creation month) |
| end_month | date, null | stop after this month (null = open-ended) |
| memo | text, null | |
| created_by | int, FK → user, null | |
| created_at / updated_at | timestamptz default now | |

Index on `tenant_id`. Index on `active`.

**Alter `charge_item`:**
- Add `recurring_charge_id` int, FK → `recurring_charge` `on delete set null`, null. Links a
  generated bill to its definition (traceability + idempotency).
- Add `paid_by_payment_id` int, FK → `payment` `on delete set null`, null. The settling payment.
- Make `amount` **nullable** (was not-null) for amount-pending placeholders.
- Unique index `uq_charge_item_recurring_month` on `(recurring_charge_id, billing_month)`
  (Postgres treats NULLs as distinct, so one-offs/rent unaffected).
- Migrate any legacy `status='partial'` rows → `'billed'` (partial is removed).

**New `bill_preset`** (settings catalog):

| column | type | notes |
| --- | --- | --- |
| id | serial pk | |
| label | varchar, not null | "관리비" |
| type | varchar, not null, default `'custom'` | |
| default_amount | decimal, null | |
| default_currency | varchar, not null, default `'KRW'` | |
| default_due_day | int, not null, default 10 | |
| is_variable | boolean, not null, default false | preset for variable (blank amount) bills |
| sort_order | int, not null, default 0 | |
| created_at | timestamptz default now | |

Seed defaults: 관리비 (management, ₩0/variable off — amount editable), 주차 (parking),
인터넷 (utility), 공과금 (utility, is_variable=true). Admin edits freely.

### `charge_item.status` lifecycle (now a maintained projection)

- `unbilled` (미청구) — variable placeholder, `amount` null → **excluded from 미납**.
- `billed` (청구됨) — amount set, unpaid, not past due.
- `paid` (수납완료) — `paid_by_payment_id` set.
- `overdue` (미납) — unpaid (`paid_by_payment_id` null) and `due_date < today`.
- (`partial` removed.)

`status` is recomputed automatically: on allocation change (payment create/delete), and by the
daily cron for billed→overdue. The manual status dropdown in `tenant-charges.tsx` is removed;
settlement happens via payments. (A `void` state is out of scope; delete the charge instead.)

## Generation — `lib/charges.ts` + cron

New `generateRecurringChargesForMonth(billingMonth)` runs in `runDailyJobs` right after the rent
step. For each `active` `recurring_charge` whose **tenant is active and has an active/renewed
lease**, and `billingMonth` ∈ `[start_month, end_month]`:

- Skip if a `charge_item` exists for `(recurring_charge_id, billing_month)` — idempotent (unique
  index). Safe to re-run.
- Resolve tenant's current lease → stamp `lease_id`.
- `due_date = billing_month + (due_day − 1)` days, **clamped to last day of month**.
- `amount` set → insert `charge_item{ status:'billed', amount, currency, recurring_charge_id }`.
- `amount` null → insert `{ status:'unbilled', amount:null, … }` (placeholder to-do).

Manual trigger: server action `generateTenantRecurringCharges(tenantId)` mirrors the existing
`generateTenantRentCharge` — a "이번 달 정기 청구 생성" button on the tenant 정기 청구 panel.
No back-fill of past months.

## Reconciliation — settlement at payment time

**Primary flow `/payments/new` (`createBulkPayment`):** each line item already becomes one
`payment` row (sharing a `bundle_id`) with `type`/`billing_month`/`lease_id`. Extend a line item
to carry an optional `charge_id`:

- `payment-collector.tsx`: when a lease is selected, load that lease's **open charges**
  (`billed`/`overdue`, plus `unbilled` only once an amount exists) and render an **"미납 청구"
  sub-panel**. Each open charge has an **추가** button that appends a line item pre-filled with
  its label/amount and a hidden `chargeId`. (Explicit — preserves the shipped "no auto-rent"
  behavior; the operator chooses what to collect.) Existing 월세 추가 / 항목 추가 buttons stay.
- `handleSubmit` serializes `items[i].charge_id` when present.
- `createBulkPayment`: after inserting a line's payment row, if the line has a `charge_id`,
  set `charge_item.paid_by_payment_id = <new payment id>`, `status='paid'` (guarded to the
  tenant's lease). All inside the existing transaction.
- Load source: `payments/new/page.tsx` passes `openChargesByLease: Record<leaseId, ChargeOption[]>`.

**Secondary flow `payment-form.tsx` (`createPayment`):** after picking lease + 청구월, show a
checklist of that tenant's open charges (auto-tick the one matching `payment_type` + month);
ticked charge ids settle on submit. (Lower priority than the bulk flow.)

**Reversal:** `paid_by_payment_id` is `ON DELETE SET NULL`, so deleting a payment re-opens its
charges; `deletePayment`/`updatePayment` call a `recomputeChargeStatus(chargeIds)` helper that
resets each to `billed`/`overdue` by due date. No stale 미납.

**Status helper** `lib/charges.ts#recomputeChargeStatus(db, chargeIds, today)`:
`paid_by_payment_id` set → `paid`; else `amount` null → `unbilled`; else past due → `overdue`;
else `billed`.

## 미납 inference & display — one source of truth

**미납 everywhere = `charge_item` with `paid_by_payment_id` null, `amount` not null,
`due_date < today`.** Arrears amount = Σ those `amount` (KRW; USD charges summed separately /
labeled — rare). `payment.status` is retired as the arrears signal.

- **Tenant detail (`tenants/[id]/page.tsx`):** repoint the "미납" `Fact` from `payment.status`
  counting to the charge query (count + ₩ total of open overdue charges). The 청구 tab
  (`TenantCharges`) shows derived status badges (read-only), placeholders as "금액 입력 필요"
  with an inline amount field, and the new "이번 달 정기 청구 생성" button.
- **New 정기 청구 panel** on the tenant page (above/with the charge ledger): lists
  `recurring_charge` defs with add-from-preset / custom / edit / deactivate / delete. Editing
  amount affects **future** months only.
- **Dashboard (`page.tsx` + `_components/payment-board.tsx`):** repoint 미납 합계 + 미납/연체
  board/stats from `payment.status` → `charge_item`. Add a **"미납 세입자"** list (tenant, ₩,
  oldest unpaid month), sorted by amount desc.
- **Tenants list:** optional small `미납` badge/column. (YAGNI-gate; include if cheap.)

## Server actions — `tenants/_actions.ts`

- `addRecurringCharge(tenantId, formData)` / `updateRecurringCharge(id, tenantId, formData)` /
  `deleteRecurringCharge(id, tenantId)` / `toggleRecurringChargeActive(id, tenantId)`.
- `generateTenantRecurringCharges(tenantId)` (manual generate this month).
- `setChargeAmount(id, tenantId, amount)` — fills a placeholder, flips `unbilled`→`billed`.
- Remove `updateChargeStatus` from normal UI (status is derived). Keep `deleteCharge`,
  `addCharge` (one-offs), `generateTenantRentCharge`.
- `settings/data` actions: `addBillPreset` / `updateBillPreset` / `deleteBillPreset` (admin).

## Edge cases / decisions

- **No partial:** ticking a charge marks it fully `paid` regardless of exact amount; operator is
  trusted. Amounts shown for reference. USD charges settle the same way (no KRW normalization).
- **due_day clamp:** day 31 in Feb → 28/29 (last day of month).
- **Move-out:** generation gates on active tenant + active/renewed lease, so recurrence stops at
  move-out without needing `end_month`.
- **Editing a definition's amount** does not rewrite already-generated charges (forward-only).
- **Deleting a definition** sets generated charges' `recurring_charge_id` null (keeps history).
- **Legacy data:** no auto-reconcile of imported payments; 미납 starts from charges going
  forward. (Optional `reconcile-charges.ts` helper deferred — YAGNI.)
- **Currency:** arrears summed in KRW; USD charges (rare — realty fee) summed/labeled separately.

## Non-goals

- Partial payments / installment plans.
- Unifying `utility_bill` into `charge_item` (kept separate for 대납/metered detail; to avoid
  double-counting 미납, a metered bill is tracked as a variable recurring charge **or** a
  utility_bill, not both — operator choice).
- Notifications/reminders for 미납 (existing notification system can layer on later).
- Per-charge audit log beyond `paid_by_payment_id`.

## Implementation order

1. Migration `016` + `types.ts` regen.
2. Generation (`generateRecurringChargesForMonth` + cron wiring + `recomputeChargeStatus`).
3. Reconciliation (`createBulkPayment`/`deletePayment` charge linking; collector open-charge panel).
4. Tenant UI (recurring panel, charge ledger derived status + placeholders, 미납 fact repoint).
5. Dashboard repoint + 미납 세입자 list.
6. Settings preset catalog.

## Implementation deltas (decided during build, with user)

- **Unified type catalog.** `bill_preset` is now the single, user-addable catalog of
  bill/payment types — it drives both recurring-charge definitions AND the payment collector +
  edit dialog. Adding a type anywhere (inline `+ 새 유형`, or settings → 데이터 → 청구 유형)
  persists once and shows everywhere. `utility_type` is **no longer** the payment-type source
  (table kept for `utility_bill`'s metered history). No FK link — types stay string-based.
- **Expanded + addable payment types.** `payment_type` accepts `management`/`parking` (and any
  catalog label); `paymentTypeMap`, the `PAYMENT_TYPES` validator, the collector passthrough, and
  the edit dialog all updated. Collector's type list + edit dialog are preset-driven.
- **Currency rule.** USD charges convert to KRW via `lib/exchange.ts#getUsdToKrwRate`: only the
  $100 and $20 bill rates are maintained; a charge isn't a bill denomination, so it follows the
  latest **$20** rate (fallback $100, then any). Applied to tenant + dashboard 미납 totals.
- **Dashboard repoint scope.** 미납 합계 card, board 미납/연체 columns, the new 미납 세입자
  list, and the 이번 달 수납 card's 완료/미납/연체 counts all read `charge_item`. The 6-month
  collection **trend** stays on `payment` history (received money; charges are forward-only).

## Verification

- `pnpm lint` + typecheck across workspace.
- Migration up/down clean on a scratch DB.
- Add a 관리비 definition → run daily job → charge appears (idempotent on re-run).
- Variable def → placeholder `unbilled`, excluded from 미납 until amount entered.
- Record a bulk payment covering rent + 관리비 → both charges `paid`, 미납 = 0; delete the
  payment → charges re-open to `billed`/`overdue`.
- Dashboard + tenant 미납 figures match the charge query; legacy payments don't fabricate arrears.
