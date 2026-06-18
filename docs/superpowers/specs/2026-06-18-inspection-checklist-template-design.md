# 입주/퇴거 점검 — 편집 가능한 체크리스트 템플릿 + 항목별 사진

**Date:** 2026-06-18
**Status:** Approved design — pending implementation plan
**Supersedes:** `2026-06-17-inspection-photos-design.md` (approved but never
implemented). That design proposed a *per-inspection* photo gallery and listed
per-item photos, signatures, and a full checklist as explicit non-goals. This
design makes all three goals, so it replaces it. The one still-relevant idea
from it — surfacing inspections on the **tenant** page — is carried forward
(§7).

## Background

We perform a walkthrough inspection before a tenant moves in (입주 점검) and
before they move out (퇴거 점검). The infrastructure is half-built and the
checklist is a placeholder:

- **`inspection` table** (migration `010_inspection.ts`): `lease_id`,
  `property_id`, `type` (`move_in` | `move_out`), `inspected_at`,
  `participants` / `checklist` / `signature` / `summary` (JSON text columns),
  `created_by`. `signature` is currently unused.
- **`<Inspections>`** (`leases/[id]/_components/inspections.tsx`): a one-shot
  add dialog with a **flat 6-area** checklist (방/욕실/주방/거실/가전/기타 →
  양호/이상/파손 + 메모), a participants block, a summary, and a
  move-in↔move-out comparison table. Lives on the **lease** detail page.
- **`addInspection` / `deleteInspection`** in `leases/_actions.ts`.
  `addInspection` inserts and immediately flips property status (`occupied` on
  move-in; `move_out` + `moveout_date` on move-out).

