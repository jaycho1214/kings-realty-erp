# 계약서 일괄 등록 (Lease Intake Dialog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one dialog that creates 임대인(+family) + 매물 + 임차인 + 계약 together from a filled lease agreement, reusing existing records or creating new ones.

**Architecture:** A pure, unit-tested parser (`lib/lease-intake.ts`) turns the dialog's FormData into a normalized plan; a single server action (`createLeaseIntake`) performs all DB writes in one transaction. The dialog is a client component opened from the Tenants page header. A migration adds `rrn_encrypted` to `landlord_family_member` so every co-lessor's RRN can be stored, and the landlord detail page gains a reveal control for them.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Kysely + Postgres, better-auth, shadcn/ui, `node --test` + `tsx` for unit tests.

## Global Constraints

- Source of truth for fields: HQ IMHM Form 1057EK-R. 임차인 = exactly one; 임대인 = one `landlord` row + N `landlord_family_member` rows (family co-lessors).
- RRN (주민번호/KID#) is admin/accounting only — gated by `canViewSensitive(role)`; encrypt with `encryptRrn` from `@/lib/rrn`. Never import `@/lib/rrn` into a client component (pulls in `node:crypto`).
- Unit tests use `node --test` over **pure** modules only (no DB, no `@/` server imports). New test files must be added to the `crm` package `test` script.
- All user-facing strings/errors in Korean, matching the existing actions.
- New DB columns: nullable, additive. Migrations auto-discovered from `packages/db/src/migrations` by filename order — next index is `022`.
- Money columns are `Numeric` → pass as strings. Date columns are `date` → the action converts `start_date`/`end_date` strings to `Date`.

---

### Task 1: Migration — `rrn_encrypted` on `landlord_family_member`

**Files:**

- Create: `packages/db/src/migrations/022_landlord_family_rrn.ts`
- Modify (regenerated): `packages/db/src/types.ts`

**Interfaces:**

- Produces: `landlord_family_member.rrn_encrypted` column; `LandlordFamilyMember.rrn_encrypted: string | null` in types.

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/022_landlord_family_rrn.ts`:

```ts
import type { Kysely } from "kysely";

/**
 * 공동 임대인(가족)의 주민등록번호를 저장하기 위한 컬럼. 대표 임대인의
 * landlord.rrn_encrypted 와 동일하게 암호화하여 보관한다(평문 저장 금지).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("landlord_family_member")
    .addColumn("rrn_encrypted", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("landlord_family_member")
    .dropColumn("rrn_encrypted")
    .execute();
}
```

- [ ] **Step 2: Run the migration**

Run: `pnpm db:migrate`
Expected: `↑ 022_landlord_family_rrn: Success` then `Done.`

- [ ] **Step 3: Regenerate types**

Run: `pnpm db:generate`
Expected: `packages/db/src/types.ts` updates so the `LandlordFamilyMember` interface gains `rrn_encrypted: string | null;`.

> If `db:generate` cannot reach a database in this environment, edit `packages/db/src/types.ts` by hand: add `rrn_encrypted: string | null;` to the `LandlordFamilyMember` interface (keep the alphabetical field order used by the codegen).

- [ ] **Step 4: Verify the column is in types**

Run: `grep -n "rrn_encrypted" packages/db/src/types.ts`
Expected: two matches — one under `Landlord`, one under `LandlordFamilyMember`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/022_landlord_family_rrn.ts packages/db/src/types.ts
git commit -m "feat(db): add rrn_encrypted to landlord_family_member"
```

---

### Task 2: Pure date helpers `addMonths` / `monthsBetween`

**Files:**

- Modify: `apps/crm/src/lib/date.ts`
- Test: `apps/crm/src/lib/date.test.ts`

**Interfaces:**

- Produces: `addMonths(dateStr: string, months: number): string` (clamps end-of-month overflow); `monthsBetween(startStr: string, endStr: string): number`. Both operate on `"YYYY-MM-DD"` strings.

- [ ] **Step 1: Write the failing tests**

Append to `apps/crm/src/lib/date.test.ts` (use the import style already at the top of that file — `node:test` + `node:assert/strict` — and add `addMonths, monthsBetween` to the existing import from `./date`):

```ts
test("addMonths adds whole months keeping the day", () => {
  assert.equal(addMonths("2026-01-15", 12), "2027-01-15");
});

test("addMonths clamps an overflowing day to the month's last day", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});

test("monthsBetween counts calendar months end minus start", () => {
  assert.equal(monthsBetween("2026-01-15", "2027-01-15"), 12);
  assert.equal(monthsBetween("2026-03-01", "2026-09-01"), 6);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test apps/crm/src/lib/date.test.ts`
Expected: FAIL — `addMonths is not a function` (or import error).

- [ ] **Step 3: Implement the helpers**

Append to `apps/crm/src/lib/date.ts`:

```ts
/**
 * Add whole months to a "YYYY-MM-DD" date, clamping the day to the target
 * month's last day so an out-of-range day never rolls into the next month
 * (e.g. 2026-01-31 + 1 month → 2026-02-28, not 2026-03-03).
 */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().split("T")[0];
}

