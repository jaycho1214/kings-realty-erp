# 입주/퇴거 점검 체크리스트 템플릿 + 항목별 사진 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder 6-area inspection checklist with the operator's
full Humphreys move-in/move-out form: a DB-backed, Settings-editable master
template, snapshotted per inspection, with tri-state items + 비고 + per-item and
per-inspection photos + typed signatures, all on the tenant page.

**Architecture:** A master template lives in two new tables
(`inspection_section`, `inspection_item`), edited in Settings like the existing
`utility_type`/`bill_preset` catalogs. Creating an inspection copies the template
into the existing `inspection.checklist` JSON column as a versioned *snapshot*, so
per-inspection edits/statuses/photos never mutate the master or past records. Pure
snapshot/parse/compare logic lives in `apps/crm/src/lib/inspection/` and is unit
tested with `node:test`; the editor is a dedicated draft→finalize route on the
tenant page. Photos reuse the private-blob `document` system keyed on
`entity_id = inspection.id`.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, Kysely
(Postgres), `@vercel/blob`, shadcn/base-ui components, `node:test` + `tsx`.

## Global Constraints

- Migrations are plain Kysely up/down in `packages/db/src/migrations/NNN_*.ts`;
  the next number is **025**. Apply with `pnpm db:migrate`; regenerate
  `packages/db/src/types.ts` with `pnpm db:generate` (reads the live DB — needs
  `.env`). Never hand-edit `types.ts`.
- Server actions: `"use server"` files; guard with `requireUser()` (staff or
  admin) for inspection mutations and `requireAdmin()` for Settings/template
  mutations (from `@/lib/authz`); use `getDb()` from `@kingsrealty/db`; call
  `revalidatePath(...)` after writes.
- UI copy is Korean. Money is mono/tabular. Use `text-danger`/`text-warning`/
  `text-success` tones. Reuse `@/components/ui/*`, `DataPanel`, `EmptyState`,
  `PageHeader`, `SubmitButton`.
- Tests run via `apps/crm` `test` script (Node test runner over explicit files).
  New `src/lib/**/*.test.ts` files MUST be added to that script's file list.
- Unit tests cover **pure** logic only (this codebase has no component/action
  tests). UI/actions are verified by `pnpm --filter crm lint` + `pnpm build` +
  manual steps.
- Item status enum: `na` (미점검, default) | `good` (양호) | `issue` (이상) |
  `damage` (파손).
- Photo blobs are private; render via the auth proxy `/api/documents/{id}` as
  `<img src>`; never use raw blob URLs in markup.
- Per the repo's parallel-main workflow, `git add` only the files you created or
  edited for the task — never `git add -A`.

**Source of truth for the seed:** `docs/superpowers/specs/2026-06-18-inspection-checklist-template-design.md`
(appendix) and the operator Excel `MOVE IN -OUT INSPECTION CHECKLIST.xlsx`.

---

## Current state (read before starting)

- `inspection` table (migration `010`): `lease_id`, `property_id`, `type`
  (`move_in`|`move_out`), `inspected_at`, `participants`/`checklist`/`signature`/
  `summary` (JSON text), `created_by`. `signature` unused.
- `<Inspections>` placeholder lives at
  `apps/crm/src/app/(dashboard)/leases/[id]/_components/inspections.tsx`
  (flat 6-area `AREAS`, status `good|issue|damage`, add dialog, compare table).
- It is imported by **both** the lease detail
  (`leases/[id]/_detail.tsx:21`, tab at ~428) **and** the tenant detail
  (`tenants/[id]/_detail.tsx:48`, tab at ~764). Actions `addInspection` /
  `deleteInspection` are in `leases/_actions.ts` (~597-664) and flip property
  status on insert.
- Tenant detail loads inspections at `tenants/[id]/_detail.tsx:365-383`.
- Upload route `apps/crm/src/app/api/upload/route.ts` allowlist has no
  `inspection`; returns `{ url }` only.
- Settings nav is `settingsNav` in
  `apps/crm/src/app/(dashboard)/settings/layout.tsx`; catalog editors follow
  `settings/_components/utility-types.tsx` + actions in `settings/_actions.ts`
  (`requireAdmin`).

---

## File structure (created / modified)

**Created**
- `packages/db/src/migrations/025_inspection_template.ts` — tables + `inspection.status` + seed.
- `apps/crm/src/lib/inspection/types.ts` — snapshot/template TS types + status enum.
- `apps/crm/src/lib/inspection/snapshot.ts` — `buildInspectionSnapshot`.
- `apps/crm/src/lib/inspection/snapshot.test.ts`
- `apps/crm/src/lib/inspection/parse.ts` — `parseSnapshot` (new + legacy).
- `apps/crm/src/lib/inspection/parse.test.ts`
- `apps/crm/src/lib/inspection/compare.ts` — `compareInspections`.
- `apps/crm/src/lib/inspection/compare.test.ts`
- `apps/crm/src/lib/inspection/reminders.ts` — 중요사항 banner constants.
- `apps/crm/src/app/(dashboard)/settings/inspection-checklist/page.tsx`
- `apps/crm/src/app/(dashboard)/settings/inspection-checklist/_actions.ts`
- `apps/crm/src/app/(dashboard)/settings/inspection-checklist/_components/template-editor.tsx`
- `apps/crm/src/app/(dashboard)/tenants/[id]/inspections/[inspectionId]/page.tsx` — editor route.
- `apps/crm/src/app/(dashboard)/tenants/[id]/inspections/[inspectionId]/_editor.tsx` — editor client.
- `apps/crm/src/app/(dashboard)/tenants/_components/inspections.tsx` — list tab (new home).
- `apps/crm/src/app/(dashboard)/tenants/_components/inspection-photos.tsx` — photo strip/gallery client.

**Modified**
- `packages/db/src/types.ts` — regenerated.
- `apps/crm/src/app/api/upload/route.ts` — allow `inspection`, return `{ id, url }`.
- `apps/crm/src/app/(dashboard)/settings/layout.tsx` — nav entry.
- `apps/crm/src/app/(dashboard)/tenants/_actions.ts` — inspection actions.
- `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx` — load template/photos, new list tab, build editor data.
- `apps/crm/src/app/(dashboard)/leases/[id]/_detail.tsx` — remove inspection tab + query + import.
- `apps/crm/src/app/(dashboard)/leases/_actions.ts` — remove `addInspection`/`deleteInspection`.
- `apps/crm/package.json` — add new test files to `test` script.

**Deleted**
- `apps/crm/src/app/(dashboard)/leases/[id]/_components/inspections.tsx`.

---

## Task 1: Migration — template tables, `inspection.status`, seed

**Files:**
- Create: `packages/db/src/migrations/025_inspection_template.ts`
- Modify: `packages/db/src/types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces tables `inspection_section(id, key, label_ko, label_en, repeatable,
  sort_order, is_builtin, created_at, updated_at)` and
  `inspection_item(id, section_id→inspection_section ON DELETE CASCADE,
  subgroup_ko, subgroup_en, label_ko, label_en, sort_order, created_at,
  updated_at)`, plus column `inspection.status varchar NOT NULL DEFAULT
  'finalized'`. Seeds the Humphreys template (`is_builtin=true`).

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/025_inspection_template.ts`. Mirror the style
of `024_payment_type_catalog.ts` (`sql` import, `up`/`down`). Seed rows are
defined as a local array and inserted in order so `sort_order` is the array
index.