The real form (the operator's Excel, `MOVE IN -OUT INSPECTION CHECKLIST.xlsx`)
is far richer — **12 sections** (안방, 방2~4, 화장실1~2, 세탁실, 현관, 창고,
주차장, 키&리모컨, 가전&가구), each split into subgroups (벽/천장, 전기/에어컨,
창문/블라인드, 수납/바닥) totalling ~80 bilingual line items, plus a 중요사항
reminder block, per-item 비고, free-text 특이사항 메모, and tenant/inspector
signature lines (full appendix at the end).

Two enabling facts: `property` already stores `rooms` / `bathrooms` counts (used
to instantiate repeatable room sections), and the Excel's **section 12
(가전 및 가구)** overlaps almost exactly with the per-property **비품(appliance)
registry** (a future auto-population hook, §11 TODO).

## Decisions (locked with operator)

1. **Item result model:** keep the **3-state** 양호/이상/파손 + 비고 + **사진**,
   defaulting to **미점검(na)** until touched. (Strictly richer than the Excel's
   bare checkbox; it powers the move-in↔move-out comparison and deposit
   deductions that already exist.)
2. **Editable, two layers:** a **master template** maintained in **Settings**
   (DB-backed catalog, like `bill_preset`), and **per-inspection snapshot
   edits** — each inspection copies the template at creation and can add / remove
   / rename its own lines without mutating the master or past inspections.
3. **Per-item photos.**
4. **Output (print/PDF): deferred** — tracked as a TODO (§11), not built now.

## Design

### 1. Data model

**New master-template tables** (migration `025_inspection_template.ts`),
editable in Settings, idempotently seeded from the Excel:

`inspection_section`
- `id` serial pk
- `key` varchar not null — stable slug (`master_bedroom`, `bedroom`,
  `bathroom`, `laundry`, `entryway`, `storage`, `parking`, `keys`,
  `appliances`, …)
- `label_ko` varchar not null, `label_en` varchar
- `repeatable` boolean not null default false — `bedroom` / `bathroom`
  instantiate N times from property counts (§4)
- `sort_order` int not null default 0
- `is_builtin` boolean not null default false — marks seeded rows (advisory;
  still editable/deletable), lets re-seed stay idempotent
- `created_at` / `updated_at`

`inspection_item`
- `id` serial pk
- `section_id` int not null references `inspection_section` on delete cascade
- `subgroup_ko` varchar / `subgroup_en` varchar — nullable; visual grouping
  inside a section (벽/천장 등)
- `label_ko` varchar not null, `label_en` varchar
- `sort_order` int not null default 0
- `created_at` / `updated_at`

**`inspection` table changes** (same migration):
- add `status` varchar not null default `'finalized'` — existing rows stay
  `finalized`; new inspections start `'draft'`. The property-status side effect
  fires on **finalize**, not on create (§9).

**Snapshot JSON** stored in the existing `inspection.checklist` column (shape
versioned for forward migration):

```json
{
  "version": 1,
  "sections": [
    {
      "key": "master_bedroom",
      "label_ko": "안방", "label_en": "MASTER BEDROOM",
      "instance": null,
      "items": [
        {
          "id": "stable-id",
          "subgroup_ko": "벽/천장", "subgroup_en": "WALL/CEILING",
          "label_ko": "4면의 모든 벽지", "label_en": "WALL PAPER",
          "status": "na",
          "note": "",
          "photos": [{ "id": 123, "url": "/api/documents/123" }]
        }
      ]
    },
    { "key": "bedroom", "instance": 2, "label_ko": "방", "items": [/* … */] }
  ],
  "notes": "특이사항 메모 (free text)",
  "reminders_ack": false
}
```

- `status`: `na` (미점검, default) | `good` (양호) | `issue` (이상) |
  `damage` (파손).
- `instance`: `null` for singleton sections, `1..n` for repeated 방/화장실.
- `item.id`: a stable per-item id minted at snapshot time so photos and the
  comparison can key off it across edits.

**`inspection.signature`** JSON (column finally used):

```json
{
  "tenant":    { "name": "홍길동", "signed_at": "2026-06-18T01:00:00Z" },
  "inspector": { "name": "직원명", "signed_at": "2026-06-18T01:00:00Z" }
}
```

Typed name + timestamp for now (drawn-signature image is a §11 TODO).

**Backward compatibility:** old inspections hold the flat
`[{area,status,note}]` checklist. The parser tolerates both: a non-`{sections}`
payload renders read-only as a single "기타" section. Real data is placeholder
(the feature was never used in anger), so no data migration is run — accepted.

### 2. Checklist content & seeding

The master tables are seeded in the migration with the full Excel transcription
(appendix). Sections marked `repeatable` (`bedroom`, `bathroom`) carry one
canonical set of items; non-repeatable sections (안방, 세탁실, …) carry theirs.
`is_builtin=true` on all seeded rows. The seed is the single source for both the
Settings editor and new-inspection snapshots.

### 3. Settings: master template editor

A new Settings page (`/settings/inspection-checklist`, mirroring the existing
catalog-settings UI such as payment/utility types) provides CRUD over
`inspection_section` + `inspection_item`:

- Reorderable sections (drag or sort_order); per-section: label_ko/en,
  `repeatable` toggle, delete.
- Within a section: add/edit/remove items with subgroup, label_ko/en, order.
- Server actions in a `settings/_actions.ts` (or a dedicated
  `inspection-checklist/_actions.ts`) guarded by the existing
  `requireUser` / staff-or-admin authz.

Editing the master **does not** touch existing inspections (they hold
snapshots); it only changes the starting point for **new** inspections.

### 4. Inspection editor (draft → finalize)

Per-item photos + editable lines + signatures don't fit a one-shot dialog, so
"점검 추가" creates a **draft** inspection and opens a dedicated editor page
(`tenants/[id]/inspections/[inspectionId]` route, or an equivalent editor
surface). Creating the draft:

1. Insert an `inspection` row (`status='draft'`, chosen `type`, `inspected_at`).
2. Build the snapshot from the master template: include singleton sections once;
   for `repeatable` sections, instantiate `property.rooms`/`bathrooms` copies
   (fallback: 1 each when the count is null). Mint `item.id`s.

The editor renders:
- **Header** (read-only, derived): property address, unit, tenant name,
  inspection date, inspector — matching the Excel's 기본 정보.
- **중요사항** reminder banner + an acknowledge checkbox (`reminders_ack`).
- **Sections** as accordions; each item row = 양호/이상/파손 toggle + 비고 input
  + photo strip (§5). Add/remove item, rename, **add room** (append a
  `bedroom`/`bathroom` instance), remove room.
- **특이사항 메모** free-text.
- **서명**: tenant & inspector name inputs (stamp `signed_at` on entry).
- **Save (draft)** and **완료(finalize)**.

Saving writes the snapshot back to `inspection.checklist` (+ `signature`,
`summary`). The current add dialog and the flat `AREAS` list are removed.

### 5. Per-item photos

Reuse the private-blob document system. Each item's `photos[]` holds
`{id, url}`:

- **Upload:** the existing camera-capable file input (`accept="image/*"
  capture="environment" multiple`) POSTs to `/api/upload` with
  `entity_type=inspection`, `entity_id={inspection.id}`. Two route changes:
  add `"inspection"` to `ALLOWED_ENTITY_TYPES`, and return the inserted
  **document id** alongside the url (`{ id, url }`) so the item can reference it.
  The blob is served through the auth proxy `/api/documents/{id}` as an inline
  `<img>` thumbnail.
- **Item linkage:** push `{id, url:"/api/documents/{id}"}` onto `item.photos`,
  then persist the snapshot. All inspection photos share
  `entity_id = inspection.id`, so the document table also yields a flat
  per-inspection gallery and a clean cleanup key.
- **Delete one photo:** delete the blob + `document` row and splice it out of
  `item.photos`.

### 6. Signatures

Tenant + inspector typed names captured in the editor, stamped with `signed_at`,
saved to `inspection.signature`. Shown on the inspection card / read view.

### 7. Placement: tenant page (carried from the superseded design)

Inspections are a tenant-lifecycle event, so the **list + entry point move to
the tenant detail page**, bound to the tenant's most-recent lease (an inspection
needs `lease_id` + `property_id`):