/** Whole calendar months between two "YYYY-MM-DD" dates (end − start). */
export function monthsBetween(startStr: string, endStr: string): number {
  const [sy, sm] = startStr.split("-").map(Number);
  const [ey, em] = endStr.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test apps/crm/src/lib/date.test.ts`
Expected: PASS (all date tests, including the three new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/crm/src/lib/date.ts apps/crm/src/lib/date.test.ts
git commit -m "feat(date): add addMonths/monthsBetween string helpers"
```

---

### Task 3: Pure parser `parseLeaseIntake`

**Files:**

- Create: `apps/crm/src/lib/lease-intake.ts`
- Test: `apps/crm/src/lib/lease-intake.test.ts`
- Modify: `apps/crm/package.json` (add the test file to the `test` script)

**Interfaces:**

- Produces:
  - `parseLeaseIntake(formData: FormData, opts: { canViewRrn: boolean }): LeaseIntakePlan`
  - Types `LeaseIntakePlan`, `LandlordPlan`, `PropertyPlan`, `TenantPlan`, `LeaseTermsPlan`, `CoLessorInput` (exact shapes in Step 3). The action in Task 4 consumes these.
- FormData contract (field names the dialog in Task 5 must emit):
  - modes: `landlord_mode`, `property_mode`, `tenant_mode` ∈ `existing|new`
  - existing ids: `landlord_id`, `property_id`, `tenant_id`
  - new landlord: `landlord_name`, `landlord_phone`, `landlord_email`, `landlord_address`, `landlord_rrn`; co-lessors `lessor[i].name`, `lessor[i].relationship`, `lessor[i].phone`, `lessor[i].rrn`
  - new property: `property_address`, `property_size_pyeong`, `property_type`
  - new tenant: `tenant_name`, `tenant_phone`, `tenant_rank`, `tenant_military_id`, `tenant_unit`, `tenant_email`, `base_location_id`
  - terms: `start_date`, `end_date`, `monthly_rent_krw`, `deposit_krw`, `notes`

- [ ] **Step 1: Write the failing tests**

Create `apps/crm/src/lib/lease-intake.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLeaseIntake } from "./lease-intake";

function base(): FormData {
  const fd = new FormData();
  fd.set("property_mode", "new");
  fd.set("property_address", "평택시 …");
  fd.set("property_type", "apartment");
  fd.set("landlord_mode", "new");
  fd.set("landlord_name", "홍길동");
  fd.set("landlord_phone", "010-1111-2222");
  fd.set("tenant_mode", "new");
  fd.set("tenant_name", "John Doe");
  fd.set("tenant_phone", "010-3333-4444");
  fd.set("base_location_id", "1");
  fd.set("start_date", "2026-07-01");
  fd.set("end_date", "2027-07-01");
  fd.set("monthly_rent_krw", "1500000");
  fd.set("deposit_krw", "10000000");
  return fd;
}

test("new/new/new builds create plans for all entities", () => {
  const plan = parseLeaseIntake(base(), { canViewRrn: true });
  assert.equal(plan.property.mode, "new");
  assert.equal(plan.landlord?.mode, "new");
  assert.equal(plan.tenant.mode, "new");
  assert.equal(plan.terms.monthlyRentKrw, "1500000");
});

test("existing property drops the landlord plan (landlord = null)", () => {
  const fd = base();
  fd.set("property_mode", "existing");
  fd.set("property_id", "42");
  const plan = parseLeaseIntake(fd, { canViewRrn: true });
  assert.deepEqual(plan.property, { mode: "existing", propertyId: 42 });
  assert.equal(plan.landlord, null);
});

test("existing tenant uses the id", () => {
  const fd = base();
  fd.set("tenant_mode", "existing");
  fd.set("tenant_id", "7");
  const plan = parseLeaseIntake(fd, { canViewRrn: true });
  assert.deepEqual(plan.tenant, { mode: "existing", tenantId: 7 });
});

test("co-lessors are collected; blank rows skipped; loop stops at first absent", () => {
  const fd = base();
  fd.set("landlord_rrn", "900101-1234567");
  fd.set("lessor[0].name", "김영희");
  fd.set("lessor[0].relationship", "spouse");
  fd.set("lessor[0].phone", "010-5555-6666");
  fd.set("lessor[0].rrn", "910202-2345678");
  fd.set("lessor[1].name", "   "); // blank → skipped
  fd.set("lessor[2].name", "이철수"); // present but index 1 absent? indices contiguous in UI
  const plan = parseLeaseIntake(fd, { canViewRrn: true });
  assert.equal(plan.landlord?.mode, "new");
  const L = plan.landlord as Extract<typeof plan.landlord, { mode: "new" }>;
  assert.equal(L.rrn, "900101-1234567");
  assert.equal(L.coLessors.length, 1);
  assert.equal(L.coLessors[0].name, "김영희");
  assert.equal(L.coLessors[0].rrn, "910202-2345678");
});

test("RRN is dropped entirely when canViewRrn is false", () => {
  const fd = base();
  fd.set("landlord_rrn", "900101-1234567");
  fd.set("lessor[0].name", "김영희");
  fd.set("lessor[0].rrn", "910202-2345678");
  const plan = parseLeaseIntake(fd, { canViewRrn: false });
  const L = plan.landlord as Extract<typeof plan.landlord, { mode: "new" }>;
  assert.equal(L.rrn, null);
  assert.equal(L.coLessors[0].rrn, null);
});

test("missing required fields throw Korean errors", () => {
  const fd = base();
  fd.delete("landlord_name");
  assert.throws(
    () => parseLeaseIntake(fd, { canViewRrn: true }),
    /임대인 성명/,
  );

  const fd2 = base();
  fd2.set("property_mode", "existing");
  // no property_id
  assert.throws(
    () => parseLeaseIntake(fd2, { canViewRrn: true }),
    /매물을 선택/,
  );

  const fd3 = base();
  fd3.set("monthly_rent_krw", "abc");
  assert.throws(() => parseLeaseIntake(fd3, { canViewRrn: true }), /월세/);
});
```

- [ ] **Step 2: Add the test file to the package test script, then run to verify it fails**

In `apps/crm/package.json`, change the `test` script to append the new file:

```json
"test": "node --import tsx --test src/lib/date.test.ts src/lib/tasks/board.test.ts src/lib/tasks/suggestions.test.ts src/lib/lease-intake.test.ts"
```

Run: `node --import tsx --test apps/crm/src/lib/lease-intake.test.ts`
Expected: FAIL — cannot find module `./lease-intake`.

- [ ] **Step 3: Implement the parser**

Create `apps/crm/src/lib/lease-intake.ts`:

```ts
/**
 * Pure parser for the 계약서 일괄 등록 dialog. Turns the dialog's FormData into a
 * normalized plan the createLeaseIntake server action can execute. No DB, no
 * crypto, no `@/` imports — kept pure so it is unit-testable with `node --test`.
 *
 * RRN values are passed through RAW here (never encrypted) and only when
 * opts.canViewRrn is true; the server action encrypts them with encryptRrn.
 */

export interface CoLessorInput {
  name: string;
  relationship: string;
  phone: string | null;
  rrn: string | null;
}

export type LandlordPlan =
  | { mode: "existing"; landlordId: number }
  | {
      mode: "new";
      name: string;
      phone: string;
      email: string | null;
      address: string | null;
      rrn: string | null;
      coLessors: CoLessorInput[];
    };

export type PropertyPlan =
  | { mode: "existing"; propertyId: number }
  | {
      mode: "new";
      address: string;
      sizePyeong: number | null;
      propertyType: string;
    };

export type TenantPlan =
  | { mode: "existing"; tenantId: number }
  | {
      mode: "new";
      name: string;
      phone: string;
      rank: string | null;
      militaryId: string | null;
      unit: string | null;
      email: string | null;
      baseLocationId: number;
    };

export interface LeaseTermsPlan {
  startDate: string;
  endDate: string;
  monthlyRentKrw: string;
  depositKrw: string;
  notes: string | null;
}

export interface LeaseIntakePlan {
  /** null when property.mode === "existing" (landlord comes from the property). */
  landlord: LandlordPlan | null;
  property: PropertyPlan;
  tenant: TenantPlan;
  terms: LeaseTermsPlan;
}

const PROPERTY_TYPES = new Set(["apartment", "house", "officetel", "villa"]);

export function parseLeaseIntake(
  formData: FormData,
  opts: { canViewRrn: boolean },
): LeaseIntakePlan {
  const str = (k: string): string => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const strOrNull = (k: string): string | null => str(k) || null;
  const posInt = (k: string): number => {
    const n = Number(str(k));
    return Number.isInteger(n) && n > 0 ? n : 0;
  };

  // --- Property (parsed first; decides whether a landlord plan is needed) ---
  let property: PropertyPlan;
  if (str("property_mode") === "existing") {
    const propertyId = posInt("property_id");
    if (!propertyId) throw new Error("매물을 선택해주세요.");
    property = { mode: "existing", propertyId };
  } else {
    const address = str("property_address");
    if (!address) throw new Error("임대물건 주소를 입력해주세요.");
    const sizeRaw = str("property_size_pyeong");
    const sizePyeong = sizeRaw ? Number(sizeRaw) : null;
    if (sizePyeong !== null && !Number.isFinite(sizePyeong)) {
      throw new Error("평수를 숫자로 입력해주세요.");
    }
    const propertyType = str("property_type") || "apartment";
    if (!PROPERTY_TYPES.has(propertyType)) {
      throw new Error("매물 종류를 선택해주세요.");
    }
    property = { mode: "new", address, sizePyeong, propertyType };
  }

  // --- Landlord (only when creating a new property) ---
  let landlord: LandlordPlan | null = null;
  if (property.mode === "new") {
    if (str("landlord_mode") === "existing") {
      const landlordId = posInt("landlord_id");
      if (!landlordId) throw new Error("임대인을 선택해주세요.");
      landlord = { mode: "existing", landlordId };
    } else {
      const name = str("landlord_name");
      const phone = str("landlord_phone");
      if (!name) throw new Error("임대인 성명을 입력해주세요.");
      if (!phone) throw new Error("임대인 핸드폰을 입력해주세요.");
      const coLessors: CoLessorInput[] = [];
      for (let i = 0; ; i++) {
        const raw = formData.get(`lessor[${i}].name`);
        if (raw === null) break; // no more rows
        const cn = typeof raw === "string" ? raw.trim() : "";
        if (!cn) continue; // blank row → skip but keep scanning
        coLessors.push({
          name: cn,
          relationship: strOrNull(`lessor[${i}].relationship`) ?? "other",
          phone: strOrNull(`lessor[${i}].phone`),
          rrn: opts.canViewRrn ? strOrNull(`lessor[${i}].rrn`) : null,
        });
      }
      landlord = {
        mode: "new",
        name,
        phone,
        email: strOrNull("landlord_email"),
        address: strOrNull("landlord_address"),
        rrn: opts.canViewRrn ? strOrNull("landlord_rrn") : null,
        coLessors,
      };
    }
  }

  // --- Tenant ---
  let tenant: TenantPlan;
  if (str("tenant_mode") === "existing") {
    const tenantId = posInt("tenant_id");
    if (!tenantId) throw new Error("세입자를 선택해주세요.");
    tenant = { mode: "existing", tenantId };
  } else {
    const name = str("tenant_name");
    const phone = str("tenant_phone");
    if (!name) throw new Error("세입자 성명을 입력해주세요.");
    if (!phone) throw new Error("세입자 핸드폰을 입력해주세요.");
    const baseLocationId = posInt("base_location_id");
    if (!baseLocationId) throw new Error("기지를 선택해주세요.");
    tenant = {
      mode: "new",
      name,
      phone,
      rank: strOrNull("tenant_rank"),
      militaryId: strOrNull("tenant_military_id"),
      unit: strOrNull("tenant_unit"),
      email: strOrNull("tenant_email"),
      baseLocationId,
    };
  }

  // --- Terms ---
  const startDate = str("start_date");
  const endDate = str("end_date");
  if (!startDate || Number.isNaN(new Date(startDate).getTime())) {
    throw new Error("계약 시작일을 올바르게 입력해주세요.");
  }
  if (!endDate || Number.isNaN(new Date(endDate).getTime())) {
    throw new Error("계약 종료일을 올바르게 입력해주세요.");
  }
  const monthlyRentKrw = str("monthly_rent_krw");
  const depositKrw = str("deposit_krw");
  if (!monthlyRentKrw || !Number.isFinite(Number(monthlyRentKrw))) {
    throw new Error("월세를 숫자로 입력해주세요.");
  }
  if (!depositKrw || !Number.isFinite(Number(depositKrw))) {
    throw new Error("보증금을 숫자로 입력해주세요.");
  }

  return {
    landlord,
    property,
    tenant,
    terms: {
      startDate,
      endDate,
      monthlyRentKrw,
      depositKrw,
      notes: strOrNull("notes"),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test apps/crm/src/lib/lease-intake.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/crm/src/lib/lease-intake.ts apps/crm/src/lib/lease-intake.test.ts apps/crm/package.json
git commit -m "feat(lease): pure parseLeaseIntake parser with tests"
```

---

### Task 4: Server action `createLeaseIntake`

**Files:**

- Modify: `apps/crm/src/app/(dashboard)/leases/_actions.ts`

**Interfaces:**

- Consumes: `parseLeaseIntake` + plan types (Task 3); `encryptRrn` from `@/lib/rrn`; `canViewSensitive`, `requirePermission` from `@/lib/authz`; `getDb`.
- Produces: `createLeaseIntake(formData: FormData): Promise<void>` (a server action; redirects on success).

- [ ] **Step 1: Add imports**

At the top of `apps/crm/src/app/(dashboard)/leases/_actions.ts`, add to the existing imports:

```ts
import { canViewSensitive } from "@/lib/authz";
import { encryptRrn } from "@/lib/rrn";
import { parseLeaseIntake } from "@/lib/lease-intake";
```

(`requirePermission`, `getDb`, `revalidatePath`, `redirect` are already imported.)

- [ ] **Step 2: Implement the action**

Add this exported function to the same file (near `createLease`):

```ts
/**
 * 계약서 일괄 등록: 임대인(+공동 임대인) · 매물 · 임차인 · 계약을 한 트랜잭션으로
 * 생성한다. 각 섹션은 기존 레코드 재사용 또는 신규 생성 중 하나다. 신규 매물일
 * 때만 임대인을 생성/선택하며, 기존 매물이면 매물의 임대인을 그대로 쓴다.
 */
export async function createLeaseIntake(formData: FormData) {
  const session = await requirePermission("lease", "create");
  const canViewRrn = canViewSensitive(session.user.role);
  const plan = parseLeaseIntake(formData, { canViewRrn });

  // Permission for every entity this call will actually insert.
  if (plan.tenant.mode === "new") await requirePermission("tenant", "create");
  if (plan.property.mode === "new") {
    await requirePermission("property", "create");
    if (plan.landlord!.mode === "new") {
      await requirePermission("landlord", "create");
    }
  }

  const db = getDb();
  const userId = Number(session.user.id);
  let tenantId = 0;
  let propertyId = 0;

  await db.transaction().execute(async (trx) => {
    // 1. 임대인 (+ 공동 임대인) — only when creating a new property
    let landlordId = 0;
    if (plan.property.mode === "new") {
      const L = plan.landlord!;
      if (L.mode === "existing") {
        landlordId = L.landlordId;
      } else {
        const ins = await trx
          .insertInto("landlord")
          .values({
            name: L.name,
            phone: L.phone,
            email: L.email,
            address: L.address,
            rrn_encrypted: L.rrn ? encryptRrn(L.rrn) : null,
            created_by: userId,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        landlordId = ins.id;
        for (const c of L.coLessors) {
          await trx
            .insertInto("landlord_family_member")
            .values({
              landlord_id: landlordId,
              name: c.name,
              relationship: c.relationship,
              phone: c.phone,
              rrn_encrypted: c.rrn ? encryptRrn(c.rrn) : null,
            })
            .execute();
        }
      }
    }

    // 2. 매물
    if (plan.property.mode === "existing") {
      propertyId = plan.property.propertyId;
    } else {
      const P = plan.property;
      const ins = await trx
        .insertInto("property")
        .values({
          address: P.address,
          property_type: P.propertyType,
          size_pyeong: P.sizePyeong !== null ? String(P.sizePyeong) : null,
          monthly_rent_krw: plan.terms.monthlyRentKrw,
          deposit_krw: plan.terms.depositKrw,
          status: "occupied",
          landlord_id: landlordId,
          created_by: userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      propertyId = ins.id;
    }

    // 3. 임차인
    if (plan.tenant.mode === "existing") {
      tenantId = plan.tenant.tenantId;
    } else {
      const T = plan.tenant;
      const ins = await trx
        .insertInto("tenant")
        .values({
          name: T.name,
          phone: T.phone,
          rank: T.rank,
          military_id: T.militaryId,
          unit: T.unit,
          email: T.email,
          base_location_id: T.baseLocationId,
          status: "active",
          created_by: userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      tenantId = ins.id;
    }

    // 4. 계약 + status side-effects (same as createLease)
    await trx
      .insertInto("lease")
      .values({
        property_id: propertyId,
        tenant_id: tenantId,
        start_date: new Date(plan.terms.startDate),
        end_date: new Date(plan.terms.endDate),
        monthly_rent_krw: plan.terms.monthlyRentKrw,
        deposit_krw: plan.terms.depositKrw,
        status: "active",
        notes: plan.terms.notes,
        created_by: userId,
      })
      .execute();

    await trx
      .updateTable("property")
      .set({ status: "occupied", updated_at: new Date() })
      .where("id", "=", propertyId)
      .execute();
    await trx
      .updateTable("tenant")
      .set({ status: "active", updated_at: new Date() })
      .where("id", "=", tenantId)
      .execute();
  });

  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/tenants/${tenantId}`);
}
```

- [ ] **Step 3: Typecheck / lint the action**

Run: `pnpm --filter crm lint`
Expected: no errors in `_actions.ts` (warnings unrelated to this file are fine).

- [ ] **Step 4: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/leases/_actions.ts"
git commit -m "feat(lease): createLeaseIntake transactional action"
```