```ts
import { sql, type Kysely } from "kysely";

/**
 * 입주/퇴거 점검(inspection) 마스터 템플릿. 섹션(방/화장실/…) → 항목(체크 라인)을
 * 편집 가능한 카탈로그로 만든다(설정에서 관리). 점검 생성 시 이 템플릿을
 * inspection.checklist JSON 으로 "스냅샷" 복사하므로, 템플릿 수정은 과거 점검에
 * 영향을 주지 않는다. repeatable 섹션(방/화장실)은 매물의 rooms/bathrooms 로 N개
 * 인스턴스를 만든다. inspection.status(draft|finalized) 추가: 속성 상태 전환은
 * 완료(finalize) 시점에 일어난다.
 */

interface SeedItem {
  subgroup_ko: string | null;
  subgroup_en: string | null;
  label_ko: string;
  label_en: string | null;
}
interface SeedSection {
  key: string;
  label_ko: string;
  label_en: string | null;
  repeatable: boolean;
  items: SeedItem[];
}

const WALL = { ko: "벽/천장", en: "WALL/CEILING" };
const ELEC = { ko: "전기/에어컨", en: "ELECTRICAL/A·C" };
const WIN = { ko: "창문/블라인드", en: "WINDOW/BLIND" };
const STOR = { ko: "수납/바닥", en: "STORAGE/FLOOR" };
const sg = (g: { ko: string; en: string }, ko: string, en: string): SeedItem => ({
  subgroup_ko: g.ko,
  subgroup_en: g.en,
  label_ko: ko,
  label_en: en,
});
const plain = (ko: string, en: string | null): SeedItem => ({
  subgroup_ko: null,
  subgroup_en: null,
  label_ko: ko,
  label_en: en,
});

const SECTIONS: SeedSection[] = [
  {
    key: "master_bedroom",
    label_ko: "안방",
    label_en: "MASTER BEDROOM",
    repeatable: false,
    items: [
      sg(WALL, "4면의 모든 벽지", "WALL PAPER"),
      sg(WALL, "벽면 낙서 여부 확인", "WALL GRAFFITI"),
      sg(WALL, "천장 얼룩 여부 확인", "CEILING STAIN"),
      sg(WALL, "천장 도배 상태 체크", "CEILING WALLPAPER"),
      sg(WALL, "거미줄 여부 확인", "SPIDER WEBS"),
      sg(ELEC, "스위치 작동", "SWITCH OPERATION"),
      sg(ELEC, "전등 작동 확인", "LIGHT OPERATION"),
      sg(ELEC, "전등 주변 거미줄 여부 확인", "LIGHT SPIDER WEB"),
      sg(ELEC, "콘센트 상태 확인", "OUTLET"),
      sg(ELEC, "에어컨 작동 여부 확인", "A/C OPERATION"),
      sg(ELEC, "에어컨 리모컨 확인 및 작동 여부", "A/C REMOTE"),
      sg(ELEC, "보일러 리모컨 확인 및 작동 여부", "BOILER CONTROL"),
      sg(WIN, "창문 잘 열리는지 확인", "WINDOW CHECK"),
      sg(WIN, "창문틀 상태 확인", "WINDOW FRAME"),
      sg(WIN, "창문 청소 상태 확인", "WINDOW CLEANING"),
      sg(WIN, "방충망 상태 확인", "WINDOW SCREEN"),
      sg(WIN, "블라인드 청소 여부 확인", "BLIND CLEANING"),
      sg(WIN, "블라인드 데미지 여부 확인", "BLIND DAMAGE"),
      sg(STOR, "빌트인 옷장 문 작동 확인", "BUILT-IN CLOSET DOOR"),
      sg(STOR, "옷장 경첩 상태 확인", "CLOSET HINGE"),
      sg(STOR, "서랍장 작동 확인", "DRAWER CHECK"),
      sg(STOR, "워킹클로젯 데미지 여부 확인", "WALKING CLOSET CHECK"),
      sg(STOR, "워킹클로젯 청소 상태 확인", "WALKING CLOSET CLEANING"),
      sg(STOR, "바닥 타일 상태 체크", "FLOOR/TILE"),
      sg(STOR, "바닥 찍힘 및 손상 여부 확인", "FLOOR DAMAGE"),
      sg(STOR, "바닥 오염 여부 확인", "FLOOR STAINS"),
    ],
  },
  {
    key: "bedroom",
    label_ko: "방",
    label_en: "BEDROOM",
    repeatable: true,
    items: [
      sg(WALL, "4면 벽지 상태 확인", "WALL PAPER CONDITION"),
      sg(WALL, "벽면 낙서 여부 확인", "WALL GRAFFITI"),
      sg(WALL, "천장 얼룩 여부 확인", "CEILING STAIN"),
      sg(WALL, "천장 도배 상태 체크", "CEILING WALLPAPER"),
      sg(WALL, "거미줄 여부 확인", "SPIDER WEBS"),
      sg(ELEC, "스위치 작동 확인", "SWITCH"),
      sg(ELEC, "전등 작동 확인", "LIGHT OPERATION"),
      sg(ELEC, "콘센트 상태 확인", "OUTLET"),
      sg(ELEC, "에어컨 작동 여부 확인", "A/C OPERATION"),
      sg(WIN, "창문 잘 열리는지 확인", "WINDOW CHECK"),
      sg(WIN, "창문틀 상태 확인", "WINDOW FRAME"),
      sg(WIN, "방충망 상태 확인", "SCREEN CONDITION"),
      sg(WIN, "블라인드 작동 상태 확인", "BLIND OPERATION"),
      sg(STOR, "옷장 문 작동 확인", "BUILT-IN CLOSET DOOR"),
      sg(STOR, "경첩 상태 확인", "CLOSET HINGE"),
      sg(STOR, "서랍장 작동 확인", "DRAWER CHECK"),
      sg(STOR, "바닥 상태 확인", "FLOOR CHECK"),
    ],
  },
  {
    key: "bathroom",
    label_ko: "화장실",
    label_en: "BATHROOM",
    repeatable: true,
    items: [
      plain("샤워기 작동 확인", "SHOWER OPERATION"),
      plain("샤워기 부식 상태 확인", "SHOWER CORROSION CHECK"),
      plain("변기 작동 확인", "TOILET OPERATION"),
      plain("변기 뚜껑 상태 확인", "TOILET SEAT"),
      plain("세면대 금 여부 확인", "SINK CRACK"),
      plain("변기 금 여부 확인", "TOILET CRACK"),
      plain("세면대 배수 확인", "SINK DRAINAGE"),
      plain("욕조 청소 상태 확인", "BATH CLEANING"),
      plain("욕조 배수 확인", "BATH DRAINAGE"),
      plain("샤워부스 청소 상태 확인", "SHOWER STALL CLEANING"),
      plain("타일 금 여부 확인", "TILE CRACK"),
      plain("수건장 데미지 여부 확인", "TOWEL CABINET"),
      plain("배수 상태 확인", "DRAINAGE CHECK"),
      plain("천장 팬 작동 여부 확인", "CEILING FAN"),
      plain("바닥 상태 확인", "FLOOR CHECK"),
      plain("청소 상태 확인", "CLEANING"),
      plain("천장 상태 확인", "CEILING CHECK"),
    ],
  },
  {
    key: "laundry",
    label_ko: "세탁실",
    label_en: "LAUNDRY ROOM",
    repeatable: false,
    items: [
      plain("세탁기 청소 상태 확인", "WASHER CLEANING"),
      plain("건조기 청소 상태 확인", "DRYER CLEANING"),
      plain("보일러 작동 여부 확인", "BOILER OPERATION"),
      plain("보일러 누수 여부 확인", "BOILER LEAKS"),
      plain("보일러 회사명 기록", "BRAND NAME"),
      plain("보일러 모델명 기록", "MODEL NAME"),
    ],
  },
  {
    key: "entryway",
    label_ko: "현관",
    label_en: "ENTRYWAY",
    repeatable: false,
    items: [
      plain("현관문 앞뒤 데미지 여부", "DOOR CHECK"),
      plain("도어락 작동 여부", "DOOR LOCK CHECK"),
      plain("신발장 데미지 여부", "SHOE CABINET"),
    ],
  },
  {
    key: "storage",
    label_ko: "창고",
    label_en: "STORAGE",
    repeatable: false,
    items: [plain("데미지 여부 확인", "DAMAGE")],
  },
  {
    key: "parking",
    label_ko: "주차장",
    label_en: "PARKING AREA",
    repeatable: false,
    items: [
      plain("데미지 여부 확인", "DAMAGE"),
      plain("비밀번호 확인", "PIN NUMBER"),
      plain("오일 누유 여부 확인", "OIL LEAKS CHECK"),
    ],
  },
  {
    key: "keys",
    label_ko: "키 및 리모컨",
    label_en: "KEYS & REMOTES",
    repeatable: false,
    items: [
      plain("현관 키 개수 확인", "ENTRY DOOR KEY CHECK"),
      plain("카드키 개수 확인", "CARD KEY CHECK"),
      plain("주차 리모컨 확인", "PARKING REMOTE KEY CHECK"),
      plain("각 방 에어컨 리모컨 확인", "A/C REMOTE CHECK"),
      plain("안내 책자 확인", "WELCOME GUIDE BOOK CHECK"),
    ],
  },
  {
    key: "appliances",
    label_ko: "가전 및 가구",
    label_en: "APPLIANCES & FURNITURE",
    repeatable: false,
    items: [
      plain("세탁기", "WASHER"),
      plain("건조기", "DRYER"),
      plain("냉장고", "REFRIGERATOR"),
      plain("전자레인지", "MICROWAVE"),
      plain("오븐", "OVEN"),
      plain("정수기", "WATER-PURIFIER"),
      plain("식탁 및 의자", "TABLE/CHAIR"),
      plain("쇼파", "SOFA"),
      plain("TV", "TV"),
      plain("TV 스탠드", "TV STAND"),
      plain("책상 및 의자", "DESK"),
      plain("침대 및 협탁", "BED"),
      plain("스탠드 라이트", "STAND LIGHT"),
      plain("간이 테이블", "SMALL TABLE"),
      plain("옷장", "CLOSET"),
      plain("서랍장", "DRAWER"),
      plain("전신거울", "FULL-LENGTH MIRROR"),
      plain("그릇 종류 확인", "BOWLS"),
    ],
  },
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("inspection_section")
    .addColumn("id", "serial", (c) => c.primaryKey())
    .addColumn("key", "varchar", (c) => c.notNull())
    .addColumn("label_ko", "varchar", (c) => c.notNull())
    .addColumn("label_en", "varchar")
    .addColumn("repeatable", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("is_builtin", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("inspection_item")
    .addColumn("id", "serial", (c) => c.primaryKey())
    .addColumn("section_id", "integer", (c) =>
      c.notNull().references("inspection_section.id").onDelete("cascade"),
    )
    .addColumn("subgroup_ko", "varchar")
    .addColumn("subgroup_en", "varchar")
    .addColumn("label_ko", "varchar", (c) => c.notNull())
    .addColumn("label_en", "varchar")
    .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_inspection_item_section")
    .on("inspection_item")
    .column("section_id")
    .execute();

  await db.schema
    .alterTable("inspection")
    .addColumn("status", "varchar", (c) => c.notNull().defaultTo("finalized"))
    .execute();

  // Seed the Humphreys template (idempotent: skip if any builtin section exists).
  const existing = await db
    .selectFrom("inspection_section" as never)
    .select(sql<number>`count(*)`.as("n"))
    .where("is_builtin" as never, "=", true as never)
    .executeTakeFirst();
  if (existing && Number((existing as { n: number }).n) > 0) return;

  for (let s = 0; s < SECTIONS.length; s++) {
    const sec = SECTIONS[s];
    const inserted = await db
      .insertInto("inspection_section" as never)
      .values({
        key: sec.key,
        label_ko: sec.label_ko,
        label_en: sec.label_en,
        repeatable: sec.repeatable,
        sort_order: s,
        is_builtin: true,
      } as never)
      .returning("id" as never)
      .executeTakeFirstOrThrow();
    const sectionId = (inserted as { id: number }).id;
    if (sec.items.length === 0) continue;
    await db
      .insertInto("inspection_item" as never)
      .values(
        sec.items.map((it, i) => ({
          section_id: sectionId,
          subgroup_ko: it.subgroup_ko,
          subgroup_en: it.subgroup_en,
          label_ko: it.label_ko,
          label_en: it.label_en,
          sort_order: i,
        })) as never,
      )
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("inspection").dropColumn("status").execute();
  await db.schema.dropTable("inspection_item").ifExists().execute();
  await db.schema.dropTable("inspection_section").ifExists().execute();
}
```

- [ ] **Step 2: Apply the migration**

Run: `pnpm db:migrate`
Expected: completes without error; prints the `025_inspection_template`
migration as applied.

- [ ] **Step 3: Verify seed + regenerate types**

Run: `pnpm db:generate`
Expected: `packages/db/src/types.ts` now contains `InspectionSection`,
`InspectionItem`, the `inspection_section`/`inspection_item` entries in the `DB`
interface, and `status` on `Inspection`. (If `pnpm db:generate` cannot reach the
DB in this environment, note it and regenerate where the DB is reachable; do not
hand-edit `types.ts`.)

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/025_inspection_template.ts packages/db/src/types.ts
git commit -m "feat(db): inspection checklist template tables + status, seeded from Humphreys form"
```

---

## Task 2: Pure types + snapshot builder (`lib/inspection`)

**Files:**
- Create: `apps/crm/src/lib/inspection/types.ts`
- Create: `apps/crm/src/lib/inspection/snapshot.ts`
- Create: `apps/crm/src/lib/inspection/snapshot.test.ts`
- Modify: `apps/crm/package.json` (test script)

**Interfaces:**
- Produces type `ItemStatus = "na"|"good"|"issue"|"damage"`, interfaces
  `SnapshotItem`, `SnapshotSection`, `InspectionSnapshot`, `TemplateSection`,
  `TemplateItem`, and
  `buildInspectionSnapshot(sections: TemplateSection[], items: TemplateItem[],
  counts: { rooms: number | null; bathrooms: number | null }): InspectionSnapshot`.
  Item ids are deterministic: `` `${section.key}:${instance ?? 0}:${templateItem.id}` ``.

- [ ] **Step 1: Write the types**

Create `apps/crm/src/lib/inspection/types.ts`:

```ts
export type ItemStatus = "na" | "good" | "issue" | "damage";

export interface PhotoRef {
  id: number;
  url: string; // always "/api/documents/{id}"
}