- Add an "입주/퇴거 점검" tab on `tenants/[id]`. No lease → empty state
  ("계약을 먼저 등록한 뒤 점검을 기록할 수 있습니다.").
- **Remove** the inspection tab + query from `leases/[id]`.
- Move the component to `tenants/[id]/_components/` and the actions to
  `tenants/_actions.ts`.

(If the operator prefers it stay on the lease page, this is the one piece to
flip — flagged at the review gate.)

### 8. Server actions (`tenants/_actions.ts`)

- `createInspectionDraft(leaseId, propertyId, tenantId, type, inspectedAt)` —
  insert draft + build snapshot from template; returns the new id (redirect to
  the editor).
- `saveInspection(id, tenantId, { checklist, signature, summary })` — persist
  snapshot; stays `draft`.
- `finalizeInspection(id, tenantId)` — set `status='finalized'` **and** apply
  the property-status side effect (§9). Idempotent.
- `deleteInspection(id, tenantId)` — best-effort delete all blobs +
  `document` rows for `(entity_type='inspection', entity_id=id)`, then the row;
  revalidate (prevents orphaned blobs).
- `deleteInspectionPhoto(documentId, id, tenantId)` — delete blob + row, splice
  from the snapshot, revalidate.

All guarded by existing `requireUser` / staff-or-admin authz.

### 9. Property-status side effect moves to finalize

Today `addInspection` flips property status on insert. With drafts, that moves
to `finalizeInspection`: `move_in` → `occupied`; `move_out` → `move_out` +
`moveout_date` (derived from `inspected_at`, Seoul day). Revalidate
`/tenants/{id}`, `/properties`, `/properties/{propertyId}`.

### 10. Move-in ↔ move-out comparison (snapshot-aware)

Replace the `AREAS`-keyed compare with a snapshot diff: match items across the
move-in and move-out inspections by `(section.key, instance, item.id-or-label)`
and flag any whose status **worsened** (good→issue/damage, etc.), highlighting
them for deposit-deduction follow-up.

## Migrations

- `025_inspection_template.ts` — create `inspection_section` +
  `inspection_item`, seed from the Excel, add `inspection.status`.

## Files touched (indicative)

- `packages/db/src/migrations/025_inspection_template.ts` — new.
- `packages/db/src/types.ts` — regenerate/extend types.
- `apps/crm/src/app/api/upload/route.ts` — allow `inspection`, return doc id.
- `apps/crm/src/app/(dashboard)/settings/inspection-checklist/…` — template
  editor page + actions.
- `apps/crm/src/app/(dashboard)/tenants/[id]/…` — tab, inspection editor route,
  components.
- `apps/crm/src/app/(dashboard)/tenants/_actions.ts` — inspection actions.
- `apps/crm/src/app/(dashboard)/leases/[id]/_detail.tsx` +
  `leases/_actions.ts` — remove the moved tab/query/actions.