---

### Task 5: Intake dialog client component

**Files:**

- Create: `apps/crm/src/app/(dashboard)/leases/_components/lease-intake-dialog.tsx`

**Interfaces:**

- Consumes: `createLeaseIntake` (Task 4); `Combobox` (`@/components/combobox`); `PhoneInput`, `Field`, `FieldGroup`, `Input`, `Label`, `SubmitButton`, `Button`; `addMonths`/`monthsBetween`/`seoulDateString` from `@/lib/date`; `useCreateDialog` from `@/components/create-dialog`.
- Produces: `<LeaseIntakeForm landlords properties tenants baseLocations canViewRrn />` — a `variant="plain"` form intended to be wrapped by `CreateDialog` (Task 6).
- Props shape:

  ```ts
  {
    landlords: {
      id: number;
      name: string;
    }
    [];
    properties: {
      id: number;
      address: string;
      landlord_id: number;
    }
    [];
    tenants: {
      id: number;
      name: string;
      rank: string | null;
    }
    [];
    baseLocations: {
      id: number;
      name: string;
      name_ko: string | null;
    }
    [];
    canViewRrn: boolean;
  }
  ```

- [ ] **Step 1: Create the component**

Create `apps/crm/src/app/(dashboard)/leases/_components/lease-intake-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { PhoneInput } from "@/components/phone-input";
import { Combobox } from "@/components/combobox";
import { Plus, Trash2 } from "lucide-react";
import { addMonths, monthsBetween, seoulDateString } from "@/lib/date";
import { createLeaseIntake } from "../_actions";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

const PROPERTY_TYPES = [
  { value: "apartment", label: "아파트" },
  { value: "house", label: "주택" },
  { value: "officetel", label: "오피스텔" },
  { value: "villa", label: "빌라" },
];

const RELATIONSHIPS = [
  { value: "spouse", label: "배우자" },
  { value: "child", label: "자녀" },
  { value: "parent", label: "부모" },
  { value: "sibling", label: "형제자매" },
  { value: "other", label: "기타" },
];

interface IntakeProps {
  landlords: { id: number; name: string }[];
  properties: { id: number; address: string; landlord_id: number }[];
  tenants: { id: number; name: string; rank: string | null }[];
  baseLocations: { id: number; name: string; name_ko: string | null }[];
  canViewRrn: boolean;
}

type Mode = "new" | "existing";

function SectionToggle({
  mode,
  onChange,
  existingLabel,
  newLabel,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  existingLabel: string;
  newLabel: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-input p-0.5 text-sm">
      {(["existing", "new"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-md px-2.5 py-1 ${
            mode === m ? "bg-muted font-medium" : "text-muted-foreground"
          }`}
        >
          {m === "existing" ? existingLabel : newLabel}
        </button>
      ))}
    </div>
  );
}

