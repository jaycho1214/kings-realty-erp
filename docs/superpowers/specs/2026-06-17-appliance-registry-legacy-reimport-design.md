# 비품(Appliance) 레지스트리 + 레거시 데이터 재이관

**Date:** 2026-06-17
**Status:** Approved design — pending implementation

## Background

The legacy platform (외부 판매관리 SaaS) was re-exported on 2026-06-17 with far
richer columns than the first import. Re-importing into the current ERP is a
chance to map the data into real structure ("split / merge / link, don't dump").
Two analyses drove this design:

1. **Source columns are now authoritative.** `Customers` carries `월세`(97%),
   `보증금`(96%), `계약시작`(99%), `계약만료`(100%), `주인/생년월일`(94%), `계급`,
   `부대`, `가족` directly — no more deriving rent/deposit from sales bundles.
   `Sales.판매내역` now _names_ each line item per sale (e.g.
   `전기요금(ELEC), 수도요금(WATER), 2026년6월`), so payments can be split by
   named item rather than guessed. `현금`/`카드`/`통장`/`미수금` are empty (cash
   only) and are ignored.
2. **Memos carry structured facts.** Across 226 distinct memos: 선불금 proration
   `선불금 4,320,000(10월 7일치+3,525,000)` (101), `realty fee 150불` (42),
   정수기/인터넷/가전 ownership `정수기킹스소유`·`인터넷 집주인소유` (~50),
   `DEROS 2027년1월` (8), `공동 임대인 …` (8).

Most of these map onto **existing** columns. One pattern — _appliance +
ownership_ — has no home, and overlaps with the already-built but empty
`property_equipment` feature (per-house 장비 list with `paid_by` + `monthly_cost_krw`).

## Goals

1. **Evolve `property_equipment` → first-class `appliance` registry**: ownership
   (집주인/킹스/세입자), brand/model, photos, and an A/S link into `/services`,
   with a dedicated `/appliances` page + sidebar entry.
2. **Re-import the new export into real structure**: authoritative
   lease/tenant/landlord fields; split + labeled payments (including the move-in
   bundle, shown in 납부내역); rent-bundled monthly items into `recurring_charge`;
   and memo-extracted fields (DEROS, realty fee, co-landlords, appliances).

## Non-goals (YAGNI)

- A separate move-in settlement table/panel — move-in money simply shows as a
  labeled `payment` bundle in 납부내역 (per decision).
- An account-manager (담당자) field — dropped, though `담당자` is 100% populated.
- Appliance warranty / purchase-date / quantity — not in the data; add later.
- Backfilling appliance `model_number` / photos — legacy has none; staff fill in.

## Design

### Part A — Appliance registry

#### A1. Schema — migration `019_appliance.ts`

Evolve the existing (empty) table; this is the "drop `property_equipment`" step.

- **Rename** `property_equipment` → `appliance`; rename index
  `idx_property_equipment_property` → `idx_appliance_property`.
- **Drop** `paid_by`, `monthly_cost_krw` (monthly money lives in `recurring_charge`).
- **Keep** `property_id` (FK→property, CASCADE), `name`, `notes`, timestamps.
- **Add:**
  - `owner` varchar NOT NULL default `'landlord'` — `landlord`(집주인) / `office`(킹스) / `tenant`(세입자).
  - `brand` varchar null.
  - `model_number` varchar null.
  - `as_contact` varchar null — A/S 전화/업체.
  - `status` varchar NOT NULL default `'normal'` — `normal`(정상) / `repair`(수리필요) / `broken`(사용불가).
- **Add** `appliance_id` integer null → `appliance.id` (ON DELETE SET NULL) on
  `service_request` (+ index). This is the A/S link.
- `types.ts`: replace `PropertyEquipment` with `Appliance`; add `appliance_id`
  to `ServiceRequest`; update `DB` map (`property_equipment` → `appliance`).

#### A2. Photos — reuse the document/blob system (no schema change)

Photos are `document` rows with `entity_type='appliance'`, `entity_id=appliance.id`,
stored as **private** Vercel blobs and served through the auth proxy
`/api/documents/[id]`. Add `"appliance"` to `ALLOWED_ENTITY_TYPES` in
`/api/upload/route.ts` (10MB cap + MIME allowlist unchanged).

#### A3. A/S link — into the existing 서비스 feature

`service_request.appliance_id` ties a repair to a specific appliance. On an
appliance's detail, list its repair history (`service_request WHERE appliance_id`),
and a **「수리 요청」** action opens a new service request pre-linked to the
appliance and its property's active lease. (`service_request.lease_id` is NOT
NULL, so A/S requires the property to have an active lease — see Edge cases.)

#### A4. Pages & navigation

New top-level section mirroring `properties/` (same tab-route pattern):

- `appliances/page.tsx` — list with `PageHeader`/`DataPanel`/`FilterTabs`/
  `SearchInput`/`Pagination`: columns 사진(thumb)·비품명·매물(주소)·소유·브랜드·모델·상태·A/S;
  filter by `owner`/`status`; `CreateDialog` + `ApplianceForm`.
- `appliances/[id]/_detail.tsx` + `appliances/[id]/[[...tab]]/page.tsx` — detail:
  fields, photo gallery (reuse inspection gallery pattern), A/S history.
- `appliances/_components/appliance-form.tsx`, `appliances/_actions.ts`,
  `appliances/loading.tsx`.