- Delete `leases/[id]/_components/inspections.tsx` (replaced).

## Non-goals / TODO

- **Printable / PDF output** of a completed inspection — deferred (operator
  decision). Likely a print-friendly view first, formal PDF later.
- **Auto-populate 가전 및 가구 from the 비품 registry** — promising integration
  (each registered appliance → a checklist line), but a follow-up; the seeded
  default appliance list ships first.
- **Drawn (canvas) signatures** — typed name + timestamp for now.
- **Past-lease inspections on the tenant page** — bind to the most-recent lease
  only (carried over).

## Edge cases

- **No lease:** empty state, no add button.
- **Old flat-checklist rows:** rendered read-only as a single section; no
  migration.
- **Repeatable count null:** default to 1 bedroom / 1 bathroom; operator adds
  more in-editor.
- **Draft never finalized:** no property-status change; visible as a draft.
- **Delete inspection / photo:** blobs + rows cleaned up (§8); no orphans on the
  normal path. (Lease cascade-delete still orphans inspection blobs — known
  generic-document limitation, out of scope.)
- **Non-image upload:** input hints images; backend MIME allowlist still
  enforces and surfaces errors.

## Verification

- Edit the master template in Settings; confirm it changes new inspections only,
  not existing ones.
- Create a move-in draft on a tenant page; confirm rooms instantiate from
  property counts; add/remove a room and an item.
- Set item statuses + notes, attach photos (desktop + mobile camera); thumbnails
  render via the auth proxy; non-logged-in `/api/documents/{id}` is 401.
- Capture signatures; finalize; confirm property status flips (occupied /
  move_out + date) and revalidates across property views.
- Create the matching move-out; confirm the comparison flags worsened items.
- Delete a photo (row + blob gone) and a whole inspection (no orphans).
- Lease detail no longer shows the inspection tab; no dead imports;
  typecheck/lint pass.

## Appendix — Excel transcription (seed source)

Source: `MOVE IN -OUT INSPECTION CHECKLIST.xlsx`. Sections, subgroups, and items
to seed (verbatim ko + en; verify against the source during implementation):

**기본 정보:** Property Address · Unit Number · Tenant Name · Inspection Date ·
Inspector Name.
**중요사항 (IMPORTANT):** 모든 데미지는 반드시 사진 촬영하기 · 모든 전자제품
작동 테스트하기 · 전체 청소 상태 확인하기 · 블라인드 작동 상태 확인.

1. **안방 (MASTER BEDROOM)**
   - 벽/천장 (WALL/CEILING): 4면의 모든 벽지(WALL PAPER) · 벽면 낙서 여부
     확인(WALL GRAFFITI) · 천장 얼룩 여부 확인(CEILING STAIN) · 천장 도배 상태
     체크(CEILING WALLPAPER) · 거미줄 여부 확인(SPIDER WEBS)
   - 전기/에어컨 (ELECTRICAL/A·C): 스위치 작동(SWITCH OPERATION) · 전등 작동
     확인(LIGHT OPERATION) · 전등 주변 거미줄 여부 확인(LIGHT SPIDER WEB) ·
     콘센트 상태 확인(OUTLET) · 에어컨 작동 여부 확인(A/C OPERATION) · 에어컨
     리모컨 확인 및 작동 여부(A/C REMOTE) · 보일러 리모컨 확인 및 작동 여부
     (BOILER CONTROL)
   - 창문/블라인드 (WINDOW/BLIND): 창문 잘 열리는지 확인(WINDOW CHECK) · 창문틀
     상태 확인(WINDOW FRAME) · 창문 청소 상태 확인(WINDOW CLEANING) · 방충망
     상태 확인(WINDOW SCREEN) · 블라인드 청소 여부 확인(BLIND CLEANING) ·
     블라인드 데미지 여부 확인(BLIND DAMAGE)
   - 수납/바닥 (STORAGE/FLOOR): 빌트인 옷장 문 작동 확인(BUILT-IN CLOSET DOOR) ·
     옷장 경첩 상태 확인(CLOSET HINGE) · 서랍장 작동 확인(DRAWER CHECK) ·
     워킹클로젯 데미지 여부 확인(WALKING CLOSET CHECK) · 워킹클로젯 청소 상태
     확인(WALKING CLOSET CLEANING) · 바닥 타일 상태 체크(FLOOR/TILE) · 바닥 찍힘
     및 손상 여부 확인(FLOOR DAMAGE) · 바닥 오염 여부 확인(FLOOR STAINS)