export interface SnapshotItem {
  id: string;
  subgroup_ko: string | null;
  subgroup_en: string | null;
  label_ko: string;
  label_en: string | null;
  status: ItemStatus;
  note: string;
  photos: PhotoRef[];
}

export interface SnapshotSection {
  key: string;
  label_ko: string;
  label_en: string | null;
  instance: number | null; // null = singleton; 1..n = repeated room
  items: SnapshotItem[];
}

export interface InspectionSnapshot {
  version: 1;
  sections: SnapshotSection[];
  notes: string;
  reminders_ack: boolean;
}

export interface TemplateSection {
  id: number;
  key: string;
  label_ko: string;
  label_en: string | null;
  repeatable: boolean;
  sort_order: number;
}

export interface TemplateItem {
  id: number;
  section_id: number;
  subgroup_ko: string | null;
  subgroup_en: string | null;
  label_ko: string;
  label_en: string | null;
  sort_order: number;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/crm/src/lib/inspection/snapshot.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInspectionSnapshot } from "./snapshot";
import type { TemplateSection, TemplateItem } from "./types";

const sections: TemplateSection[] = [
  { id: 1, key: "master_bedroom", label_ko: "안방", label_en: "MASTER", repeatable: false, sort_order: 0 },
  { id: 2, key: "bedroom", label_ko: "방", label_en: "BEDROOM", repeatable: true, sort_order: 1 },
  { id: 3, key: "bathroom", label_ko: "화장실", label_en: "BATH", repeatable: true, sort_order: 2 },
];
const items: TemplateItem[] = [
  { id: 10, section_id: 1, subgroup_ko: "벽/천장", subgroup_en: "W", label_ko: "벽지", label_en: "WALL", sort_order: 0 },
  { id: 11, section_id: 2, subgroup_ko: null, subgroup_en: null, label_ko: "스위치", label_en: "SWITCH", sort_order: 0 },
  { id: 12, section_id: 3, subgroup_ko: null, subgroup_en: null, label_ko: "변기", label_en: "TOILET", sort_order: 0 },
];

test("singleton section appears once with instance null and na items", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: null, bathrooms: null });
  const master = snap.sections.filter((s) => s.key === "master_bedroom");
  assert.equal(master.length, 1);
  assert.equal(master[0].instance, null);
  assert.equal(master[0].items[0].status, "na");
  assert.equal(master[0].items[0].id, "master_bedroom:0:10");
});

test("bedroom count = rooms - 1 (master covers one); bathroom count = bathrooms", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: 4, bathrooms: 2 });
  assert.equal(snap.sections.filter((s) => s.key === "bedroom").length, 3);
  assert.equal(snap.sections.filter((s) => s.key === "bathroom").length, 2);
  const beds = snap.sections.filter((s) => s.key === "bedroom").map((s) => s.instance);
  assert.deepEqual(beds, [1, 2, 3]);
});

test("null counts default to 1 bedroom and 1 bathroom", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: null, bathrooms: null });
  assert.equal(snap.sections.filter((s) => s.key === "bedroom").length, 1);
  assert.equal(snap.sections.filter((s) => s.key === "bathroom").length, 1);
});

test("rooms = 1 yields zero extra bedrooms", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: 1, bathrooms: 1 });
  assert.equal(snap.sections.filter((s) => s.key === "bedroom").length, 0);
});