- **Sidebar** (`components/layout/sidebar-nav.tsx`): add
  `{ title: "비품", href: "/appliances", icon: Refrigerator }` to the **관리**
  group (after 매물).

#### A5. Property detail tab (slim down)

`property_equipment` was a tab on the property detail. Replace `<PropertyEquipment>`
with a compact read-only list of that property's appliances + a link to manage on
`/appliances`. Remove `property-equipment.tsx` and the `addEquipment`/
`deleteEquipment` actions; the new appliance CRUD lives in `appliances/_actions.ts`.

### Part B — Legacy re-import (upgrade `packages/db/src/import-platform.ts`)

The importer stays re-runnable (dry-run default; `--write` clears imported tables
and reloads in one transaction). Mapping:

- **B1. Customers → authoritative core.** `lease.monthly_rent_krw ← 월세`,
  `deposit_krw ← 보증금`, `start_date ← 계약시작`, `end_date ← 계약만료`;
  `tenant.rank ← 계급` (normRank → dashed OHA-canonical), `tenant.unit ← 부대`,
  `dependent_status` from `가족` signals; landlord from `주인/생년월일`
  (name + birth/sex front), `주인연락처 → phone`, `business_type='business'` for
  company-like names (그룹/어패럴/하우징/홀딩스…).
- **B2. `판매내역` → split, labeled payments.** Split the comma list; each item →
  a `payment` row with `label`: 전기/수도/가스/아파트공과금 (utility),
  `2026년N월`→월세 (rent = monthly_rent), 보증금→deposit, 선불금→선불금,
  `REALTY FEE`→중개수수료 ($150), 훅업→훅업, `주차위반(PARKING)`→주차, 기타→기타,
  dog/반려→반려동물. One `bundle_id` per source row; known amounts assigned
  (rent=monthly, realty=150), remainder allocated across the named utilities.
  Move-in rows (선불금/보증금) thus become a labeled bundle in 납부내역; the 선불금
  proration (`2월 9일치 + 3월세`, from memo) goes in `payment.notes`.
- **B3. `추가금액` → `recurring_charge`.** Parse components 관(관리비)/인(인터넷)/
  정(정수기)/수(수도)/전(전기) + amounts. `…포함`(included in rent) →
  `active=false` + memo `월세 포함`; `…받기/추가`/bare amount → `active=true`
  with amount; ambiguous → `active=false` + flag.
- **B4. Memos → existing columns + appliances.** `tenant.deros ← DEROS/DIROS`;
  `lease.realty_fee + currency ← 'realty fee 150불'`; `landlord_family_member ←
공동 임대인` (name + birth); **`appliance` rows ←** 정수기/인터넷/세탁기/건조기/
  냉장고/에어컨/보일러/TV/침대 + `owner` (집주인소유→landlord, 킹스/우리것/제공→
  office, 본인설치/세입자소유→tenant) + `brand` (LG/린나이/대성셀틱…) + `notes`.
- **B5. Re-run.** Confirm no staff-entered rows exist (import was 2026-06-17),
  dry-run → verify totals → `--write`.

## Edge cases

- **A/S on a vacant unit:** `service_request.lease_id` is NOT NULL, so 「수리 요청」
  is only offered when the property has an active lease; otherwise show a hint.
- **Tenant-owned appliances** (`owner='tenant'`) stay on the property with that
  owner; staff remove them on move-out (documented, not automated).
- **`appliance_id` is optional** — null for all non-appliance service requests
  and for the existing/back-filled ones.
- **`property_equipment` had no rows** (importer never populated it), so the
  rename is non-destructive; verify with a count before `--write`.
- **Ambiguous `추가금액`** → flagged inactive `recurring_charge` for staff review,
  never an active (billing) row, to avoid double-billing items already in rent.

## Files touched

- `packages/db/src/migrations/019_appliance.ts` — new.
- `packages/db/src/types.ts` — `Appliance`, `ServiceRequest.appliance_id`, `DB` map.
- `apps/crm/src/app/api/upload/route.ts` — allow `appliance`.
- `apps/crm/src/components/layout/sidebar-nav.tsx` — 비품 nav item.
- `apps/crm/src/app/(dashboard)/appliances/**` — new section (page, detail,
  tab route, form, actions, loading).
- `apps/crm/src/app/(dashboard)/properties/[id]/_detail.tsx` (+ tab route) — swap
  equipment tab for appliance read list.
- Delete `apps/crm/src/app/(dashboard)/properties/_components/property-equipment.tsx`;
  remove `addEquipment`/`deleteEquipment` from `properties/_actions.ts`.
- `apps/crm/src/app/(dashboard)/services/**` — surface/accept `appliance_id`.
- `packages/db/src/import-platform.ts` — the Part B mapping.

## Verification

- Migration up/down on a scratch DB; `property_equipment` gone, `appliance` +
  `service_request.appliance_id` present; existing services unaffected.
- `/appliances` lists, filters, creates; photo upload renders via auth proxy;
  「수리 요청」 creates a linked `service_request` shown in the appliance's A/S history.
- Property detail shows its appliances (read) with a manage link; no dead
  `property_equipment` imports; typecheck + lint pass.
- Import dry-run report: payment line items are split + labeled (move-in bundle
  visible in 납부내역), `recurring_charge` rows created (active vs 월세 포함),
  `tenant.deros` / `lease.realty_fee` / co-landlords / appliances populated;
  bundle totals preserved exactly. Then `--write` and spot-check 최수리 + 3 others.
