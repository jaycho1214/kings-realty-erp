# 계약서 일괄 등록 — One-dialog lease intake

**Date:** 2026-06-18
**Status:** Approved (design), pending implementation plan
**Source document:** HQ IMHM Form 1057EK-R (USAG Humphreys off-post lease agreement)

## Problem

When a new customer signs the standard lease agreement, getting them into the
CRM today requires visiting **four separate pages in sequence**: create the
임대인 (landlord) → create the 매물 (property) → create the 임차인 (tenant) →
create the 계약 (lease). A staff member holding one filled-out paper agreement
has to bounce between four forms, re-deriving who links to whom, before the
lease exists.

We want a **single dialog** that mirrors the agreement: type in everything on
the sheet once, submit, and the system creates 임대인 + 매물 + 임차인 + 계약
together — reusing records that already exist and creating the ones that don't.

## Goals

- One dialog captures a whole agreement and persists all four entities in a
  single transaction.
- Each of 임대인 / 매물 / 임차인 can **reuse an existing record** (search + pick)
  or be **created inline** ("신규 …" toggle).
- 임대인 can be **multiple people who are family**, stored as **one landlord
  record** (the representative) plus `landlord_family_member` rows — never as
  several separate landlord entities.
- **Every lessor's RRN (주민번호 / KID#)** can be captured — the primary and each
  family co-lessor — gated to admin/accounting.

## Non-goals (v1)

- PDF generation / filling the agreement form (separate, currently-broken
  feature at `/api/leases/[id]/pdf`; not in scope here).
- The realtor/agency block, housing rep, exchange rate, OHA-exceeds logic.
- Co-tenants: 임차인 is exactly **one** person per lease (matches the schema —
  `lease.tenant_id` is a single FK). No tenant repeater.
- Storing agreement-only cells that have no column in the schema (LQA Group#,
  safety-inspection date, utilities-included Y/N, advance payment, monthly
  utilities cap, maintenance POC). These are skipped; staff enrich later on the
  detail pages. 특별조항 (special agreement) text lands in `lease.notes`.

## Entry point

