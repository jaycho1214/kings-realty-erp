# 입주/퇴거 점검 — 사진 첨부 + 세입자 페이지 이전

**Date:** 2026-06-17
**Status:** Approved design — pending implementation plan

## Background

We now perform a walkthrough **inspection** before a tenant moves into a unit
(입주 점검) and before they move out (퇴거 점검). The CRM already has most of
this built but in the wrong place and missing photos:

- `inspection` table (migration `010_inspection.ts`): `lease_id`, `property_id`,
  `type` (`move_in` | `move_out`), `inspected_at`, `participants`/`checklist`/
  `signature`/`summary` (JSON text), `created_by`.
- `<Inspections>` component (`leases/[id]/_components/inspections.tsx`): add
  dialog, per-area checklist (방/욕실/주방/거실/가전/기타 → 양호/이상/파손 + 메모),
  participants, summary, and a move-in↔move-out comparison table.
- `addInspection` / `deleteInspection` actions in `leases/_actions.ts`.
  `addInspection` also flips property status (`occupied` on move-in,
  `move_out` + `moveout_date` on move-out).

Two gaps:

1. **Discoverability.** The feature only lives on the *lease* detail page
   (tenant → open lease → 3rd tab), so it can't be found. Inspections are a
   tenant-lifecycle event in the operator's mental model.
2. **No photos.** The migration always intended photos as `document` rows
   (`entity_type='inspection'`), but nothing was wired up. The upload route
   doesn't even allow the `inspection` entity type.

## Goals

1. Move the inspection feature to the **tenant detail page only** (remove the
   lease-page tab).
2. Add a **per-inspection photo gallery** (one flat photo set per inspection),
   reusing the existing private-blob document system, with mobile camera capture.

## Non-goals (YAGNI)

- Per-checklist-area photo tagging (one gallery per inspection is enough for now).
- Inspection signatures / e-sign (the `signature` column stays unused).
- A printable/PDF inspection report.
- Showing inspections for *past* leases on the tenant page — we bind to the
  tenant's current (most-recent) lease only. Accepted trade-off.

## Design

### 1. Placement: tenant page, single source

Move the inspection UI to the tenant detail page (`tenants/[id]/page.tsx`),
bound to the tenant's **most-recent lease** (first row of the existing
`start_date desc` lease query — the same data the page's `activeLease` derives
from). Rationale: both move-in and move-out act on the current tenancy.