2. **방 (BEDROOM)** — `repeatable` (방2/방3/방4 instantiate from `property.rooms`).
   Condensed set: 벽/천장 (벽지 상태·벽면 낙서·천장 얼룩·도배·거미줄), 전기/에어컨
   (스위치·전등·콘센트·에어컨), 창문/블라인드 (창문·창문틀·방충망·블라인드 작동),
   수납/바닥 (옷장 문·경첩·서랍장·바닥 상태). (Exact lines per source.)

3. **화장실 (BATHROOM)** — `repeatable` (화장실1/2 from `property.bathrooms`):
   샤워기 작동 확인(SHOWER OPERATION) · 샤워기 부식 상태 확인(SHOWER CORROSION) ·
   변기 작동 확인(TOILET OPERATION) · 변기 뚜껑 상태 확인(TOILET SEAT) · 세면대
   금 여부 확인(SINK CRACK) · 변기 금 여부 확인(TOILET CRACK) · 세면대 배수
   확인(SINK DRAINAGE) · 욕조 청소 상태 확인(BATH CLEANING) · 욕조 배수
   확인(BATH DRAINAGE) · 샤워부스 청소 상태 확인(SHOWER STALL CLEANING) · 타일
   금 여부 확인(TILE CRACK) · 수건장 데미지 여부 확인(TOWEL CABINET) · 배수 상태
   확인(DRAINAGE CHECK) · 천장 팬 작동 여부 확인(CEILING FAN) · 바닥 상태
   확인(FLOOR CHECK) · 청소 상태 확인(CLEANING) · 천장 상태 확인(CEILING CHECK)

4. **세탁실 (LAUNDRY ROOM):** 세탁기 청소 상태 확인(WASHER CLEANING) · 건조기
   청소 상태 확인(DRYER CLEANING) · 보일러 작동 여부 확인(BOILER OPERATION) ·
   보일러 누수 여부 확인(BOILER LEAKS) · 보일러 회사명 기록(BRAND NAME) ·
   보일러 모델명 기록(MODEL NAME)

5. **현관 (ENTRYWAY):** 현관문 앞뒤 데미지 여부(DOOR CHECK) · 도어락 작동
   여부(DOOR LOCK CHECK) · 신발장 데미지 여부(SHOE CABINET)

6. **창고 (STORAGE):** 데미지 여부 확인(DAMAGE)

7. **주차장 (PARKING AREA):** 데미지 여부 확인(DAMAGE) · 비밀번호 확인(PIN
   NUMBER) · 오일 누유 여부 확인(OIL LEAKS CHECK)

8. **키 및 리모컨 (KEYS & REMOTES):** 현관 키 개수 확인(ENTRY DOOR KEY CHECK) ·
   카드키 개수 확인(CARD KEY CHECK) · 주차 리모컨 확인(PARKING REMOTE KEY
   CHECK) · 각 방 에어컨 리모컨 확인(A/C REMOTE CHECK) · 안내 책자 확인(WELCOME
   GUIDE BOOK CHECK)

9. **가전 및 가구 (APPLIANCES & FURNITURE):** 세탁기(WASHER) · 건조기(DRYER) ·
   냉장고(REFRIGERATOR) · 전자레인지(MICROWAVE) · 오븐(OVEN) · 정수기
   (WATER-PURIFIER) · 식탁 및 의자(TABLE/CHAIR) · 쇼파(SOFA) · TV · TV 스탠드 ·
   책상 및 의자(DESK) · 침대 및 협탁(BED) · 스탠드 라이트(STAND LIGHT) · 간이
   테이블(SMALL TABLE) · 옷장(CLOSET) · 서랍장(DRAWER) · 전신거울(FULL-LENGTH
   MIRROR) · 그릇 종류 확인(BOWLS)  *(future: auto-populate from 비품 registry)*

**특이사항 메모 (NOTES):** free text.
**서명 (SIGNATURES):** Tenant Signature · Inspector Signature.
