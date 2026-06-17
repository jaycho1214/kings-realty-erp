# Design — Service assignees/vendors + optional payment rent

Date: 2026-06-17

Two independent changes to the CRM (`apps/crm`):

1. `/payments/new` — rent is no longer auto-included; it is added on demand and is deletable.
2. `/services` — the single free-text `담당자/업체` field is split into a structured staff
   multi-select (our app users), an external-vendor picker (name + phone, with autocomplete),
   and a "landlord fixed it themselves" toggle.

The two features ship together but touch disjoint code, so they can be implemented and
reviewed independently.

---

## Feature 1 — `/payments/new`: rent optional & deletable

### Problem
Not every tenant pays rent every month. Today, selecting a lease auto-inserts a non-deletable
`월세` line item, forcing rent onto every payment.

### Scope
Client-only change in
`apps/crm/src/app/(dashboard)/payments/new/_components/payment-collector.tsx`.
No schema or server-action changes — `createBulkPayment` already stores each line's
`type`/`label`/`amount_krw` generically, so a rent line is just another line.

### Changes
1. **No auto-rent.** Initial `lineItems` state starts `[]` (drop the `defaultLeaseId` seeding at
   `:104-118`). `handleLeaseSelect` (`:148-166`) no longer injects a rent line — it sets the
   selected lease and resets line items to `[]`.
2. **One-click "월세 추가" button** placed next to the existing "항목 추가" button
   (`:545-553`). It appends `{ id, type: "rent", label: "월세", amount: selectedLease.monthly_rent_krw }`.
   Disabled when no lease is selected OR a rent line already exists (prevents duplicate rent lines).
3. **Rent deletable.** Remove the `item.type !== "rent"` guard on the trash button (`:530`) so
   every row — including rent — shows the delete control. The rent row keeps its read-only
   `유형 = 월세` / `내용 = 월 임대료` rendering and its editable amount.

### Behavior / edge cases
- Existing validation is unchanged: submit still requires ≥1 line item and `totalCharged > 0`.
  A payment with no rent line is valid as long as it has at least one other line.
- Switching the selected lease clears all line items (same as today), so a stale rent amount from
  a previous tenant can't leak across.
- The "월세 추가" button's disabled state means a tenant who already has a rent line can't get a
  second one; deleting the rent line re-enables the button.

---

## Feature 2 — `/services`: structured 담당자 + 외부 업체 + 임대인 직접 처리

### Problem
`service_request.assignee` is a single free-text column doing three jobs: naming internal staff,
naming external repair vendors, and (implicitly) noting when the landlord handled it. We want:
- **담당자** — selectable from our app users, multiple allowed.
- **외부 업체** — a third-party handler with name + phone, autocompleting from past vendors and
  auto-filling the phone when a known vendor is picked.
- **임대인 직접 처리** — a flag for when the landlord fixes it themselves.

These are independent, optional dimensions of "who handled this", not a single mutually-exclusive
choice.

### Data model

New migration `packages/db/src/migrations/014_service_assignees_vendors.ts`, then regenerate
`packages/db/src/types.ts` (`pnpm --filter @kingsrealty/db db:up`).

**`service_request_assignee`** (junction, mirrors `calendar_event_attendee`):
| column | type | notes |
| --- | --- | --- |
| id | serial pk | |
| service_request_id | int, FK → service_request, `on delete cascade` | |
| user_id | int, FK → user | |
| created_at | timestamp default now | |
| | unique `(service_request_id, user_id)` | one row per (request, staff) |

**`service_vendor`** (accumulating list for autocomplete):
| column | type | notes |
| --- | --- | --- |
| id | serial pk | |
| name | varchar, **unique** | dedupe key for upsert-by-name |
| phone | varchar, null | |
| created_at | timestamp default now | |

**`service_request`** added columns:
| column | type | notes |
| --- | --- | --- |
| vendor_id | int, FK → service_vendor, null | the external handler, if any |
| landlord_self | boolean, not null, default false | 임대인 직접 처리 |

**Legacy `assignee` column:** kept (not dropped) to preserve imported free-text data. It is no
longer written by the forms. The detail read-view surfaces it only as a muted "기존 기록: …" line
when present, so historical rows don't silently lose information. New rows leave it null.

### Server actions — `apps/crm/src/app/(dashboard)/services/_actions.ts`