test("snapshot is version 1 with empty notes and reminders unacked", () => {
  const snap = buildInspectionSnapshot(sections, items, { rooms: 2, bathrooms: 1 });
  assert.equal(snap.version, 1);
  assert.equal(snap.notes, "");
  assert.equal(snap.reminders_ack, false);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --import tsx --test apps/crm/src/lib/inspection/snapshot.test.ts`
Expected: FAIL — cannot find module `./snapshot` / `buildInspectionSnapshot is not a function`.

- [ ] **Step 4: Write the implementation**

Create `apps/crm/src/lib/inspection/snapshot.ts`:

```ts
import type {
  InspectionSnapshot,
  SnapshotSection,
  TemplateItem,
  TemplateSection,
} from "./types";

function instanceCount(
  key: string,
  counts: { rooms: number | null; bathrooms: number | null },
): number {
  if (key === "bedroom") {
    // 안방(master) covers the first bedroom; the rest are repeated "방".
    return counts.rooms != null ? Math.max(counts.rooms - 1, 0) : 1;
  }
  if (key === "bathroom") {
    return counts.bathrooms != null ? Math.max(counts.bathrooms, 1) : 1;
  }
  return 1;
}

export function buildInspectionSnapshot(
  sections: TemplateSection[],
  items: TemplateItem[],
  counts: { rooms: number | null; bathrooms: number | null },
): InspectionSnapshot {
  const bySection = new Map<number, TemplateItem[]>();
  for (const it of items) {
    const arr = bySection.get(it.section_id) ?? [];
    arr.push(it);
    bySection.set(it.section_id, arr);
  }

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const out: SnapshotSection[] = [];

  for (const sec of ordered) {
    const secItems = (bySection.get(sec.id) ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    const n = sec.repeatable ? instanceCount(sec.key, counts) : 1;
    for (let i = 0; i < n; i++) {
      const instance = sec.repeatable ? i + 1 : null;
      out.push({
        key: sec.key,
        label_ko: sec.label_ko,
        label_en: sec.label_en,
        instance,
        items: secItems.map((it) => ({
          id: `${sec.key}:${instance ?? 0}:${it.id}`,
          subgroup_ko: it.subgroup_ko,
          subgroup_en: it.subgroup_en,
          label_ko: it.label_ko,
          label_en: it.label_en,
          status: "na" as const,
          note: "",
          photos: [],
        })),
      });
    }
  }

  return { version: 1, sections: out, notes: "", reminders_ack: false };
}
```

- [ ] **Step 5: Add the test file to the crm test script**

Modify `apps/crm/package.json` `"test"` script: append the new file to the
space-separated file list passed to `node --import tsx --test`. After edit it
reads (one line):

```json
"test": "node --import tsx --test src/lib/date.test.ts src/lib/tasks/board.test.ts src/lib/tasks/suggestions.test.ts src/lib/lease-intake.test.ts src/lib/charge-types.test.ts src/lib/inspection/snapshot.test.ts"
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --import tsx --test apps/crm/src/lib/inspection/snapshot.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/crm/src/lib/inspection/types.ts apps/crm/src/lib/inspection/snapshot.ts apps/crm/src/lib/inspection/snapshot.test.ts apps/crm/package.json
git commit -m "feat(inspection): snapshot types + builder with tests"
```

---

## Task 3: Snapshot parser + comparison (`lib/inspection`)

**Files:**
- Create: `apps/crm/src/lib/inspection/parse.ts`
- Create: `apps/crm/src/lib/inspection/parse.test.ts`
- Create: `apps/crm/src/lib/inspection/compare.ts`
- Create: `apps/crm/src/lib/inspection/compare.test.ts`
- Modify: `apps/crm/package.json` (test script)

**Interfaces:**
- Consumes types from `./types`.
- Produces `parseSnapshot(json: string | null): InspectionSnapshot` (tolerant of
  the legacy flat `[{area,status,note}]` shape → wraps into a single read-only
  "기타" section) and
  `compareInspections(moveIn: InspectionSnapshot, moveOut: InspectionSnapshot):
  ComparisonRow[]` where
  `ComparisonRow = { key: string; instance: number | null; label_ko: string;
  from: ItemStatus; to: ItemStatus; worsened: boolean }`.
- Status severity order for "worsened": `na < good < issue < damage`.

- [ ] **Step 1: Write the failing parser test**

Create `apps/crm/src/lib/inspection/parse.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSnapshot } from "./parse";

test("null returns an empty v1 snapshot", () => {
  const snap = parseSnapshot(null);
  assert.equal(snap.version, 1);
  assert.deepEqual(snap.sections, []);
  assert.equal(snap.notes, "");
});

test("new-shape JSON round-trips", () => {
  const input = JSON.stringify({
    version: 1,
    sections: [
      { key: "storage", label_ko: "창고", label_en: "STORAGE", instance: null,
        items: [{ id: "storage:0:1", subgroup_ko: null, subgroup_en: null,
          label_ko: "데미지", label_en: "DAMAGE", status: "issue", note: "긁힘", photos: [] }] },
    ],
    notes: "메모",
    reminders_ack: true,
  });
  const snap = parseSnapshot(input);
  assert.equal(snap.sections.length, 1);
  assert.equal(snap.sections[0].items[0].status, "issue");
  assert.equal(snap.notes, "메모");
  assert.equal(snap.reminders_ack, true);
});

test("legacy flat array becomes a single 기타 section", () => {
  const legacy = JSON.stringify([
    { area: "방", status: "good", note: "" },
    { area: "욕실", status: "damage", note: "타일 깨짐" },
  ]);
  const snap = parseSnapshot(legacy);
  assert.equal(snap.sections.length, 1);
  assert.equal(snap.sections[0].key, "legacy");
  assert.equal(snap.sections[0].label_ko, "기타");
  assert.equal(snap.sections[0].items.length, 2);
  assert.equal(snap.sections[0].items[1].status, "damage");
  assert.equal(snap.sections[0].items[1].label_ko, "욕실");
});

test("malformed JSON returns an empty snapshot", () => {
  const snap = parseSnapshot("not json{");
  assert.deepEqual(snap.sections, []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test apps/crm/src/lib/inspection/parse.test.ts`
Expected: FAIL — cannot find module `./parse`.

- [ ] **Step 3: Write the parser**

Create `apps/crm/src/lib/inspection/parse.ts`:

```ts
import type {
  InspectionSnapshot,
  ItemStatus,
  SnapshotItem,
} from "./types";

const STATUSES: ItemStatus[] = ["na", "good", "issue", "damage"];

function emptySnapshot(): InspectionSnapshot {
  return { version: 1, sections: [], notes: "", reminders_ack: false };
}

function coerceStatus(v: unknown): ItemStatus {
  return STATUSES.includes(v as ItemStatus) ? (v as ItemStatus) : "na";
}

export function parseSnapshot(json: string | null): InspectionSnapshot {
  if (!json) return emptySnapshot();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return emptySnapshot();
  }

  // Legacy flat array: [{ area, status, note }]
  if (Array.isArray(parsed)) {
    const items: SnapshotItem[] = parsed.map((raw, i) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {
        id: `legacy:0:${i}`,
        subgroup_ko: null,
        subgroup_en: null,
        label_ko: String(r.area ?? "항목"),
        label_en: null,
        status: coerceStatus(r.status),
        note: String(r.note ?? ""),
        photos: [],
      };
    });
    return {
      version: 1,
      sections: [
        { key: "legacy", label_ko: "기타", label_en: null, instance: null, items },
      ],
      notes: "",
      reminders_ack: false,
    };
  }

  if (parsed && typeof parsed === "object" && "sections" in parsed) {
    const obj = parsed as Partial<InspectionSnapshot>;
    return {
      version: 1,
      sections: Array.isArray(obj.sections) ? obj.sections : [],
      notes: typeof obj.notes === "string" ? obj.notes : "",
      reminders_ack: Boolean(obj.reminders_ack),
    };
  }

  return emptySnapshot();
}
```

- [ ] **Step 4: Run to verify the parser passes**

Run: `node --import tsx --test apps/crm/src/lib/inspection/parse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing compare test**

Create `apps/crm/src/lib/inspection/compare.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareInspections } from "./compare";
import type { InspectionSnapshot } from "./types";

function snap(status1: string, status2: string): InspectionSnapshot {
  return {
    version: 1,
    notes: "",
    reminders_ack: false,
    sections: [
      { key: "bedroom", label_ko: "방", label_en: null, instance: 1,
        items: [
          { id: "bedroom:1:1", subgroup_ko: null, subgroup_en: null, label_ko: "벽지", label_en: null, status: status1 as never, note: "", photos: [] },
          { id: "bedroom:1:2", subgroup_ko: null, subgroup_en: null, label_ko: "바닥", label_en: null, status: status2 as never, note: "", photos: [] },
        ] },
    ],
  };
}

test("worsened items are flagged, unchanged are not", () => {
  const rows = compareInspections(snap("good", "good"), snap("damage", "good"));
  assert.equal(rows.length, 2);
  const wall = rows.find((r) => r.label_ko === "벽지")!;
  const floor = rows.find((r) => r.label_ko === "바닥")!;
  assert.equal(wall.worsened, true);
  assert.equal(wall.from, "good");
  assert.equal(wall.to, "damage");
  assert.equal(floor.worsened, false);
});

test("improvement (damage→good) is not worsened", () => {
  const rows = compareInspections(snap("damage", "good"), snap("good", "good"));
  assert.equal(rows.find((r) => r.label_ko === "벽지")!.worsened, false);
});

test("items only present in one inspection are skipped", () => {
  const moveIn = snap("good", "good");
  const moveOut: InspectionSnapshot = { ...snap("good", "good"), sections: [] };
  const rows = compareInspections(moveIn, moveOut);
  assert.equal(rows.length, 0);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --import tsx --test apps/crm/src/lib/inspection/compare.test.ts`
Expected: FAIL — cannot find module `./compare`.

- [ ] **Step 7: Write the compare implementation**

Create `apps/crm/src/lib/inspection/compare.ts`:

```ts
import type { InspectionSnapshot, ItemStatus, SnapshotItem } from "./types";

export interface ComparisonRow {
  key: string;
  instance: number | null;
  label_ko: string;
  from: ItemStatus;
  to: ItemStatus;
  worsened: boolean;
}

const SEVERITY: Record<ItemStatus, number> = { na: 0, good: 1, issue: 2, damage: 3 };

function indexItems(
  snap: InspectionSnapshot,
): Map<string, { item: SnapshotItem; key: string; instance: number | null }> {
  const map = new Map<string, { item: SnapshotItem; key: string; instance: number | null }>();
  for (const sec of snap.sections) {
    for (const item of sec.items) {
      // Prefer the stable id; fall back to a (section,instance,label) key so a
      // template change between move-in/out still matches by label.
      const idKey = item.id;
      const labelKey = `${sec.key}:${sec.instance ?? 0}:${item.label_ko}`;
      map.set(idKey, { item, key: sec.key, instance: sec.instance });
      if (!map.has(labelKey)) {
        map.set(labelKey, { item, key: sec.key, instance: sec.instance });
      }
    }
  }
  return map;
}

export function compareInspections(
  moveIn: InspectionSnapshot,
  moveOut: InspectionSnapshot,
): ComparisonRow[] {
  const inIdx = indexItems(moveIn);
  const rows: ComparisonRow[] = [];
  const seen = new Set<string>();

  for (const sec of moveOut.sections) {
    for (const item of sec.items) {
      const idKey = item.id;
      const labelKey = `${sec.key}:${sec.instance ?? 0}:${item.label_ko}`;
      const match = inIdx.get(idKey) ?? inIdx.get(labelKey);
      if (!match) continue;
      if (seen.has(labelKey)) continue;
      seen.add(labelKey);
      const from = match.item.status;
      const to = item.status;
      rows.push({
        key: sec.key,
        instance: sec.instance,
        label_ko: item.label_ko,
        from,
        to,
        worsened: SEVERITY[to] > SEVERITY[from],
      });
    }
  }
  return rows;
}
```

- [ ] **Step 8: Add both test files to the crm test script**

Modify `apps/crm/package.json` `"test"` to append
`src/lib/inspection/parse.test.ts src/lib/inspection/compare.test.ts`.

- [ ] **Step 9: Run the whole inspection lib suite**

Run: `node --import tsx --test apps/crm/src/lib/inspection/*.test.ts`
Expected: PASS (snapshot + parse + compare).

- [ ] **Step 10: Commit**

```bash
git add apps/crm/src/lib/inspection/parse.ts apps/crm/src/lib/inspection/parse.test.ts apps/crm/src/lib/inspection/compare.ts apps/crm/src/lib/inspection/compare.test.ts apps/crm/package.json
git commit -m "feat(inspection): tolerant snapshot parser + move-in/out comparison with tests"
```

---

## Task 4: Reminders constant

**Files:**
- Create: `apps/crm/src/lib/inspection/reminders.ts`

**Interfaces:**
- Produces `INSPECTION_REMINDERS: string[]` — the 중요사항 lines for the editor banner.

- [ ] **Step 1: Write the constant**

Create `apps/crm/src/lib/inspection/reminders.ts`:

```ts
/** 중요사항 (IMPORTANT) — fixed reminders shown atop the inspection editor. */
export const INSPECTION_REMINDERS: string[] = [
  "모든 데미지는 반드시 사진 촬영하기",
  "모든 전자제품 작동 테스트하기",
  "전체 청소 상태 확인하기",
  "블라인드 작동 상태 확인",
];
```

- [ ] **Step 2: Commit**

```bash
git add apps/crm/src/lib/inspection/reminders.ts
git commit -m "feat(inspection): 중요사항 reminder constants"
```

---

## Task 5: Upload route — allow `inspection`, return document id

**Files:**
- Modify: `apps/crm/src/app/api/upload/route.ts`

**Interfaces:**
- Produces: `POST /api/upload` accepts `entity_type=inspection` and responds
  `{ id: number, url: string }` (was `{ url }`).

- [ ] **Step 1: Allow the `inspection` entity type**

In `apps/crm/src/app/api/upload/route.ts`, add `"inspection"` to
`ALLOWED_ENTITY_TYPES`:

```ts
const ALLOWED_ENTITY_TYPES = new Set([
  "tenant",
  "property",
  "lease",
  "service_request",
  "service_request_status_log",
  "payment",
  "appliance",
  "inspection",
]);
```

- [ ] **Step 2: Return the inserted document id**

Change the insert to return the id and include it in the response. Replace:

```ts
  const db = getDb();
  await db
    .insertInto("document")
    .values({
      entity_type: entityType,
      entity_id: Number(entityId),
      file_name: file.name,
      file_url: blob.url,
      file_type: file.type,
      uploaded_by: Number(session.user.id),
      title,
      comments,
    })
    .execute();

  return NextResponse.json({ url: blob.url });
```

with:

```ts
  const db = getDb();
  const inserted = await db
    .insertInto("document")
    .values({
      entity_type: entityType,
      entity_id: Number(entityId),
      file_name: file.name,
      file_url: blob.url,
      file_type: file.type,
      uploaded_by: Number(session.user.id),
      title,
      comments,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return NextResponse.json({ id: inserted.id, url: blob.url });
```

- [ ] **Step 3: Verify lint/build for the route**

Run: `pnpm --filter crm lint`
Expected: no new errors. (Existing `DocumentList` only reads `res.ok`, so the
added `id` field is backward-compatible.)

- [ ] **Step 4: Commit**

```bash
git add apps/crm/src/app/api/upload/route.ts
git commit -m "feat(upload): allow inspection entity + return document id"
```

---

## Task 6: Settings — master template editor (actions)

**Files:**
- Create: `apps/crm/src/app/(dashboard)/settings/inspection-checklist/_actions.ts`

**Interfaces:**
- Produces server actions (all `requireAdmin`, revalidate
  `/settings/inspection-checklist`):
  - `addSection(formData)` — fields `label_ko` (req), `label_en`, `repeatable`
    (checkbox); `sort_order = max+1`; `key = "custom_" + <new id>` style slug.
  - `updateSection(id, formData)` — `label_ko`, `label_en`, `repeatable`.
  - `deleteSection(id)`.
  - `addItem(sectionId, formData)` — `label_ko` (req), `label_en`, `subgroup_ko`,
    `subgroup_en`; `sort_order = max+1` within section.
  - `updateItem(id, formData)`.
  - `deleteItem(id)`.

- [ ] **Step 1: Write the actions**

Create `apps/crm/src/app/(dashboard)/settings/inspection-checklist/_actions.ts`:

```ts
"use server";

import { getDb, sql } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";

const PATH = "/settings/inspection-checklist";

function reqStr(fd: FormData, name: string): string {
  const v = (fd.get(name) as string | null)?.trim();
  if (!v) throw new Error("필수 항목을 입력해주세요.");
  return v;
}
function optStr(fd: FormData, name: string): string | null {
  const v = (fd.get(name) as string | null)?.trim();
  return v ? v : null;
}

export async function addSection(formData: FormData) {
  await requireAdmin();
  const db = getDb();
  const label_ko = reqStr(formData, "label_ko");
  const max = await db
    .selectFrom("inspection_section")
    .select(sql<number>`coalesce(max(sort_order), -1)`.as("m"))
    .executeTakeFirst();
  await db
    .insertInto("inspection_section")
    .values({
      key: `custom_${Date.now()}`,
      label_ko,
      label_en: optStr(formData, "label_en"),
      repeatable: formData.get("repeatable") === "on",
      sort_order: Number(max?.m ?? -1) + 1,
      is_builtin: false,
    })
    .execute();
  revalidatePath(PATH);
}

export async function updateSection(id: number, formData: FormData) {
  await requireAdmin();
  const db = getDb();
  await db
    .updateTable("inspection_section")
    .set({
      label_ko: reqStr(formData, "label_ko"),
      label_en: optStr(formData, "label_en"),
      repeatable: formData.get("repeatable") === "on",
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath(PATH);
}

export async function deleteSection(id: number) {
  await requireAdmin();
  const db = getDb();
  // inspection_item has ON DELETE CASCADE, so child rows go with it.
  await db.deleteFrom("inspection_section").where("id", "=", id).execute();
  revalidatePath(PATH);
}

export async function addItem(sectionId: number, formData: FormData) {
  await requireAdmin();
  const db = getDb();
  const max = await db
    .selectFrom("inspection_item")
    .select(sql<number>`coalesce(max(sort_order), -1)`.as("m"))
    .where("section_id", "=", sectionId)
    .executeTakeFirst();
  await db
    .insertInto("inspection_item")
    .values({
      section_id: sectionId,
      label_ko: reqStr(formData, "label_ko"),
      label_en: optStr(formData, "label_en"),
      subgroup_ko: optStr(formData, "subgroup_ko"),
      subgroup_en: optStr(formData, "subgroup_en"),
      sort_order: Number(max?.m ?? -1) + 1,
    })
    .execute();
  revalidatePath(PATH);
}

export async function updateItem(id: number, formData: FormData) {
  await requireAdmin();
  const db = getDb();
  await db
    .updateTable("inspection_item")
    .set({
      label_ko: reqStr(formData, "label_ko"),
      label_en: optStr(formData, "label_en"),
      subgroup_ko: optStr(formData, "subgroup_ko"),
      subgroup_en: optStr(formData, "subgroup_en"),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath(PATH);
}

export async function deleteItem(id: number) {
  await requireAdmin();
  const db = getDb();
  await db.deleteFrom("inspection_item").where("id", "=", id).execute();
  revalidatePath(PATH);
}
```

- [ ] **Step 2: Verify lint/typecheck**

Run: `pnpm --filter crm lint`
Expected: no new errors. (Requires Task 1's regenerated types so
`inspection_section`/`inspection_item` exist on the `DB` interface.)

- [ ] **Step 3: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/settings/inspection-checklist/_actions.ts"
git commit -m "feat(settings): inspection template CRUD actions"
```

---

## Task 7: Settings — master template editor (page + UI + nav)

**Files:**
- Create: `apps/crm/src/app/(dashboard)/settings/inspection-checklist/page.tsx`
- Create: `apps/crm/src/app/(dashboard)/settings/inspection-checklist/_components/template-editor.tsx`
- Modify: `apps/crm/src/app/(dashboard)/settings/layout.tsx`

**Interfaces:**
- Consumes actions from Task 6 and tables from Task 1.
- The page loads all sections + items and renders `<TemplateEditor>`.

- [ ] **Step 1: Add the nav entry**

In `apps/crm/src/app/(dashboard)/settings/layout.tsx`, import `ClipboardCheck`
from `lucide-react` and add to `settingsNav` (after `데이터 관리`):

```ts
import { Settings, Database, Users, ClipboardCheck } from "lucide-react";

const settingsNav = [
  { href: "/settings", label: "일반", icon: Settings },
  { href: "/settings/data", label: "데이터 관리", icon: Database },
  { href: "/settings/inspection-checklist", label: "점검 체크리스트", icon: ClipboardCheck },
  { href: "/settings/users", label: "사용자 관리", icon: Users },
];
```

- [ ] **Step 2: Write the page (server component)**

Create `apps/crm/src/app/(dashboard)/settings/inspection-checklist/page.tsx`:

```tsx
import { getDb } from "@kingsrealty/db";
import { requireAdmin } from "@/lib/authz";
import { TemplateEditor } from "./_components/template-editor";

export default async function InspectionChecklistSettingsPage() {
  await requireAdmin();
  const db = getDb();

  const [sections, items] = await Promise.all([
    db
      .selectFrom("inspection_section")
      .select(["id", "key", "label_ko", "label_en", "repeatable", "sort_order"])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("inspection_item")
      .select([
        "id",
        "section_id",
        "subgroup_ko",
        "subgroup_en",
        "label_ko",
        "label_en",
        "sort_order",
      ])
      .orderBy("sort_order", "asc")
      .execute(),
  ]);

  const itemsBySection = new Map<number, typeof items>();
  for (const it of items) {
    const arr = itemsBySection.get(it.section_id) ?? [];
    arr.push(it);
    itemsBySection.set(it.section_id, arr);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">점검 체크리스트 템플릿</h2>
        <p className="text-sm text-muted-foreground">
          입주/퇴거 점검의 기본 항목을 관리합니다. 수정은 새로 생성하는 점검에만
          적용되며, 기존 점검 기록은 변경되지 않습니다.
        </p>
      </div>
      <TemplateEditor
        sections={sections.map((s) => ({
          ...s,
          items: itemsBySection.get(s.id) ?? [],
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 3: Write the editor component**

Create `apps/crm/src/app/(dashboard)/settings/inspection-checklist/_components/template-editor.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Plus, Pencil, Trash2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import { SubmitButton } from "@/components/submit-button";
import {
  addSection,
  updateSection,
  deleteSection,
  addItem,
  updateItem,
  deleteItem,
} from "../_actions";

interface ItemRow {
  id: number;
  section_id: number;
  subgroup_ko: string | null;
  subgroup_en: string | null;
  label_ko: string;
  label_en: string | null;
  sort_order: number;
}
interface SectionRow {
  id: number;
  key: string;
  label_ko: string;
  label_en: string | null;
  repeatable: boolean;
  sort_order: number;
  items: ItemRow[];
}

export function TemplateEditor({ sections }: { sections: SectionRow[] }) {
  const addSectionRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}

      <DataPanel>
        <form
          ref={addSectionRef}
          action={async (fd) => {
            await addSection(fd);
            addSectionRef.current?.reset();
          }}
          className="flex flex-wrap items-end gap-2 p-3"
        >
          <div className="space-y-1">
            <Label htmlFor="new-sec-ko">새 섹션 (한글)</Label>
            <Input id="new-sec-ko" name="label_ko" required className="w-40" placeholder="예: 베란다" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-sec-en">영문</Label>
            <Input id="new-sec-en" name="label_en" className="w-40" placeholder="BALCONY" />
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-sm">
            <input type="checkbox" name="repeatable" /> 반복(방/화장실)
          </label>
          <SubmitButton label="섹션 추가" />
        </form>
      </DataPanel>
    </div>
  );
}

function SectionCard({ section }: { section: SectionRow }) {
  const [editing, setEditing] = useState(false);
  const addItemRef = useRef<HTMLFormElement>(null);
  const deleteSectionAction = deleteSection.bind(null, section.id);

  return (
    <DataPanel>
      <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
        {editing ? (
          <form
            action={async (fd) => {
              await updateSection(section.id, fd);
              setEditing(false);
            }}
            className="flex flex-1 flex-wrap items-end gap-2"
          >
            <Input name="label_ko" required defaultValue={section.label_ko} className="w-36" />
            <Input name="label_en" defaultValue={section.label_en ?? ""} className="w-36" placeholder="영문" />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="repeatable" defaultChecked={section.repeatable} /> 반복
            </label>
            <SubmitButton label="저장" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              취소
            </Button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{section.label_ko}</span>
              {section.label_en && (
                <span className="text-xs text-muted-foreground">{section.label_en}</span>
              )}
              {section.repeatable && (
                <Badge variant="secondary" className="gap-1">
                  <Repeat className="size-3" /> 반복
                </Badge>
              )}
            </div>
            <div className="flex items-center">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="섹션 수정" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
              </Button>
              <form action={deleteSectionAction}>
                <Button type="submit" variant="ghost" size="icon-sm" aria-label="섹션 삭제" className="hover:text-danger">
                  <Trash2 className="size-4" />
                </Button>
              </form>
            </div>
          </>
        )}
      </div>

      <ul className="divide-y divide-border/40">
        {section.items.map((item) => (
          <ItemRowView key={item.id} item={item} />
        ))}
      </ul>

      <form
        ref={addItemRef}
        action={async (fd) => {
          await addItem(section.id, fd);
          addItemRef.current?.reset();
        }}
        className="flex flex-wrap items-end gap-2 border-t border-border/60 p-2.5"
      >
        <Input name="subgroup_ko" className="w-28" placeholder="그룹(선택)" />
        <Input name="label_ko" required className="w-40" placeholder="항목 (한글)" />
        <Input name="label_en" className="w-40" placeholder="EN (선택)" />
        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <Plus className="size-3.5" /> 항목
        </Button>
      </form>
    </DataPanel>
  );
}

function ItemRowView({ item }: { item: ItemRow }) {
  const [editing, setEditing] = useState(false);
  const deleteAction = deleteItem.bind(null, item.id);

  if (editing) {
    return (
      <li className="p-2.5">
        <form
          action={async (fd) => {
            await updateItem(item.id, fd);
            setEditing(false);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Input name="subgroup_ko" defaultValue={item.subgroup_ko ?? ""} className="w-28" placeholder="그룹" />
          <Input name="subgroup_en" defaultValue={item.subgroup_en ?? ""} className="w-28" placeholder="GROUP" />
          <Input name="label_ko" required defaultValue={item.label_ko} className="w-40" />
          <Input name="label_en" defaultValue={item.label_en ?? ""} className="w-40" placeholder="EN" />
          <SubmitButton label="저장" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            취소
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="group flex items-center justify-between px-3.5 py-2 text-sm">
      <span className="flex items-center gap-2">
        {item.subgroup_ko && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {item.subgroup_ko}
          </span>
        )}
        <span>{item.label_ko}</span>
        {item.label_en && (
          <span className="text-xs text-muted-foreground">{item.label_en}</span>
        )}
      </span>
      <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="항목 수정" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" />
        </Button>
        <form action={deleteAction}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="항목 삭제" className="hover:text-danger">
            <Trash2 className="size-3.5" />
          </Button>
        </form>
      </span>
    </li>
  );
}
```

- [ ] **Step 4: Verify lint/build**

Run: `pnpm --filter crm lint`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Run the app (`pnpm --filter crm dev`), open `/settings/점검 체크리스트`
(`/settings/inspection-checklist`). Confirm: all seeded sections render with
items; add/edit/delete a section and an item; the 반복 badge shows on
방/화장실.

- [ ] **Step 6: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/settings/inspection-checklist/page.tsx" "apps/crm/src/app/(dashboard)/settings/inspection-checklist/_components/template-editor.tsx" "apps/crm/src/app/(dashboard)/settings/layout.tsx"
git commit -m "feat(settings): inspection checklist template editor page + nav"
```

---

## Task 8: Inspection server actions (tenant page)

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/tenants/_actions.ts`

**Interfaces:**
- Consumes `buildInspectionSnapshot` (Task 2), `parseSnapshot` (Task 3),
  `seoulDateString` (`@/lib/date`).
- Produces:
  - `createInspectionDraft(tenantId, leaseId, propertyId, formData)` — reads
    `type` (`move_in|move_out`) + `inspected_at`; builds the snapshot from the
    live template + the property's `rooms`/`bathrooms`; inserts an
    `inspection` row with `status='draft'`; `redirect` to the editor route.
  - `saveInspection(id, tenantId, payload)` — `payload: { checklist: string;
    signature: string; summary: string | null }`; persists; stays draft.
  - `finalizeInspection(id, tenantId)` — sets `status='finalized'` and applies the
    property-status side effect (move_in→occupied; move_out→move_out +
    moveout_date).
  - `deleteInspection(id, tenantId)` — best-effort delete blobs + `document`
    rows for `(entity_type='inspection', entity_id=id)`, then the row.
  - `deleteInspectionPhoto(documentId, inspectionId, tenantId)` — delete blob +
    `document` row.

- [ ] **Step 1: Add imports**

At the top of `apps/crm/src/app/(dashboard)/tenants/_actions.ts`, ensure these
imports exist (add what's missing — the file already uses `getDb`,
`revalidatePath`, `requireUser`):

```ts
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { seoulDateString } from "@/lib/date";
import { buildInspectionSnapshot } from "@/lib/inspection/snapshot";
```

- [ ] **Step 2: Add the create-draft action**

Append to `apps/crm/src/app/(dashboard)/tenants/_actions.ts`:

```ts
// --- 입주/퇴거 점검 (Inspections) ---

export async function createInspectionDraft(
  tenantId: number,
  leaseId: number,
  propertyId: number,
  formData: FormData,
) {
  const session = await requireUser();
  const db = getDb();

  const type = formData.get("type") === "move_out" ? "move_out" : "move_in";
  const dateRaw = formData.get("inspected_at") as string | null;
  const inspected_at = dateRaw ? new Date(dateRaw) : new Date();

  const [sections, items, property] = await Promise.all([
    db
      .selectFrom("inspection_section")
      .select(["id", "key", "label_ko", "label_en", "repeatable", "sort_order"])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("inspection_item")
      .select([
        "id",
        "section_id",
        "subgroup_ko",
        "subgroup_en",
        "label_ko",
        "label_en",
        "sort_order",
      ])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("property")
      .select(["rooms", "bathrooms"])
      .where("id", "=", propertyId)
      .executeTakeFirst(),
  ]);

  const snapshot = buildInspectionSnapshot(sections, items, {
    rooms: property?.rooms ?? null,
    bathrooms: property?.bathrooms ?? null,
  });

  const inserted = await db
    .insertInto("inspection")
    .values({
      lease_id: leaseId,
      property_id: propertyId,
      type,
      inspected_at,
      status: "draft",
      checklist: JSON.stringify(snapshot),
      created_by: Number(session.user.id),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  revalidatePath(`/tenants/${tenantId}`);
  redirect(`/tenants/${tenantId}/inspections/${inserted.id}`);
}
```

- [ ] **Step 3: Add save / finalize / delete actions**

Append:

```ts
export async function saveInspection(
  id: number,
  tenantId: number,
  payload: { checklist: string; signature: string; summary: string | null },
) {
  await requireUser();
  const db = getDb();
  await db
    .updateTable("inspection")
    .set({
      checklist: payload.checklist,
      signature: payload.signature,
      summary: payload.summary,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath(`/tenants/${tenantId}/inspections/${id}`);
  revalidatePath(`/tenants/${tenantId}`);
}

export async function finalizeInspection(id: number, tenantId: number) {
  await requireUser();
  const db = getDb();

  const insp = await db
    .selectFrom("inspection")
    .select(["type", "property_id", "inspected_at"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!insp) throw new Error("점검 기록을 찾을 수 없습니다.");

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("inspection")
      .set({ status: "finalized", updated_at: new Date() })
      .where("id", "=", id)
      .execute();

    if (insp.type === "move_in") {
      await trx
        .updateTable("property")
        .set({ status: "occupied", updated_at: new Date() })
        .where("id", "=", insp.property_id)
        .execute();
    } else {
      const moveoutDate = seoulDateString(
        insp.inspected_at instanceof Date
          ? insp.inspected_at
          : new Date(insp.inspected_at),
      );
      await trx
        .updateTable("property")
        .set({ status: "move_out", moveout_date: moveoutDate, updated_at: new Date() })
        .where("id", "=", insp.property_id)
        .execute();
    }
  });

  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath(`/tenants/${tenantId}/inspections/${id}`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${insp.property_id}`);
}

async function deleteInspectionBlobs(
  db: ReturnType<typeof getDb>,
  inspectionId: number,
) {
  const docs = await db
    .selectFrom("document")
    .select(["id", "file_url"])
    .where("entity_type", "=", "inspection")
    .where("entity_id", "=", inspectionId)
    .execute();
  for (const d of docs) {
    try {
      await del(d.file_url);
    } catch (err) {
      console.error("inspection blob delete failed", d.id, err);
    }
  }
  if (docs.length > 0) {
    await db
      .deleteFrom("document")
      .where("entity_type", "=", "inspection")
      .where("entity_id", "=", inspectionId)
      .execute();
  }
}

export async function deleteInspection(id: number, tenantId: number) {
  await requireUser();
  const db = getDb();
  await deleteInspectionBlobs(db, id);
  await db.deleteFrom("inspection").where("id", "=", id).execute();
  revalidatePath(`/tenants/${tenantId}`);
}

export async function deleteInspectionPhoto(
  documentId: number,
  inspectionId: number,
  tenantId: number,
) {
  await requireUser();
  const db = getDb();
  const doc = await db
    .selectFrom("document")
    .select(["file_url"])
    .where("id", "=", documentId)
    .where("entity_type", "=", "inspection")
    .executeTakeFirst();
  if (doc) {
    try {
      await del(doc.file_url);
    } catch (err) {
      console.error("inspection photo blob delete failed", documentId, err);
    }
    await db.deleteFrom("document").where("id", "=", documentId).execute();
  }
  revalidatePath(`/tenants/${tenantId}/inspections/${inspectionId}`);
}
```

- [ ] **Step 4: Verify lint/typecheck**

Run: `pnpm --filter crm lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/_actions.ts"
git commit -m "feat(inspection): tenant-page draft/save/finalize/delete actions"
```

---

## Task 9: Photo strip / gallery client component

**Files:**
- Create: `apps/crm/src/app/(dashboard)/tenants/_components/inspection-photos.tsx`

**Interfaces:**
- Consumes `PhotoRef` (`@/lib/inspection/types`).
- Produces `<InspectionPhotos>` with props:
  `{ inspectionId: number; photos: PhotoRef[]; onAdd?: (photo: PhotoRef) =>
  void; onRemove?: (id: number) => void; deletable?: boolean }`. Uploads to
  `/api/upload` (`entity_type=inspection`), calls `onAdd` with `{ id,
  url:"/api/documents/{id}" }`. When `onAdd`/`onRemove` are omitted (general
  gallery managed by the server), it calls `router.refresh()` and uses the
  server delete action instead — see note. For the editor (item-linked), the
  parent passes `onAdd`/`onRemove` to mutate snapshot state.

- [ ] **Step 1: Write the component**

Create `apps/crm/src/app/(dashboard)/tenants/_components/inspection-photos.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PhotoRef } from "@/lib/inspection/types";

export function InspectionPhotos({
  inspectionId,
  photos,
  onAdd,
  onRemove,
  size = "md",
}: {
  inspectionId: number;
  photos: PhotoRef[];
  onAdd: (photo: PhotoRef) => void;
  onRemove: (id: number) => void;
  size?: "sm" | "md";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thumb = size === "sm" ? "size-12" : "size-16";

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entity_type", "inspection");
        fd.append("entity_id", String(inspectionId));
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? "업로드에 실패했습니다.");
          break;
        }
        const data = (await res.json()) as { id: number; url: string };
        onAdd({ id: data.id, url: `/api/documents/${data.id}` });
      }
    } catch {
      setError("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {photos.map((p) => (
          <div key={p.id} className={`group relative ${thumb} overflow-hidden rounded-md border`}>
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="점검 사진" className="size-full object-cover" />
            </a>
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              aria-label="사진 삭제"
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex ${thumb} items-center justify-center rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50`}
          aria-label="사진 추가"
        >
          <Camera className="size-4" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {uploading && <p className="text-[11px] text-muted-foreground">업로드 중...</p>}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
```

Note: deletion here calls the parent's `onRemove` (which both splices snapshot
state AND calls `deleteInspectionPhoto`); see Task 10 wiring. This keeps the
component pure-presentational about persistence.

- [ ] **Step 2: Verify lint**

Run: `pnpm --filter crm lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/_components/inspection-photos.tsx"
git commit -m "feat(inspection): camera-capable photo strip component"
```

---

## Task 10: Inspection editor route (draft → finalize)

**Files:**
- Create: `apps/crm/src/app/(dashboard)/tenants/[id]/inspections/[inspectionId]/page.tsx`
- Create: `apps/crm/src/app/(dashboard)/tenants/[id]/inspections/[inspectionId]/_editor.tsx`

**Interfaces:**
- Consumes `parseSnapshot` (Task 3), `INSPECTION_REMINDERS` (Task 4),
  `InspectionPhotos` (Task 9), `saveInspection`/`finalizeInspection`/
  `deleteInspectionPhoto` (Task 8), snapshot types (Task 2).
- The page loads the inspection + its tenant/property context + existing item
  photo refs (already embedded in the snapshot) and renders `<InspectionEditor>`.
- Route precedence: this static `inspections/[inspectionId]` segment is more
  specific than the sibling `[[...tab]]` optional catch-all, so `/tenants/{id}/
  inspections/{inspId}` resolves here.

- [ ] **Step 1: Write the page (server component)**

Create `apps/crm/src/app/(dashboard)/tenants/[id]/inspections/[inspectionId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getDb } from "@kingsrealty/db";
import { requireUser } from "@/lib/authz";
import { parseSnapshot } from "@/lib/inspection/parse";
import { InspectionEditor } from "./_editor";

export default async function InspectionEditorPage({
  params,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
}) {
  await requireUser();
  const { id, inspectionId } = await params;
  const tenantId = Number(id);
  const inspId = Number(inspectionId);
  const db = getDb();

  const insp = await db
    .selectFrom("inspection")
    .innerJoin("property", "property.id", "inspection.property_id")
    .innerJoin("tenant", "tenant.id", "=", db.fn.coalesce("tenant.id", "tenant.id"))
    .select([
      "inspection.id as id",
      "inspection.type as type",
      "inspection.status as status",
      "inspection.inspected_at as inspected_at",
      "inspection.checklist as checklist",
      "inspection.signature as signature",
      "inspection.summary as summary",
      "inspection.property_id as property_id",
      "property.address as address",
      "property.address_detail as address_detail",
    ])
    .where("inspection.id", "=", inspId)
    .executeTakeFirst();
  if (!insp) notFound();

  const tenant = await db
    .selectFrom("tenant")
    .select(["name"])
    .where("id", "=", tenantId)
    .executeTakeFirst();
  if (!tenant) notFound();

  // All inspection documents (item-linked + general gallery).
  const docs = await db
    .selectFrom("document")
    .select(["id"])
    .where("entity_type", "=", "inspection")
    .where("entity_id", "=", inspId)
    .execute();

  const snapshot = parseSnapshot(insp.checklist);
  const linkedIds = new Set(
    snapshot.sections.flatMap((s) => s.items).flatMap((it) => it.photos.map((p) => p.id)),
  );
  const galleryPhotos = docs
    .filter((d) => !linkedIds.has(d.id))
    .map((d) => ({ id: d.id, url: `/api/documents/${d.id}` }));

  const signature = (() => {
    try {
      return insp.signature ? JSON.parse(insp.signature) : {};
    } catch {
      return {};
    }
  })();

  return (
    <InspectionEditor
      tenantId={tenantId}
      inspectionId={inspId}
      type={insp.type}
      status={insp.status}
      inspectedAt={
        insp.inspected_at instanceof Date
          ? insp.inspected_at.toISOString()
          : String(insp.inspected_at)
      }
      tenantName={tenant.name}
      propertyLabel={`${insp.address}${insp.address_detail ? " " + insp.address_detail : ""}`}
      initialSnapshot={snapshot}
      initialGallery={galleryPhotos}
      initialSignature={{
        tenant: signature?.tenant?.name ?? "",
        inspector: signature?.inspector?.name ?? "",
      }}
      initialSummary={insp.summary ?? ""}
    />
  );
}
```

> Implementer note: the `tenant` join line above is only illustrative of context
> loading — the simple two-query form (load inspection, then tenant by
> `tenantId`) shown is what to ship. Remove the `innerJoin("tenant", …)` from the
> inspection query (kept minimal): the final inspection query joins **only**
> `property`. Use exactly:
>
> ```tsx
> const insp = await db
>   .selectFrom("inspection")
>   .innerJoin("property", "property.id", "inspection.property_id")
>   .select([
>     "inspection.id as id",
>     "inspection.type as type",
>     "inspection.status as status",
>     "inspection.inspected_at as inspected_at",
>     "inspection.checklist as checklist",
>     "inspection.signature as signature",
>     "inspection.summary as summary",
>     "inspection.property_id as property_id",
>     "property.address as address",
>     "property.address_detail as address_detail",
>   ])
>   .where("inspection.id", "=", inspId)
>   .executeTakeFirst();
> ```

- [ ] **Step 2: Write the editor client component**

Create `apps/crm/src/app/(dashboard)/tenants/[id]/inspections/[inspectionId]/_editor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { INSPECTION_REMINDERS } from "@/lib/inspection/reminders";
import type {
  InspectionSnapshot,
  ItemStatus,
  PhotoRef,
  SnapshotItem,
} from "@/lib/inspection/types";
import {
  saveInspection,
  finalizeInspection,
  deleteInspectionPhoto,
} from "../../../_actions";
import { InspectionPhotos } from "../../../_components/inspection-photos";

const STATUS_OPTS: { value: ItemStatus; label: string; tone: string }[] = [
  { value: "na", label: "미점검", tone: "text-muted-foreground" },
  { value: "good", label: "양호", tone: "text-success" },
  { value: "issue", label: "이상", tone: "text-warning" },
  { value: "damage", label: "파손", tone: "text-danger" },
];

export function InspectionEditor(props: {
  tenantId: number;
  inspectionId: number;
  type: string;
  status: string;
  inspectedAt: string;
  tenantName: string;
  propertyLabel: string;
  initialSnapshot: InspectionSnapshot;
  initialGallery: PhotoRef[];
  initialSignature: { tenant: string; inspector: string };
  initialSummary: string;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<InspectionSnapshot>(props.initialSnapshot);
  const [gallery, setGallery] = useState<PhotoRef[]>(props.initialGallery);
  const [sig, setSig] = useState(props.initialSignature);
  const [summary, setSummary] = useState(props.initialSummary);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const finalized = props.status === "finalized";

  function patchItem(sectionIdx: number, itemId: string, patch: Partial<SnapshotItem>) {
    setSnapshot((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIdx
          ? { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
          : s,
      ),
    }));
  }

  function buildSignaturePayload(): string {
    const now = new Date().toISOString();
    return JSON.stringify({
      tenant: sig.tenant ? { name: sig.tenant, signed_at: now } : null,
      inspector: sig.inspector ? { name: sig.inspector, signed_at: now } : null,
    });
  }

  function persist(): Promise<void> {
    return saveInspection(props.inspectionId, props.tenantId, {
      checklist: JSON.stringify({ ...snapshot, notes: snapshot.notes }),
      signature: buildSignaturePayload(),
      summary: summary.trim() || null,
    });
  }

  function handleSave() {
    startTransition(async () => {
      await persist();
      setSavedAt(new Date().toLocaleTimeString("ko-KR"));
      router.refresh();
    });
  }

  function handleFinalize() {
    startTransition(async () => {
      await persist();
      await finalizeInspection(props.inspectionId, props.tenantId);
      router.push(`/tenants/${props.tenantId}/inspections`);
      router.refresh();
    });
  }

  // Item photo add/remove: mutate snapshot state; remove also deletes the blob.
  function addItemPhoto(sectionIdx: number, itemId: string, photo: PhotoRef) {
    setSnapshot((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              items: s.items.map((it) =>
                it.id === itemId ? { ...it, photos: [...it.photos, photo] } : it,
              ),
            }
          : s,
      ),
    }));
  }
  function removeItemPhoto(sectionIdx: number, itemId: string, photoId: number) {
    setSnapshot((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              items: s.items.map((it) =>
                it.id === itemId
                  ? { ...it, photos: it.photos.filter((p) => p.id !== photoId) }
                  : it,
              ),
            }
          : s,
      ),
    }));
    void deleteInspectionPhoto(photoId, props.inspectionId, props.tenantId);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${props.type === "move_in" ? "입주" : "퇴거"} 점검`}
        description={`${props.tenantName} · ${props.propertyLabel} · ${new Date(props.inspectedAt).toLocaleDateString("ko-KR")}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" render={<Link href={`/tenants/${props.tenantId}/inspections`} />}>
              <ArrowLeft className="size-4" /> 목록
            </Button>
            {!finalized && (
              <>
                <Button variant="outline" size="sm" disabled={pending} onClick={handleSave}>
                  {pending ? "저장 중..." : "임시 저장"}
                </Button>
                <Button size="sm" disabled={pending} onClick={handleFinalize} className="gap-1.5">
                  <Check className="size-4" /> 완료
                </Button>
              </>
            )}
            {finalized && <Badge>완료됨</Badge>}
          </div>
        }
      />

      {savedAt && <p className="text-xs text-muted-foreground">{savedAt} 저장됨</p>}

      <DataPanel>
        <div className="flex items-start gap-2 border-b border-border/60 bg-warning/5 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 text-warning" />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">중요사항</p>
            <ul className="list-disc pl-4 text-muted-foreground">
              {INSPECTION_REMINDERS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </DataPanel>

      {snapshot.sections.map((section, sIdx) => (
        <DataPanel key={`${section.key}-${section.instance ?? 0}`}>
          <div className="border-b border-border/60 px-3.5 py-2.5 text-sm font-semibold">
            {section.label_ko}
            {section.instance != null && ` ${section.instance}`}
            {section.label_en && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{section.label_en}</span>
            )}
          </div>
          <ul className="divide-y divide-border/40">
            {section.items.map((item) => (
              <li key={item.id} className="space-y-2 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {item.subgroup_ko && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {item.subgroup_ko}
                    </span>
                  )}
                  <span className="text-sm">{item.label_ko}</span>
                  {item.label_en && (
                    <span className="text-xs text-muted-foreground">{item.label_en}</span>
                  )}
                  <div className="ml-auto flex gap-1">
                    {STATUS_OPTS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={finalized}
                        onClick={() => patchItem(sIdx, item.id, { status: opt.value })}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs transition-colors disabled:opacity-60",
                          item.status === opt.value
                            ? `border-current ${opt.tone} font-medium`
                            : "border-transparent text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <Input
                    value={item.note}
                    disabled={finalized}
                    onChange={(e) => patchItem(sIdx, item.id, { note: e.target.value })}
                    placeholder="비고"
                    className="sm:flex-1"
                  />
                  <InspectionPhotos
                    inspectionId={props.inspectionId}
                    photos={item.photos}
                    size="sm"
                    onAdd={(p) => addItemPhoto(sIdx, item.id, p)}
                    onRemove={(pid) => removeItemPhoto(sIdx, item.id, pid)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </DataPanel>
      ))}

      <DataPanel>
        <div className="space-y-3 p-3.5">
          <div className="space-y-1.5">
            <Label>전체 사진 (현장/퇴거 등)</Label>
            <InspectionPhotos
              inspectionId={props.inspectionId}
              photos={gallery}
              onAdd={(p) => setGallery((g) => [...g, p])}
              onRemove={(pid) => {
                setGallery((g) => g.filter((p) => p.id !== pid));
                void deleteInspectionPhoto(pid, props.inspectionId, props.tenantId);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">특이사항 메모</Label>
            <Textarea
              id="notes"
              rows={3}
              disabled={finalized}
              value={snapshot.notes}
              onChange={(e) => setSnapshot((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="특이사항"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="summary">종합 의견</Label>
            <Textarea
              id="summary"
              rows={2}
              disabled={finalized}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sig-tenant">임차인 서명</Label>
              <Input
                id="sig-tenant"
                disabled={finalized}
                value={sig.tenant}
                onChange={(e) => setSig((s) => ({ ...s, tenant: e.target.value }))}
                placeholder="임차인 성명"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sig-inspector">점검자 서명</Label>
              <Input
                id="sig-inspector"
                disabled={finalized}
                value={sig.inspector}
                onChange={(e) => setSig((s) => ({ ...s, inspector: e.target.value }))}
                placeholder="점검자 성명"
              />
            </div>
          </div>
        </div>
      </DataPanel>
    </div>
  );
}
```

- [ ] **Step 3: Verify lint/build**

Run: `pnpm --filter crm lint`
Expected: no new errors. (Confirm `PageHeader` accepts `actions`; it is used the
same way in `leases/[id]/_detail.tsx` via the `DetailView`/`PageHeader` family —
if `PageHeader` lacks an `actions` prop, wrap the buttons in a sibling
`<div className="flex justify-end">` above the panels instead.)

- [ ] **Step 4: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/[id]/inspections"
git commit -m "feat(inspection): draft→finalize editor route with items, photos, signatures"
```

---

## Task 11: Inspection list tab (new tenant-page home)

**Files:**
- Create: `apps/crm/src/app/(dashboard)/tenants/_components/inspections.tsx`

**Interfaces:**
- Consumes `parseSnapshot` + `compareInspections` (Task 3),
  `createInspectionDraft` + `deleteInspection` (Task 8).
- Produces `<Inspections>` with props:
  `{ tenantId: number; leaseId: number | null; propertyId: number | null;
  inspections: { id: number; type: string; status: string; inspected_at:
  string; checklist: string | null; summary: string | null }[] }`.
  When `leaseId`/`propertyId` are null → empty state.

- [ ] **Step 1: Write the component**

Create `apps/crm/src/app/(dashboard)/tenants/_components/inspections.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ClipboardCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataPanel } from "@/components/data-panel";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/submit-button";
import { parseSnapshot } from "@/lib/inspection/parse";
import { compareInspections } from "@/lib/inspection/compare";
import { createInspectionDraft, deleteInspection } from "../_actions";

interface InspectionRow {
  id: number;
  type: string;
  status: string;
  inspected_at: string;
  checklist: string | null;
  summary: string | null;
}

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function Inspections({
  tenantId,
  leaseId,
  propertyId,
  inspections,
}: {
  tenantId: number;
  leaseId: number | null;
  propertyId: number | null;
  inspections: InspectionRow[];
}) {
  const [open, setOpen] = useState(false);

  if (leaseId == null || propertyId == null) {
    return (
      <DataPanel>
        <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">
          계약을 먼저 등록한 뒤 입주/퇴거 점검을 기록할 수 있습니다.
        </p>
      </DataPanel>
    );
  }

  const createAction = createInspectionDraft.bind(null, tenantId, leaseId, propertyId);
  const moveIn = inspections.find((i) => i.type === "move_in");
  const moveOut = inspections.find((i) => i.type === "move_out");
  const comparison =
    moveIn && moveOut
      ? compareInspections(parseSnapshot(moveIn.checklist), parseSnapshot(moveOut.checklist))
      : [];
  const worsened = comparison.filter((r) => r.worsened);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> 점검 추가
        </Button>
      </div>

      {inspections.length === 0 ? (
        <DataPanel>
          <EmptyState
            icon={ClipboardCheck}
            title="점검 기록이 없습니다"
            description="입주 점검 또는 퇴거 점검을 추가하세요."
          />
        </DataPanel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {inspections.map((insp) => {
            const snap = parseSnapshot(insp.checklist);
            const counts = snap.sections
              .flatMap((s) => s.items)
              .reduce(
                (acc, it) => {
                  if (it.status === "issue") acc.issue += 1;
                  if (it.status === "damage") acc.damage += 1;
                  return acc;
                },
                { issue: 0, damage: 0 },
              );
            const del = deleteInspection.bind(null, insp.id, tenantId);
            return (
              <div key={insp.id} className="rounded-lg border border-border/60 bg-card p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={insp.type === "move_in" ? "default" : "secondary"}>
                      {insp.type === "move_in" ? "입주 점검" : "퇴거 점검"}
                    </Badge>
                    {insp.status === "draft" && <Badge variant="outline">작성 중</Badge>}
                    <span className="tabular text-sm text-muted-foreground">
                      {new Date(insp.inspected_at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <form action={del}>
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label="삭제">
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </form>
                </div>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  {counts.issue > 0 && <span className="text-warning">이상 {counts.issue}</span>}
                  {counts.damage > 0 && <span className="text-danger">파손 {counts.damage}</span>}
                  {counts.issue === 0 && counts.damage === 0 && (
                    <span className="text-muted-foreground">특이사항 없음</span>
                  )}
                </div>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/tenants/${tenantId}/inspections/${insp.id}`} />}
                  >
                    {insp.status === "draft" ? "이어서 작성" : "열기"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {moveIn && moveOut && (
        <DataPanel>
          <div className="border-b border-border/60 px-3.5 py-2.5 text-sm font-semibold">
            입주 ↔ 퇴거 비교 {worsened.length > 0 && <span className="text-danger">· 악화 {worsened.length}건</span>}
          </div>
          {worsened.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-muted-foreground">악화된 항목이 없습니다.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {worsened.map((r) => (
                <div key={`${r.key}-${r.instance ?? 0}-${r.label_ko}`} className="grid grid-cols-[1fr_auto] gap-2 bg-danger/5 px-3.5 py-2 text-sm">
                  <span>
                    {r.label_ko}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({r.key}{r.instance != null ? ` ${r.instance}` : ""})
                    </span>
                  </span>
                  <span className="text-danger">{r.from} → {r.to}</span>
                </div>
              ))}
            </div>
          )}
        </DataPanel>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>점검 추가</DialogTitle>
          </DialogHeader>
          <form action={createAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">점검 유형</Label>
              <select id="type" name="type" className={selectClassName}>
                <option value="move_in">입주 점검</option>
                <option value="move_out">퇴거 점검</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspected_at">점검 일시</Label>
              <Input id="inspected_at" name="inspected_at" type="date" required />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <SubmitButton label="작성 시작" />
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `pnpm --filter crm lint`
Expected: no new errors. (If `Button` has no `render` prop in this codebase, use
`asChild`-style or wrap with `<Link>`; confirm against
`leases/[id]/_components/inspections.tsx` which already uses base-ui `render` on
`PopoverTrigger` — `Button` here can be replaced with a plain
`<Link className="...">` styled as a button if needed.)

- [ ] **Step 3: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/_components/inspections.tsx"
git commit -m "feat(inspection): tenant-page inspection list + comparison tab"
```

---

## Task 12: Wire the tenant page to the new components; remove lease-page tab; delete placeholder

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx`
- Modify: `apps/crm/src/app/(dashboard)/leases/[id]/_detail.tsx`
- Modify: `apps/crm/src/app/(dashboard)/leases/_actions.ts`
- Delete: `apps/crm/src/app/(dashboard)/leases/[id]/_components/inspections.tsx`

**Interfaces:**
- Consumes `<Inspections>` (Task 11). The tenant page's inspection query must
  also select `status` and the `property_id` from the bound lease.

- [ ] **Step 1: Update the tenant detail import**

In `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx` replace line 48:

```ts
import { Inspections } from "../../leases/[id]/_components/inspections";
```

with:

```ts
import { Inspections } from "../_components/inspections";
```

- [ ] **Step 2: Update the inspection query to select `status`**

In the same file (~lines 366-383), add `"status"` to the inspection `.select([…])`
list:

```ts
        db
          .selectFrom("inspection")
          .select([
            "id",
            "type",
            "status",
            "inspected_at",
            "checklist",
            "summary",
          ])
          .where("lease_id", "=", inspectionLease.id)
          .orderBy("inspected_at", "desc")
          .execute()
```

(`participants` is no longer used by the new component; drop it from the select.)

- [ ] **Step 3: Replace the inspection tab content**

In the same file (~lines 764-789), replace the inspection tab `content` with the
new component props (tenantId/leaseId/propertyId), keeping the no-lease empty
state inside the component:

```tsx
        {
          key: "inspections",
          label: "입주/퇴거 점검",
          count: inspections.length,
          content: (
            <Inspections
              tenantId={numId}
              leaseId={inspectionLease?.id ?? null}
              propertyId={inspectionLease?.property_id ?? null}
              inspections={inspections.map((i) => ({
                id: i.id,
                type: i.type,
                status: i.status,
                summary: i.summary,
                checklist: i.checklist,
                inspected_at:
                  i.inspected_at instanceof Date
                    ? i.inspected_at.toISOString()
                    : String(i.inspected_at),
              }))}
            />
          ),
        },
```

Remove the now-unused `staffOptions` / `tenantOptions` derivation only if nothing
else uses them (search the file — they were only for the old `<Inspections>`;
the `staffUsers` query and `tenantOptions` block at ~382-395 can be removed if
unreferenced; keep `staffUsers` if other tabs use it). Verify with lint.

- [ ] **Step 4: Remove the lease-page inspection tab**

In `apps/crm/src/app/(dashboard)/leases/[id]/_detail.tsx`:
- Delete the import at line 21 (`import { Inspections } …`).
- Delete the `inspections` data load (the `.selectFrom("inspection")…` block near
  line 171 and the `inspections,` destructure near line 83).
- Delete the entire `{ key: "inspections", … }` tab object (~428-444).

- [ ] **Step 5: Remove the old lease actions**

In `apps/crm/src/app/(dashboard)/leases/_actions.ts`, delete `addInspection`
(~599-657) and `deleteInspection` (~659-664) and the now-unused
`seoulDateString` import **only if** it is unreferenced elsewhere in the file
(grep first; keep it if other actions use it).

- [ ] **Step 6: Delete the placeholder component**

```bash
git rm "apps/crm/src/app/(dashboard)/leases/[id]/_components/inspections.tsx"
```

- [ ] **Step 7: Verify no dead references**

Run:
```bash
grep -rn "leases/\[id\]/_components/inspections\|addInspection\|p_staff\|p_housing" apps/crm/src
```
Expected: no matches (all old references gone).

Run: `pnpm --filter crm lint && pnpm --filter crm build`
Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx" "apps/crm/src/app/(dashboard)/leases/[id]/_detail.tsx" "apps/crm/src/app/(dashboard)/leases/_actions.ts"
git commit -m "refactor(inspection): consolidate onto tenant page, remove lease-page placeholder"
```

---

## Task 13: End-to-end verification

**Files:** none (manual + automated checks).

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm --filter crm test`
Expected: all tests pass, including the new `src/lib/inspection/*.test.ts`.

- [ ] **Step 2: Lint + build**

Run: `pnpm --filter crm lint && pnpm --filter crm build`
Expected: clean.

- [ ] **Step 3: Settings template**

Open `/settings/inspection-checklist`. Confirm all 9 seeded sections + items
render. Edit the master (add an item to 안방). Confirm it does NOT alter an
existing inspection.

- [ ] **Step 4: Create + fill a move-in inspection**

On a tenant with a lease, open the 입주/퇴거 점검 tab → 점검 추가 → 입주 점검.
Confirm the editor opens with rooms instantiated from the property's
`rooms`/`bathrooms`. Set item statuses + notes; attach an item photo (desktop)
and a general-gallery photo; add a 임차인/점검자 서명. 임시 저장, reload, confirm
state persists. 완료 → confirm property status flips to `occupied` and the list
shows the card with issue/damage counts.

- [ ] **Step 5: Move-out + comparison**

Create a 퇴거 점검; set some items worse than move-in. Confirm the
입주 ↔ 퇴거 비교 panel lists the worsened items, and 완료 sets property
`move_out` + `moveout_date`.

- [ ] **Step 6: Photo auth + cleanup**

Confirm thumbnails load via `/api/documents/{id}`; a logged-out fetch of that URL
returns 401. Delete a photo (blob + row gone). Delete a whole inspection;
confirm its photos/blobs are removed (no orphans) and the lease page no longer
shows an inspection tab.

- [ ] **Step 7: Legacy tolerance**

If any pre-existing inspection rows exist with the flat checklist, confirm the
list still renders them (parsed as a single 기타 section) without crashing.

---

## Self-review notes (coverage vs spec)

- Spec §1 data model → Task 1 (tables + `status`), Task 2 (snapshot types/shapes).
- Spec §2 seeding → Task 1 seed (full appendix transcription).
- Spec §3 Settings editor → Tasks 6–7.
- Spec §4 draft→finalize editor → Tasks 8 + 10.
- Spec §5 photos (per-item + general gallery) → Tasks 5, 9, 10.
- Spec §6 signatures → Task 10 (typed name + `signed_at`).
- Spec §7 tenant-page placement + lease-page removal → Tasks 11–12.
- Spec §8 actions → Task 8.
- Spec §9 status side effect on finalize → Task 8 (`finalizeInspection`).
- Spec §10 comparison → Task 3 (`compareInspections`) + Task 11 (UI).
- Spec backward-compat → Task 3 (`parseSnapshot`) + Task 13 step 7.
- Deferred (TODO, NOT in this plan): print/PDF output, 비품-registry
  auto-population of 가전 및 가구, drawn signatures.