export function LeaseIntakeForm({
  landlords,
  properties,
  tenants,
  baseLocations,
  canViewRrn,
}: IntakeProps) {
  const today = seoulDateString();

  const [propertyMode, setPropertyMode] = useState<Mode>("new");
  const [landlordMode, setLandlordMode] = useState<Mode>("new");
  const [tenantMode, setTenantMode] = useState<Mode>("new");

  const [coLessors, setCoLessors] = useState<number[]>([]);
  const [coSeq, setCoSeq] = useState(0);

  const [startDate, setStartDate] = useState(today);
  const [termMonths, setTermMonths] = useState<number | "">(12);
  const [endDate, setEndDate] = useState(addMonths(today, 12));

  const recalcEnd = (start: string, term: number | "") => {
    if (start && typeof term === "number" && term > 0) {
      setEndDate(addMonths(start, term));
    }
  };

  const landlordOptions = landlords.map((l) => ({
    value: String(l.id),
    label: l.name,
  }));
  const propertyOptions = properties.map((p) => ({
    value: String(p.id),
    label: p.address,
  }));
  const tenantOptions = tenants.map((t) => ({
    value: String(t.id),
    label: `${t.name}${t.rank ? ` (${t.rank})` : ""}`,
  }));

  return (
    <form action={createLeaseIntake}>
      <input type="hidden" name="property_mode" value={propertyMode} />
      <input type="hidden" name="landlord_mode" value={landlordMode} />
      <input type="hidden" name="tenant_mode" value={tenantMode} />

      <FieldGroup>
        {/* ── 임대인 ── (only when creating a new property) */}
        {propertyMode === "new" && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">임대인 (Lessor)</h3>
              <SectionToggle
                mode={landlordMode}
                onChange={setLandlordMode}
                existingLabel="기존 선택"
                newLabel="신규"
              />
            </div>

            {landlordMode === "existing" ? (
              <Combobox
                name="landlord_id"
                options={landlordOptions}
                placeholder="임대인 선택"
                searchPlaceholder="이름으로 검색..."
                emptyText="임대인을 찾을 수 없습니다"
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label htmlFor="landlord_name">
                      성명 <span className="text-danger">*</span>
                    </Label>
                    <Input id="landlord_name" name="landlord_name" required />
                  </Field>
                  <Field>
                    <Label htmlFor="landlord_phone">
                      핸드폰 <span className="text-danger">*</span>
                    </Label>
                    <PhoneInput name="landlord_phone" />
                  </Field>
                  <Field>
                    <Label htmlFor="landlord_email">이메일</Label>
                    <Input
                      id="landlord_email"
                      name="landlord_email"
                      type="email"
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="landlord_address">주소</Label>
                    <Input id="landlord_address" name="landlord_address" />
                  </Field>
                  {canViewRrn && (
                    <Field>
                      <Label htmlFor="landlord_rrn">KID# / 주민번호</Label>
                      <Input
                        id="landlord_rrn"
                        name="landlord_rrn"
                        placeholder="######-#######"
                        autoComplete="off"
                      />
                    </Field>
                  )}
                </div>

                {/* 공동 임대인 (가족) */}
                <div className="space-y-2">
                  {coLessors.map((id, i) => (
                    <div
                      key={id}
                      className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_1fr_auto]"
                    >
                      <Input
                        name={`lessor[${i}].name`}
                        placeholder="공동 임대인 성명"
                        required
                      />
                      <select
                        name={`lessor[${i}].relationship`}
                        defaultValue="spouse"
                        className={selectClassName}
                      >
                        {RELATIONSHIPS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <PhoneInput
                        name={`lessor[${i}].phone`}
                        placeholder="핸드폰"
                      />
                      <div className="flex gap-1">
                        {canViewRrn && (
                          <Input
                            name={`lessor[${i}].rrn`}
                            placeholder="주민번호"
                            autoComplete="off"
                            className="w-36"
                          />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setCoLessors((xs) => xs.filter((x) => x !== id))
                          }
                          aria-label="공동 임대인 삭제"
                          className="text-muted-foreground hover:text-danger"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCoLessors((xs) => [...xs, coSeq]);
                      setCoSeq((n) => n + 1);
                    }}
                  >
                    <Plus className="size-4" /> 공동 임대인 (가족) 추가
                  </Button>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── 매물 ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">매물 (Property)</h3>
            <SectionToggle
              mode={propertyMode}
              onChange={setPropertyMode}
              existingLabel="기존 선택"
              newLabel="신규"
            />
          </div>
          {propertyMode === "existing" ? (
            <Combobox
              name="property_id"
              options={propertyOptions}
              placeholder="매물 선택"
              searchPlaceholder="주소로 검색..."
              emptyText="매물을 찾을 수 없습니다"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <Label htmlFor="property_address">
                  임대물건 주소 <span className="text-danger">*</span>
                </Label>
                <Input id="property_address" name="property_address" required />
              </Field>
              <Field>
                <Label htmlFor="property_size_pyeong">평수</Label>
                <Input
                  id="property_size_pyeong"
                  name="property_size_pyeong"
                  type="number"
                  min={0}
                  step="0.1"
                />
              </Field>
              <Field>
                <Label htmlFor="property_type">종류</Label>
                <select
                  id="property_type"
                  name="property_type"
                  defaultValue="apartment"
                  className={selectClassName}
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </section>

        {/* ── 임차인 ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">임차인 (Lessee)</h3>
            <SectionToggle
              mode={tenantMode}
              onChange={setTenantMode}
              existingLabel="기존 선택"
              newLabel="신규"
            />
          </div>
          {tenantMode === "existing" ? (
            <Combobox
              name="tenant_id"
              options={tenantOptions}
              placeholder="세입자 선택"
              searchPlaceholder="이름으로 검색..."
              emptyText="세입자를 찾을 수 없습니다"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <Label htmlFor="tenant_name">
                  성명 <span className="text-danger">*</span>
                </Label>
                <Input id="tenant_name" name="tenant_name" required />
              </Field>
              <Field>
                <Label htmlFor="tenant_phone">
                  핸드폰 <span className="text-danger">*</span>
                </Label>
                <PhoneInput name="tenant_phone" />
              </Field>
              <Field>
                <Label htmlFor="tenant_rank">Rank/Grade</Label>
                <Input id="tenant_rank" name="tenant_rank" />
              </Field>
              <Field>
                <Label htmlFor="tenant_military_id">DODID</Label>
                <Input id="tenant_military_id" name="tenant_military_id" />
              </Field>
              <Field>
                <Label htmlFor="tenant_unit">소속/Unit</Label>
                <Input id="tenant_unit" name="tenant_unit" />
              </Field>
              <Field>
                <Label htmlFor="tenant_email">이메일</Label>
                <Input id="tenant_email" name="tenant_email" type="email" />
              </Field>
              <Field>
                <Label htmlFor="base_location_id">
                  기지 <span className="text-danger">*</span>
                </Label>
                <select
                  id="base_location_id"
                  name="base_location_id"
                  defaultValue={
                    baseLocations[0] ? String(baseLocations[0].id) : ""
                  }
                  className={selectClassName}
                  required
                >
                  {baseLocations.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_ko ?? b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </section>

        {/* ── 계약 조건 ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">계약 조건 (Terms)</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <Label htmlFor="start_date">
                시작일 <span className="text-danger">*</span>
              </Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  recalcEnd(e.target.value, termMonths);
                }}
              />
            </Field>
            <Field>
              <Label htmlFor="term_months">계약기간 (개월)</Label>
              <Input
                id="term_months"
                type="number"
                min={1}
                max={120}
                value={termMonths}
                onChange={(e) => {
                  const v = e.target.value === "" ? "" : Number(e.target.value);
                  setTermMonths(v);
                  recalcEnd(startDate, v);
                }}
              />
            </Field>
            <Field>
              <Label htmlFor="end_date">
                종료일 <span className="text-danger">*</span>
              </Label>
              <Input
                id="end_date"
                name="end_date"
                type="date"
                required
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (startDate && e.target.value) {
                    setTermMonths(monthsBetween(startDate, e.target.value));
                  }
                }}
              />
            </Field>
            <Field>
              <Label htmlFor="monthly_rent_krw">
                월세 (₩) <span className="text-danger">*</span>
              </Label>
              <Input
                id="monthly_rent_krw"
                name="monthly_rent_krw"
                type="number"
                min={0}
                required
                placeholder="0"
              />
            </Field>
            <Field>
              <Label htmlFor="deposit_krw">
                보증금 (₩) <span className="text-danger">*</span>
              </Label>
              <Input
                id="deposit_krw"
                name="deposit_krw"
                type="number"
                min={0}
                required
                placeholder="0"
              />
            </Field>
          </div>
          <Field>
            <Label htmlFor="notes">특별조항 / 비고</Label>
            <Input id="notes" name="notes" placeholder="특별 조항" />
          </Field>
        </section>

        <div className="flex justify-end pt-1">
          <SubmitButton label="등록" />
        </div>
      </FieldGroup>
    </form>
  );
}
```

- [ ] **Step 2: Lint / typecheck the component**

Run: `pnpm --filter crm lint`
Expected: no errors in `lease-intake-dialog.tsx`. (If `Field` does not accept a `className` prop in this codebase, wrap the address field in a `<div className="sm:col-span-2">` instead — check `@/components/ui/field`.)

- [ ] **Step 3: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/leases/_components/lease-intake-dialog.tsx"
git commit -m "feat(lease): intake dialog form component"
```

---

### Task 6: Wire the intake dialog into the Tenants page header

**Files:**

- Modify: `apps/crm/src/app/(dashboard)/tenants/page.tsx`

**Interfaces:**

- Consumes: `LeaseIntakeForm` (Task 5); `CreateDialog` (already used on this page); `canViewSensitive` from `@/lib/authz`.

- [ ] **Step 1: Add imports**

At the top of `apps/crm/src/app/(dashboard)/tenants/page.tsx`, add:

```ts
import { LeaseIntakeForm } from "../leases/_components/lease-intake-dialog";
import { canViewSensitive } from "@/lib/authz";
```

(Confirm `CreateDialog` is already imported — it is, since the page renders "새 세입자".)

- [ ] **Step 2: Load the combobox data + canViewRrn**

In the page's existing `Promise.all([...])` (the one that already loads `base_location`), add three queries so the result becomes `[tenants, totalResult, baseLocations, landlordsList, propertiesList, tenantsList]`:

```ts
db.selectFrom("landlord").select(["id", "name"]).orderBy("name", "asc").execute(),
db
  .selectFrom("property")
  .select(["id", "address", "landlord_id"])
  .orderBy("address", "asc")
  .execute(),
db
  .selectFrom("tenant")
  .select(["id", "name", "rank"])
  .where("status", "=", "active")
  .orderBy("name", "asc")
  .execute(),
```

Then, near where the page derives the current user's role (the existing `admin` value), add:

```ts
const canViewRrn = canViewSensitive(session.user.role);
```

> If the page does not already hold a `session`, fetch it the same way the sibling pages do — `const session = await getSession();` from `@/lib/session` — and reuse it for both `admin` and `canViewRrn`.

- [ ] **Step 3: Add the header button next to "새 세입자"**

In the `PageHeader` `actions` prop, wrap the existing dialog and the new one in a fragment:

```tsx
actions={
  <div className="flex gap-2">
    <CreateDialog title="계약서로 등록" buttonLabel="계약서로 등록" wide closeOnSuccess>
      <LeaseIntakeForm
        landlords={landlordsList}
        properties={propertiesList}
        tenants={tenantsList}
        baseLocations={baseLocations}
        canViewRrn={canViewRrn}
      />
    </CreateDialog>
    <CreateDialog title="새 세입자" buttonLabel="새 세입자" wide>
      <TenantForm variant="plain" baseLocations={baseLocations} />
    </CreateDialog>
  </div>
}
```

- [ ] **Step 4: Verify build/lint + manual smoke**

Run: `pnpm --filter crm lint`
Expected: no errors in `tenants/page.tsx`.

Manual: start the app (`pnpm --filter crm dev`), open `/tenants`, click **계약서로 등록**. Fill new 임대인 (add one 공동 임대인) + new 매물 + new 임차인 + terms, submit. Confirm you land on the new tenant's detail page with the lease shown, and that the property and landlord exist. Repeat with "기존 선택" for an existing tenant.

- [ ] **Step 5: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/page.tsx"
git commit -m "feat(tenants): 계약서로 등록 header action opens lease intake dialog"
```

---

### Task 7: Reveal co-lessor RRN on the landlord detail page

**Files:**

- Modify: `apps/crm/src/app/(dashboard)/landlords/_actions.ts`
- Modify: `apps/crm/src/app/(dashboard)/landlords/[id]/_detail.tsx`
- Modify: `apps/crm/src/app/(dashboard)/landlords/_components/landlord-family-members.tsx`

**Interfaces:**

- Produces: `revealLandlordFamilyMemberRrn(id: number): Promise<{ rrn: string } | { error: string }>`.
- `LandlordFamilyMembers` gains props `canViewRrn: boolean` and `members[].hasRrn: boolean`.

- [ ] **Step 1: Add the reveal action**

In `apps/crm/src/app/(dashboard)/landlords/_actions.ts`, add (mirrors `revealLandlordRrn`):

```ts
/**
 * Decrypt and return a co-lessor (landlord family member)'s RRN. Admin/
 * accounting only; every reveal is audit-logged.
 */
export async function revealLandlordFamilyMemberRrn(
  id: number,
): Promise<{ rrn: string } | { error: string }> {
  const session = await requireSensitiveAccess();
  const db = getDb();

  const row = await db
    .selectFrom("landlord_family_member")
    .select(["rrn_encrypted"])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row?.rrn_encrypted) {
    return { error: "등록된 주민등록번호가 없습니다." };
  }

  let plain: string;
  try {
    plain = decryptRrn(row.rrn_encrypted);
  } catch {
    return { error: "복호화에 실패했습니다." };
  }

  await logAudit({
    actorId: Number(session.user.id),
    action: "landlord_family_member.rrn.reveal",
    entityType: "landlord_family_member",
    entityId: id,
  });

  return { rrn: formatRrn(plain) };
}
```

(`requireSensitiveAccess`, `decryptRrn`, `formatRrn`, `logAudit`, `getDb` are already imported in this file.)

- [ ] **Step 2: Pass RRN presence + canViewRrn from the detail page**

In `apps/crm/src/app/(dashboard)/landlords/[id]/_detail.tsx`, the family-member query (around line 91) selects member fields. Add `rrn_encrypted` to that select, then map to a `hasRrn` boolean before rendering so the encrypted blob never reaches the client:

```ts
// in the .select([...]) for landlord_family_member, add:
"landlord_family_member.rrn_encrypted",
```

Where `<LandlordFamilyMembers .../>` is rendered, pass the derived members and the existing `canViewRrn`:

```tsx
<LandlordFamilyMembers
  landlordId={numId}
  canViewRrn={canViewRrn}
  members={familyMembers.map((m) => ({
    id: m.id,
    name: m.name,
    relationship: m.relationship,
    sex: m.sex,
    phone: m.phone,
    notes: m.notes,
    hasRrn: !!m.rrn_encrypted,
  }))}
/>
```

(`canViewRrn` already exists in this file — see `const canViewRrn = canViewSensitive(...)`.)

- [ ] **Step 3: Add the RRN column + reveal control to the family table**

In `apps/crm/src/app/(dashboard)/landlords/_components/landlord-family-members.tsx`:

1. Extend the interface and props:

```ts
interface FamilyMember {
  id: number;
  name: string;
  relationship: string;
  sex: string | null;
  phone: string | null;
  notes: string | null;
  hasRrn: boolean;
}

interface LandlordFamilyMembersProps {
  landlordId: number;
  members: FamilyMember[];
  canViewRrn: boolean;
}
```

2. Add the imports + inline mask + a small reveal subcomponent (RRN crypto stays server-side; only the action is called):

```tsx
import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  addLandlordFamilyMember,
  deleteLandlordFamilyMember,
  revealLandlordFamilyMemberRrn,
} from "../_actions";

const RRN_MASK = "●●●●●●-●●●●●●●";

function FamilyMemberRrn({
  memberId,
  hasRrn,
}: {
  memberId: number;
  hasRrn: boolean;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!hasRrn) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{revealed ?? RRN_MASK}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={revealed ? "주민등록번호 가리기" : "주민등록번호 보기"}
        onClick={() => {
          if (revealed) {
            setRevealed(null);
            return;
          }
          setError(null);
          startTransition(async () => {
            const res = await revealLandlordFamilyMemberRrn(memberId);
            if ("rrn" in res) setRevealed(res.rrn);
            else setError(res.error);
          });
        }}
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
```

3. In the table header add a 주민번호 column (only when `canViewRrn`), and a matching cell per row. Bump the empty-state `colSpan` to `canViewRrn ? 7 : 6`:

```tsx
{
  /* header: after the 전화번호 <TableHead> */
}
{
  canViewRrn && <TableHead>주민번호</TableHead>;
}
```

```tsx
{
  /* body: after the phone <TableCell> */
}
{
  canViewRrn && (
    <TableCell className="tabular text-muted-foreground">
      <FamilyMemberRrn memberId={member.id} hasRrn={member.hasRrn} />
    </TableCell>
  );
}
```

4. In the "add family member" form, add an RRN input when `canViewRrn` so members added here can also carry an RRN:

```tsx
{
  canViewRrn && (
    <Input
      name="rrn"
      placeholder="주민번호"
      autoComplete="off"
      className="w-36"
    />
  );
}
```

- [ ] **Step 4: Persist RRN from the add-family-member form**

In `apps/crm/src/app/(dashboard)/landlords/_actions.ts`, update `addLandlordFamilyMember` to encrypt the optional RRN when the caller is privileged:

```ts
export async function addLandlordFamilyMember(
  landlordId: number,
  formData: FormData,
) {
  const session = await requireUser();
  const db = getDb();

  const name = formData.get("name") as string;
  const relationship = formData.get("relationship") as string;
  const sex = (formData.get("sex") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  const rrnRaw = formData.get("rrn");
  const rrn_encrypted =
    canViewSensitive(session.user.role) &&
    typeof rrnRaw === "string" &&
    rrnRaw.trim()
      ? encryptRrn(rrnRaw)
      : null;

  await db
    .insertInto("landlord_family_member")
    .values({
      landlord_id: landlordId,
      name,
      relationship,
      sex,
      phone,
      notes,
      rrn_encrypted,
    })
    .execute();

  revalidatePath(`/landlords/${landlordId}`);
}
```

(Add `canViewSensitive` to this file's import from `@/lib/authz` if not already present — `encryptRrn` is already imported.)

- [ ] **Step 5: Lint + manual verify**

Run: `pnpm --filter crm lint`
Expected: no errors in the three modified files.

Manual: as an admin, open a landlord that has co-lessors (create one via Task 6 intake), confirm the 주민번호 column shows the mask with an eye toggle, click to reveal, confirm the audit log records `landlord_family_member.rrn.reveal`. As a non-privileged user, confirm the column is absent.

- [ ] **Step 6: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/landlords/_actions.ts" \
        "apps/crm/src/app/(dashboard)/landlords/[id]/_detail.tsx" \
        "apps/crm/src/app/(dashboard)/landlords/_components/landlord-family-members.tsx"
git commit -m "feat(landlords): reveal + store co-lessor RRN on family members"
```

---

## Self-Review

**Spec coverage:**

- One-dialog intake creating 임대인+매물+임차인+계약 → Tasks 3–6. ✓
- Existing-or-new per section, property-existing hides landlord → parser (Task 3) + dialog (Task 5). ✓
- 임대인 = one record + N family co-lessors → action (Task 4) + dialog repeater (Task 5). ✓
- 임차인 = one person → dialog (no tenant repeater). ✓
- RRN for primary + every co-lessor, admin/accounting only → migration (Task 1), parser gating (Task 3), action encrypt (Task 4), dialog inputs (Task 5). ✓
- Lean field set / 특별조항→notes / Humphreys + 아파트 defaults → parser + dialog. ✓
- Single transaction, rollback → action (Task 4). ✓
- Reveal co-lessor RRN → Task 7. ✓
- Tests are pure (`node --test`) → Tasks 2–3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. Two conditional fallbacks are explicit (codegen-unreachable in Task 1; `Field` className in Task 5).

**Type consistency:** `LeaseIntakePlan`/`LandlordPlan`/`PropertyPlan`/`TenantPlan` field names (`sizePyeong`, `militaryId`, `baseLocationId`, `monthlyRentKrw`, `coLessors`) are identical between the parser (Task 3) and the action (Task 4). Dialog field names match the parser's documented FormData contract. `FamilyMember.hasRrn` + `canViewRrn` props match between Task 7 Steps 2 and 3.

## Notes / assumptions to confirm during execution

- `requirePermission`'s entity/action keys (`"tenant"|"landlord"|"property"|"lease"`, `"create"`) match the existing actions — verified against `createTenant`/`createLandlord`/`createProperty`/`createLease`.
- The Tenants page already exposes a `session` (it computes `admin`). If it uses a thinner role check, fetch `getSession()` once and reuse (Task 6 Step 2 note).
- `Field` accepting `className` (Task 5) — fall back to a wrapping `div` if not.