- **Add** an "입주/퇴거 점검" tab on the tenant page.
  - If the tenant has **no lease**, render an empty state ("계약을 먼저 등록한 뒤
    점검을 기록할 수 있습니다.") instead of the add UI — an inspection needs a
    `lease_id` + `property_id`.
- **Remove** the inspection tab block from `leases/[id]/page.tsx` and its
  `inspection` query. (The lease page keeps its other tabs.)
- **Move** the component to `tenants/[id]/_components/inspections.tsx` and the
  actions to `tenants/_actions.ts` (cohesion with its new home). Update imports.

### 2. Photo storage: reuse the document/blob system

No schema change. Photos are `document` rows with
`entity_type='inspection'`, `entity_id = inspection.id`, stored as **private**
Vercel blobs and served through the authenticated proxy `/api/documents/[id]`
(serves images inline → usable directly as `<img>` thumbnails, cookie-gated).

- **`/api/upload/route.ts`:** add `"inspection"` to `ALLOWED_ENTITY_TYPES`.
  No other change — existing 10MB limit and MIME allowlist (jpg/png/webp/pdf/…)
  are fine; a scanned signed checklist as PDF is acceptable too.

### 3. UI: photo gallery inside each inspection card

Extend `<Inspections>` so each rendered `InspectionCard` shows a photo section:

- A **thumbnail grid** of that inspection's photos. Each thumbnail is
  `<img src="/api/documents/{id}">` linking to the same URL (opens full size in
  a new tab).
- An **"사진 추가"** control: a hidden `<input type="file" accept="image/*"
  capture="environment" multiple>` (the `capture` hint opens the camera on
  mobile, which is how field inspections happen). On select, POST each file to
  `/api/upload` with `entity_type=inspection`, `entity_id={inspection.id}`,
  then `router.refresh()`. Show a per-card uploading state and surface any
  upload error inline (mirror `document-list.tsx`).
- A **delete (×)** affordance per thumbnail → `deleteInspectionPhoto`.

Photos attach **after** the inspection exists (the upload needs `entity_id`),
matching the existing document pattern: create the inspection, then add photos
to its card. The add dialog is unchanged.

### 4. Server actions (in `tenants/_actions.ts`)

- `addInspection(leaseId, propertyId, tenantId, formData)` — same logic as today
  (insert + property-status update) but `revalidatePath('/tenants/${tenantId}')`.
- `deleteInspection(id, tenantId)` — **also clean up photos**: select all
  `document` rows for `(entity_type='inspection', entity_id=id)`, `del()` each
  blob (best-effort, log failures like `_actions.ts deleteDocument`), delete the
  rows, then delete the inspection. Revalidate the tenant page. This prevents
  orphaned blobs, which `deleteDocument`'s tenant-id-keyed `pathMap` can't handle
  for inspection docs.
- `deleteInspectionPhoto(documentId, tenantId)` — delete blob + `document` row
  (reusing the same best-effort blob delete), `revalidatePath('/tenants/${tenantId}')`.
  We need this dedicated action because `deleteDocument` revalidates by
  `pathMap[entityType]` keyed on `entityId`, but an inspection photo's
  `entity_id` is the inspection id, not the tenant id.

Auth: actions use the existing `requireUser` / `requirePermission` guards already
applied to inspections and documents.

### 5. Data loading (tenant page)

For the most-recent lease (if any):

1. Load its inspections (current select set + `id`/`property_id`).
2. Load `document` rows where `entity_type='inspection'` and
   `entity_id IN (<those inspection ids>)`, selecting `id, entity_id, file_url,
   file_type, file_name, created_at`. (Empty `IN` → skip the query.)
3. Group documents by `entity_id` and pass `inspections` + their `photos[]` and
   `tenantId`/`leaseId`/`propertyId` to `<Inspections>`.

## Edge cases

- **No lease:** empty state; no add button.
- **Multiple leases (renewal):** only the most-recent lease's inspections show
  (documented non-goal).
- **Deleting an inspection** removes its photos + blobs (§4).
- **Non-image upload** to the inspection input: input is `accept="image/*"`, but
  the backend still validates MIME; a rejected file surfaces the route's error.
- **Large/slow uploads:** per-card uploading state; 10MB cap enforced server-side.
- **Deleting a lease** cascade-deletes its `inspection` rows (FK
  `ON DELETE CASCADE`), but `document` rows/blobs are generic and won't cascade,
  so inspection photo blobs orphan in that path. Known limitation — out of scope
  here; `deleteInspection` (the normal path) does clean them up. Revisit if blob
  storage cost matters.

## Files touched

- `apps/crm/src/app/api/upload/route.ts` — allow `inspection`.
- `apps/crm/src/app/(dashboard)/tenants/[id]/page.tsx` — load + render tab.
- `apps/crm/src/app/(dashboard)/tenants/_components/inspections.tsx` — moved +
  photo gallery.
- `apps/crm/src/app/(dashboard)/tenants/_actions.ts` — moved/added actions.
- `apps/crm/src/app/(dashboard)/leases/[id]/page.tsx` — remove tab + query.
- `apps/crm/src/app/(dashboard)/leases/_actions.ts` — remove moved actions.
- Delete `apps/crm/src/app/(dashboard)/leases/[id]/_components/inspections.tsx`.

## Verification

- Create move-in + move-out inspections from a tenant page; confirm property
  status flips and the comparison table renders.
- Upload photos (desktop + mobile camera) to each; thumbnails render via the
  auth proxy; non-logged-in fetch of `/api/documents/{id}` is 401.
- Delete a photo (row + blob gone) and delete a whole inspection (photos + blobs
  gone, no orphans).
- Lease detail page no longer shows the inspection tab; no dead imports; typecheck/lint pass.