Shared helper `resolveVendor(trx, { vendor_id, vendor_name, vendor_phone }) → number | null`:
- If `vendor_name` is blank → return `null`.
- Look up `service_vendor` by exact `name`. If found, optionally update its `phone` when a new
  non-empty phone differs, and return its id.
- Otherwise insert a new `service_vendor` and return the new id.
- (`vendor_id` from the client is treated as a hint; name is the source of truth so a renamed/new
  entry still resolves correctly.)

`createServiceRequest`:
- Parse `assignee_user_ids` (JSON array of ints), `vendor_name`, `vendor_phone`, `landlord_self`
  (`"true"`/`"false"`).
- Stop reading the old `assignee` field.
- Inside the existing transaction: `resolveVendor`, insert the `service_request` with
  `vendor_id` + `landlord_self`, then bulk-insert `service_request_assignee` rows for each user id
  (skip if empty). Status-log insert unchanged.

`updateServiceRequest`:
- Same parsing. Update `service_request.vendor_id`/`landlord_self`. Replace assignees: delete all
  `service_request_assignee` rows for this request, then re-insert the selected set.
- Existing status-log-on-change behavior unchanged.

`deleteServiceRequest`: relies on `on delete cascade` for assignee rows; vendors are not deleted.

### UI

**New client subcomponent** `apps/crm/src/app/(dashboard)/services/_components/service-assignment-fields.tsx`,
used by BOTH the create and edit branches of `service-form.tsx` (which currently duplicates its
fields). Props: `users: {id,name}[]`, `vendors: {id,name,phone}[]`, and `defaultValues`
(`assignee_user_ids?: number[]`, `vendor_id?`, `vendor_name?`, `vendor_phone?`, `landlord_self?`).
It renders and serializes:

- **담당자** — multi-select staff picker (Popover + Checkbox list + selected chips), modeled on
  the calendar attendee picker (`calendar/_components/create-event-dialog.tsx`), scoped to `user`.
  Emits hidden `assignee_user_ids` as a JSON array of ids (mirrors calendar's `attendees`).
- **외부 업체** — vendor combobox (Command/Popover, bank-select style). Typing filters existing
  vendors; selecting one fills `vendor_name` + `vendor_phone`; a free-typed name is allowed and
  created on save. A second editable input holds the phone (auto-filled on pick). Emits
  `vendor_id` (when a known vendor is picked), `vendor_name`, `vendor_phone`.
- **임대인 직접 처리** — a Checkbox. Emits `landlord_self` (`"true"`/`"false"`).

`service-form.tsx`: remove the two `담당자/업체` `<Input>`s (`:343-350` edit, `:498-499` create)
and render `<ServiceAssignmentFields … />` in their place in both branches.

**Pages load the new option lists:**
- `services/page.tsx`: also query `users` (`user`: id, name, ordered by name) and `vendors`
  (`service_vendor`: id, name, phone) in the existing `Promise.all`, and pass to `ServiceForm`.
- `services/[id]/page.tsx`: same option lists, plus the request's current assignee user ids and
  its vendor (join/subquery) for `defaultValues`.

**Detail read-view** (`services/[id]/page.tsx`): replace the single `담당자/업체` `Def` (`:190`)
with:
- `담당자` → comma/space-joined staff names, or `-`.
- `외부 업체` → `name` (with `· phone` when present), or `-`.
- `임대인 직접 처리` → always rendered as `예` / `아니오` (consistent with the other always-on
  `Def`s; the `예` value uses the success tone).
- `기존 기록` → muted line with legacy `assignee`, rendered only when non-null.

### Out of scope
- The services **list page** gets no 담당자 column or filter (YAGNI). Revisit if requested.
- No vendor-management screen; vendors accrue implicitly via the request form. Editing/merging
  vendors is out of scope.

### Permissions
Unchanged — all actions keep their existing `requirePermission("service", …)` gates.

---

## Implementation order
1. Migration + `types.ts` regen (Feature 2 foundation).
2. Feature 1 (isolated, fast, no deps).
3. Feature 2 server actions.
4. Feature 2 UI subcomponent + form wiring + page queries + detail view.

## Verification
- `pnpm lint` / typecheck across the workspace.
- `/payments/new`: select a lease → no rent line; "월세 추가" adds a deletable, pre-filled rent
  line; button disables while a rent line exists; submit works with and without rent.
- `/services` create + edit: assign multiple staff, pick an existing vendor (phone auto-fills),
  type a new vendor (persists + reusable next time), toggle 임대인 직접 처리; detail view reflects
  all three; legacy rows still show their old assignee as 기존 기록.