`/leases` is not a list page — it `redirect()`s to `/tenants` (leases are
tenant-centric and live inside each tenant's detail page). So the intake lives
on the **Tenants (세입자) page header**
(`apps/crm/src/app/(dashboard)/tenants/page.tsx`), as a second
**"계약서로 등록"** button next to the existing "새 세입자" `CreateDialog`
(`wide`). The per-tenant "새 계약" dialog on the tenant detail page stays as-is
for the case where the tenant already exists.

## Dialog structure

One tall, scrollable `CreateDialog` (`wide`, `closeOnSuccess`) with four sections
matching the agreement. The body is a single `<form action={createLeaseIntake}>`.
Mode toggles ("기존 선택" vs "신규") are client state that flips which inputs are
mounted; a hidden input carries the chosen mode so the server knows which branch
to take.

### 1. 임대인 (Lessor) — one record, 1…N people

- **Mode = existing:** `Combobox` over existing landlords → `landlord_id`. When
  chosen, the property section's landlord is implied (see §2).
- **Mode = new** (primary lessor → `landlord` row):
  - 성명\* (`name`), 핸드폰\* (`phone`), 이메일 (`email`), 주소 (`address`),
    KID#/주민번호 (`rrn`, admin/accounting only)
  - **"+ 공동 임대인 (가족) 추가"** repeater → indexed fields
    `lessor[i].name*`, `lessor[i].relationship` (배우자/자녀/…),
    `lessor[i].phone`, `lessor[i].rrn` (admin/accounting only). Each becomes a
    `landlord_family_member` row under the same landlord.

### 2. 매물 (Property)

- **Mode = existing:** `Combobox` over properties (search by address) →
  `property_id`. The property already carries its `landlord_id`, so when an
  existing property is chosen the 임대인 section is hidden/ignored.
- **Mode = new:** 임대물건 주소\* (`address`), 평수 (`size_pyeong`), 종류
  (`property_type` select: apartment/house/officetel/villa, default
  `apartment`). `landlord_id` comes from §1 (existing or just-created).
  `monthly_rent_krw` / `deposit_krw` default from the lease terms (§4).

### 3. 임차인 (Lessee) — one person

- **Mode = existing:** `Combobox` over tenants → `tenant_id`.
- **Mode = new:** 성명\* (`name`), 핸드폰\* (`phone`), Rank/Grade (`rank`),
  DODID (`military_id`), 소속/Unit (`unit`), 이메일 (`email`),
  기지 (`base_location_id` select, default **USAG Humphreys** = first base by
  `sort_order`).

### 4. 계약 조건 (Terms)

- 계약일/시작일\* (`start_date`), 계약기간(개월) (default 12),
  종료일\* (`end_date`, auto-computed from start + term, editable),
  월세\* (`monthly_rent_krw`), 보증금\* (`deposit_krw`),
  특별조항 (`notes` → `lease.notes`).
- Reuse the start/term/end date math already in `lease-form.tsx`
  (`addMonths`, `monthsBetween`) — extract to a shared helper rather than
  duplicating.

## Data model change

`landlord_family_member` has no RRN column today. Add one so co-lessor RRNs can
be stored.

**Migration `packages/db/src/migrations/022_landlord_family_rrn.ts`:**

```sql
ALTER TABLE landlord_family_member ADD COLUMN rrn_encrypted text;  -- nullable
```

Then regenerate `packages/db/src/types.ts` so
`LandlordFamilyMember.rrn_encrypted: string | null`.

No other schema changes. All other agreement fields map to existing columns.

## Server action — `createLeaseIntake(formData)`

New action in `apps/crm/src/app/(dashboard)/leases/_actions.ts`. It does **no
parsing/validation of its own** — it calls the pure `parseLeaseIntake(formData,
{ canViewRrn })` from `lib/lease-intake.ts` (unit-tested), gets back a normalized
plan, and performs the DB writes. This keeps the branching/validation logic in a
pure function the repo can test with `node --test`, matching the existing
`date.test.ts` pattern (server actions themselves are not DB-tested here).

**Authorization:** require the create permission for every entity it may write —
`lease`, and (when the corresponding mode is "new") `tenant`, `landlord`,
`property`. RRN inputs are only honored when `canViewSensitive(role)` (same gate
as `createLandlord`); a non-privileged user's `rrn` fields are ignored.

**Flow (single `db.transaction()`):**

1. **임대인:** if mode=existing → use `landlord_id`. Else insert `landlord`
   (encrypt `rrn` if privileged), then insert each `lessor[i]` as a
   `landlord_family_member` (encrypt each `rrn`). → `landlordId`.
2. **매물:** if mode=existing → use `property_id` (and ignore §1; derive landlord
   from the property if needed). Else insert `property` with `landlordId`,
   `monthly_rent_krw`/`deposit_krw` from §4, `status: 'occupied'`. → `propertyId`.
3. **임차인:** if mode=existing → use `tenant_id`, set `status: 'active'`. Else
   insert `tenant` with `base_location_id`. → `tenantId`.
4. **계약:** insert `lease` (`propertyId`, `tenantId`, dates, rent, deposit,
   `notes`, `status: 'active'`, `created_by`), and apply the same side-effects
   as `createLease`: property → `occupied`, tenant → `active`.

If any step throws, the whole transaction rolls back — no orphan records.

**After commit:** `revalidatePath` for `/tenants`, `/properties`, and the
relevant detail paths; `redirect` to the new tenant's detail page
(`/tenants/${tenantId}`), where the lease now appears — matching `createLease`,
which is also tenant-centric.

**Validation** mirrors the existing per-entity actions:

- new 임대인 → name + phone required.
- new 매물 → address required; rent/deposit numeric.
- new 임차인 → name + phone required; base_location chosen.
- lease → valid start/end dates; rent/deposit present.
- existing-mode ids must be positive integers.
  Throw Korean error messages consistent with the existing actions.

## Reveal co-lessor RRN (small follow-on, included)

Since we now store co-lessor RRNs, surface them so they aren't write-only:

- Generalize the reveal to family members. Either extend `revealLandlordRrn` or
  add `revealLandlordFamilyMemberRrn(id)` following the same
  `requireSensitiveAccess` + `decryptRrn` + `logAudit` pattern.
- Show a masked/reveal control per co-lessor in `LandlordFamilyMembers`
  (admin/accounting only), reusing the `LandlordRrn` component approach.

## Files touched

- `packages/db/src/migrations/022_landlord_family_rrn.ts` — new migration.
- `packages/db/src/types.ts` — regenerated (`rrn_encrypted` on family member).
- `apps/crm/src/app/(dashboard)/leases/_actions.ts` — `createLeaseIntake`.
- `apps/crm/src/lib/lease-intake.ts` — **pure parser** `parseLeaseIntake` (the
  unit-tested core: FormData → normalized create/reuse payloads + validation).
- `apps/crm/src/lib/lease-intake.test.ts` — parser unit tests (added to the
  `apps/crm` `test` script).
- `apps/crm/src/app/(dashboard)/leases/_components/lease-intake-dialog.tsx` —
  new client component (the four-section form + mode toggles + repeater).
- `apps/crm/src/app/(dashboard)/tenants/page.tsx` — header button + load
  landlords/properties/tenants/base_locations + `canViewRrn` for the dialog.
- `apps/crm/src/lib/date.ts` (+ `date.test.ts`) — add pure `addMonths` /
  `monthsBetween` for the dialog's end-date math. Leave `lease-form.tsx`'s local
  copies untouched (it has unrelated in-progress edits in the working tree).
- `apps/crm/src/app/(dashboard)/landlords/_actions.ts` +
  `_components/landlord-family-members.tsx` — co-lessor RRN reveal.

## Edge cases

- **Existing property + new landlord:** contradiction — an existing property
  already has a landlord. When property mode=existing, the 임대인 section is
  hidden and its inputs ignored.
- **Duplicate detection:** v1 does **not** auto-dedup. Staff pick "기존" when the
  person already exists. (Fuzzy matching on name/phone is a possible later add.)
- **Non-privileged staff:** RRN inputs are absent; the rest of intake works.
  RRNs can be added later by an admin on the landlord detail page.
- **Co-lessor with blank name:** skipped (matches the tenant family-member
  parse loop, which breaks on the first absent indexed name).

## Testing

The repo tests **pure logic** with `node --test` (see `apps/crm`'s `test`
script); server actions are not DB-tested. So the test surface is the parser.

- Unit (`lease-intake.test.ts`): `parseLeaseIntake` over the mode matrix —
  new/new/new, existing landlord + new property, existing property (→ landlord
  section ignored), existing tenant — asserting the normalized plan's shape.
- Unit: validation — missing required name/phone/address/dates throw the
  expected Korean errors; bad existing ids rejected.
- Unit: RRN gating — with `canViewRrn:true` the plan carries `rrn` for primary +
  each co-lessor; with `canViewRrn:false` all `rrn` fields are dropped.
- Unit: co-lessor parsing — indexed `lessor[i].*` collected; loop stops at the
  first absent name (matches the tenant family-member parse loop).
- Unit (`date.test.ts`): `addMonths` clamps end-of-month overflow; `monthsBetween`.
- Manual: fill a sample agreement end-to-end; confirm the lease, property,
  tenant, landlord, and co-lessor family rows; reveal a co-lessor RRN.
