# Customer Intake + Flat Card (Option A Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-form entity chain with one static "새 고객" intake page, and rework the tenant detail read view into the flat card (money strip, 주거/집주인 facts, recent 수납, collapsed sections).

**Architecture:** A pure FormData parser (`src/lib/customer-intake.ts`, node:test-testable) produces a plan; a server action executes it in one transaction (tenant always; landlord→property→lease only when an address was entered, reusing existing records by phone/address match). The tenant detail page (`tenants/[id]/_detail.tsx`) is a server component reorganized around the old ERP's flat-card mental model. The old two-dialog intake path (`TenantForm` create dialog + `LeaseIntakeForm`) is deleted.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Kysely (`@kingsrealty/db`), node:test via tsx, Tailwind + the in-repo Operations Desk components (`DetailView`, `DetailPanel`, `Field`, `AutocompleteCreate`, `PhoneInput`, `SecretValue`, `CreateDialog`).

**Spec:** `docs/superpowers/specs/2026-07-10-option-a-simplification-design.md`

## Global Constraints

- No DB schema changes (spec non-goal). NOT NULL columns that constrain the design: `property.landlord_id`, `tenant.base_location_id`, `landlord.phone` (use `""` when unknown).
- Required form fields: only 이름 + 전화번호. Everything else optional; server-side validation errors in Korean.
- No conditional show/hide fields; no wizards. One static page.
- Postcodify is an assist, not a gate: free-text addresses are accepted (`address_jibeon` stays null).
- Money renders mono/tabular (existing `formatKRW` + `tabular` class conventions).
- Tests run via `pnpm --filter crm test` (`node --import tsx --test <files>`); pure lib code must not import `@/` aliases — use relative imports within `src/lib/`.
- Commit after each task; `git add` only the files you touched (an external auto-commit process shares this checkout).

---

### Task 1: Pure intake parser `parseCustomerIntake`

**Files:**
- Create: `apps/crm/src/lib/customer-intake.ts`
- Create: `apps/crm/src/lib/customer-intake.test.ts`
- Modify: `apps/crm/package.json` (append test file to the `test` script)

**Interfaces:**
- Produces (consumed by Task 2 and Task 4):

```ts
export interface CustomerIntakePlan {
  tenant: {
    name: string;
    phone: string;
    rank: string | null;
    unit: string | null;
    baseLocationId: number;
  };
  /** null when no 주소 entered → bare tenant only. */
  housing: {
    address: string;
    addressJibeon: string | null;
    addressEn: string | null;
    addressDetail: string | null;
    landlord:
      | { mode: "existing"; landlordId: number }
      | { mode: "new"; name: string; phone: string | null };
    monthlyRentKrw: string; // "0" when blank
    depositKrw: string;     // "0" when blank
    startDate: string;      // YYYY-MM-DD, defaults to opts.today
    endDate: string;        // YYYY-MM-DD, defaults to start + 12 months
  } | null;
  memo: string | null;
}
export function parseCustomerIntake(
  formData: FormData,
  opts: { today: string },
): CustomerIntakePlan;
export function normalizePhone(s: string): string; // digits only
export function escapeHtml(s: string): string;
```

- [ ] **Step 1: Write the failing tests**

Create `apps/crm/src/lib/customer-intake.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCustomerIntake,
  normalizePhone,
  escapeHtml,
} from "./customer-intake";

const TODAY = "2026-07-10";

function bare(): FormData {
  const fd = new FormData();
  fd.set("name", "BOUCHER, Jeremy");
  fd.set("phone", "010-8037-7805");
  // NOT NULL column; the form pre-fills it, the parser requires it.
  fd.set("base_location_id", "1");
  return fd;
}

function full(): FormData {
  const fd = bare();
  fd.set("rank", "E-8");
  fd.set("unit", "2ID");
  fd.set("base_location_id", "1");
  fd.set("address", "경기도 평택시 수정구 자곡동 290");
  fd.set("address_detail", "1층");
  fd.set("landlord_name", "강웅식");
  fd.set("landlord_phone", "010-4924-4005");
  fd.set("monthly_rent_krw", "3900000");
  fd.set("deposit_krw", "3525000");
  fd.set("start_date", "2026-07-09");
  fd.set("end_date", "2029-07-08");
  fd.set("memo", "선불금 6,140,000");
  return fd;
}

test("name+phone only → bare tenant, housing null", () => {
  const plan = parseCustomerIntake(bare(), { today: TODAY });
  assert.equal(plan.tenant.name, "BOUCHER, Jeremy");
  assert.equal(plan.tenant.phone, "010-8037-7805");
  assert.equal(plan.housing, null);
  assert.equal(plan.memo, null);
});

test("missing name or phone → Korean error", () => {
  const noName = bare();
  noName.set("name", "  ");
  assert.throws(() => parseCustomerIntake(noName, { today: TODAY }), {
    message: "이름을 입력해주세요.",
  });
  const noPhone = bare();
  noPhone.delete("phone");
  assert.throws(() => parseCustomerIntake(noPhone, { today: TODAY }), {
    message: "전화번호를 입력해주세요.",
  });
});

test("full form → housing plan with new landlord", () => {
  const plan = parseCustomerIntake(full(), { today: TODAY });
  assert.ok(plan.housing);
  assert.equal(plan.housing.address, "경기도 평택시 수정구 자곡동 290");
  assert.equal(plan.housing.addressJibeon, null); // free text, no Postcodify
  assert.deepEqual(plan.housing.landlord, {
    mode: "new",
    name: "강웅식",
    phone: "010-4924-4005",
  });
  assert.equal(plan.housing.monthlyRentKrw, "3900000");
  assert.equal(plan.housing.startDate, "2026-07-09");
  assert.equal(plan.housing.endDate, "2029-07-08");
  assert.equal(plan.memo, "선불금 6,140,000");
});

test("picked landlord id wins over typed name", () => {
  const fd = full();
  fd.set("landlord_id", "5");
  const plan = parseCustomerIntake(fd, { today: TODAY });
  assert.deepEqual(plan.housing?.landlord, { mode: "existing", landlordId: 5 });
});

test("address without landlord name → error", () => {
  const fd = full();
  fd.delete("landlord_id");
  fd.set("landlord_name", "");
  assert.throws(() => parseCustomerIntake(fd, { today: TODAY }), {
    message: "집주인 이름을 입력해주세요. (주소를 입력할 때 필요합니다)",
  });
});

test("rent/landlord without address → error, not silent drop", () => {
  const fd = bare();
  fd.set("monthly_rent_krw", "1000000");
  assert.throws(() => parseCustomerIntake(fd, { today: TODAY }), {
    message: "계약 정보를 입력하려면 주소를 입력해주세요.",
  });
});

test("blank rent/deposit/dates get defaults", () => {
  const fd = full();
  fd.set("monthly_rent_krw", "");
  fd.set("deposit_krw", "");
  fd.set("start_date", "");
  fd.set("end_date", "");
  const plan = parseCustomerIntake(fd, { today: TODAY });
  assert.equal(plan.housing?.monthlyRentKrw, "0");
  assert.equal(plan.housing?.depositKrw, "0");
  assert.equal(plan.housing?.startDate, TODAY);
  assert.equal(plan.housing?.endDate, "2027-07-10");
});

test("negative rent and end<=start are rejected", () => {
  const bad = full();
  bad.set("monthly_rent_krw", "-5");
  assert.throws(() => parseCustomerIntake(bad, { today: TODAY }), {
    message: "월세를 0 이상의 숫자로 입력해주세요.",
  });
  const flipped = full();
  flipped.set("end_date", "2026-07-09");
  assert.throws(() => parseCustomerIntake(flipped, { today: TODAY }), {
    message: "계약 종료일은 시작일 이후여야 합니다.",
  });
});

test("Postcodify fields pass through when present", () => {
  const fd = full();
  fd.set("address_jibeon", "경기도 평택시 자곡동 290");
  fd.set("address_en", "290, Jagok-dong, Pyeongtaek-si");
  const plan = parseCustomerIntake(fd, { today: TODAY });
  assert.equal(plan.housing?.addressJibeon, "경기도 평택시 자곡동 290");
  assert.equal(plan.housing?.addressEn, "290, Jagok-dong, Pyeongtaek-si");
  assert.equal(plan.housing?.addressDetail, "1층");
});

test("base_location_id is required (form pre-fills it; parser defends)", () => {
  const fd = bare();
  fd.set("base_location_id", "3");
  assert.equal(
    parseCustomerIntake(fd, { today: TODAY }).tenant.baseLocationId,
    3,
  );
  const missing = bare();
  missing.delete("base_location_id");
  assert.throws(() => parseCustomerIntake(missing, { today: TODAY }), {
    message: "기지를 선택해주세요.",
  });
});

test("normalizePhone strips everything but digits", () => {
  assert.equal(normalizePhone("010-4924-4005"), "01049244005");
  assert.equal(normalizePhone("+82 10 4924 4005"), "821049244005");
});

test("escapeHtml escapes &, <, >", () => {
  assert.equal(escapeHtml("a<b>&c"), "a&lt;b&gt;&amp;c");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/crm && node --import tsx --test src/lib/customer-intake.test.ts`
Expected: FAIL — `Cannot find module './customer-intake'`

- [ ] **Step 3: Write the parser**

Create `apps/crm/src/lib/customer-intake.ts`:

```ts
/**
 * Pure parser for the 새 고객 one-page intake. Turns FormData into a plan the
 * createCustomerIntake server action executes. No DB, no crypto; only relative
 * imports — unit-testable with `node --test`.
 *
 * The old ERP's mental model: one flat form, fill what you know. Name + phone
 * make a tenant; an address escalates to the full landlord→property→lease
 * chain with sensible defaults for anything left blank.
 */
import { addMonths } from "./date";

export interface CustomerIntakePlan {
  tenant: {
    name: string;
    phone: string;
    rank: string | null;
    unit: string | null;
    baseLocationId: number;
  };
  housing: {
    address: string;
    addressJibeon: string | null;
    addressEn: string | null;
    addressDetail: string | null;
    landlord:
      | { mode: "existing"; landlordId: number }
      | { mode: "new"; name: string; phone: string | null };
    monthlyRentKrw: string;
    depositKrw: string;
    startDate: string;
    endDate: string;
  } | null;
  memo: string | null;
}

export function normalizePhone(s: string): string {
  return s.replace(/\D/g, "");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function parseCustomerIntake(
  formData: FormData,
  opts: { today: string },
): CustomerIntakePlan {
  const str = (k: string): string => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const strOrNull = (k: string): string | null => str(k) || null;
  const posInt = (k: string): number => {
    const n = Number(str(k));
    return Number.isInteger(n) && n > 0 ? n : 0;
  };

  // --- 고객 ---
  const name = str("name");
  const phone = str("phone");
  if (!name) throw new Error("이름을 입력해주세요.");
  if (!phone) throw new Error("전화번호를 입력해주세요.");
  const baseLocationId = posInt("base_location_id");
  if (!baseLocationId) throw new Error("기지를 선택해주세요.");

  // --- 주거 (주소가 스위치) ---
  const address = str("address");
  let housing: CustomerIntakePlan["housing"] = null;
  if (address) {
    const landlordId = posInt("landlord_id");
    let landlord: NonNullable<CustomerIntakePlan["housing"]>["landlord"];
    if (landlordId) {
      landlord = { mode: "existing", landlordId };
    } else {
      const landlordName = str("landlord_name");
      // property.landlord_id is NOT NULL — a new property needs an owner.
      if (!landlordName) {
        throw new Error("집주인 이름을 입력해주세요. (주소를 입력할 때 필요합니다)");
      }
      landlord = {
        mode: "new",
        name: landlordName,
        phone: strOrNull("landlord_phone"),
      };
    }

    const startDate = str("start_date") || opts.today;
    const endDate = str("end_date") || addMonths(startDate, 12);
    if (Number.isNaN(new Date(startDate).getTime())) {
      throw new Error("계약 시작일을 올바르게 입력해주세요.");
    }
    if (Number.isNaN(new Date(endDate).getTime())) {
      throw new Error("계약 종료일을 올바르게 입력해주세요.");
    }
    if (endDate <= startDate) {
      throw new Error("계약 종료일은 시작일 이후여야 합니다.");
    }

    const monthlyRentKrw = str("monthly_rent_krw") || "0";
    const depositKrw = str("deposit_krw") || "0";
    const rentNum = Number(monthlyRentKrw);
    if (!Number.isFinite(rentNum) || rentNum < 0) {
      throw new Error("월세를 0 이상의 숫자로 입력해주세요.");
    }
    const depositNum = Number(depositKrw);
    if (!Number.isFinite(depositNum) || depositNum < 0) {
      throw new Error("보증금을 0 이상의 숫자로 입력해주세요.");
    }

    housing = {
      address,
      addressJibeon: strOrNull("address_jibeon"),
      addressEn: strOrNull("address_en"),
      addressDetail: strOrNull("address_detail"),
      landlord,
      monthlyRentKrw,
      depositKrw,
      startDate,
      endDate,
    };
  } else if (
    str("monthly_rent_krw") ||
    str("deposit_krw") ||
    str("landlord_name") ||
    posInt("landlord_id")
  ) {
    // Contract fields without an address would be silently lost — refuse.
    throw new Error("계약 정보를 입력하려면 주소를 입력해주세요.");
  }

  return {
    tenant: {
      name,
      phone,
      rank: strOrNull("rank"),
      unit: strOrNull("unit"),
      baseLocationId,
    },
    housing,
    memo: strOrNull("memo"),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/crm && node --import tsx --test src/lib/customer-intake.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Add to the package test script**

In `apps/crm/package.json`, append ` src/lib/customer-intake.test.ts` to the `test` script's file list. Run `pnpm --filter crm test` — expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/crm/src/lib/customer-intake.ts apps/crm/src/lib/customer-intake.test.ts apps/crm/package.json
git commit -m "feat(intake): pure parser for one-page customer intake"
```

---

### Task 2: Server action `createCustomerIntake`

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/tenants/_actions.ts` (add one action + imports)

**Interfaces:**
- Consumes: `parseCustomerIntake`, `normalizePhone`, `escapeHtml` from `@/lib/customer-intake`; `syncTenantRentDef` from `@/lib/charges`; `sanitizeNoteHtml` from `@/lib/notes/sanitize` (already imported in this file); `seoulDateString` from `@/lib/date`.
- Produces: `createCustomerIntake(formData: FormData): Promise<void>` — used by Task 4's form `action`.

Reuse rules (from the spec): landlord by exact phone-digits match (unique match → reuse, else create); property by `address_jibeon` when present else raw `address`, with `address_detail` equality (unique match → reuse and **use its landlord**, skipping landlord creation); ambiguity → create new.

- [ ] **Step 1: Add the action**

In `apps/crm/src/app/(dashboard)/tenants/_actions.ts`, add imports:

```ts
import {
  parseCustomerIntake,
  normalizePhone,
  escapeHtml,
} from "@/lib/customer-intake";
import { syncTenantRentDef } from "@/lib/charges";
import { seoulDateString } from "@/lib/date";
```

(Keep existing imports; `sanitizeNoteHtml`, `getDb`, `revalidatePath`, `redirect`, `requirePermission` are already there — verify and only add what's missing.)

Add the action:

```ts
/**
 * 새 고객 일괄 등록 — 옛 ERP 고객등록과 같은 한 장짜리 폼. 이름+전화만으로 고객을
 * 만들고, 주소가 있으면 집주인→매물→계약까지 한 트랜잭션으로 생성한다. 기존
 * 집주인(전화 일치)·매물(주소 일치)은 재사용한다.
 */
export async function createCustomerIntake(formData: FormData) {
  const session = await requirePermission("tenant", "create");
  const plan = parseCustomerIntake(formData, { today: seoulDateString() });
  if (plan.housing) {
    await requirePermission("lease", "create");
    await requirePermission("property", "create");
    if (plan.housing.landlord.mode === "new") {
      await requirePermission("landlord", "create");
    }
  }

  const db = getDb();
  const userId = Number(session.user.id);
  let tenantId = 0;

  await db.transaction().execute(async (trx) => {
    const H = plan.housing;

    // 1. 매물 재사용 조회 — 기존 매물이면 그 집주인을 그대로 쓴다.
    let propertyId = 0;
    if (H) {
      const matches = await trx
        .selectFrom("property")
        .select(["id"])
        .where((eb) =>
          H.addressJibeon
            ? eb("address_jibeon", "=", H.addressJibeon)
            : eb("address", "=", H.address),
        )
        .where((eb) =>
          H.addressDetail
            ? eb("address_detail", "=", H.addressDetail)
            : eb.or([
                eb("address_detail", "is", null),
                eb("address_detail", "=", ""),
              ]),
        )
        .execute();
      if (matches.length === 1) propertyId = matches[0].id;
    }

    // 2. 집주인 (새 매물일 때만 필요)
    let landlordId = 0;
    if (H && !propertyId) {
      if (H.landlord.mode === "existing") {
        landlordId = H.landlord.landlordId;
      } else {
        if (H.landlord.phone) {
          const digits = normalizePhone(H.landlord.phone);
          if (digits) {
            const all = await trx
              .selectFrom("landlord")
              .select(["id", "phone"])
              .execute();
            const hits = all.filter(
              (l) => l.phone && normalizePhone(l.phone) === digits,
            );
            if (hits.length === 1) landlordId = hits[0].id;
          }
        }
        if (!landlordId) {
          const ins = await trx
            .insertInto("landlord")
            .values({
              name: H.landlord.name,
              phone: H.landlord.phone ?? "",
              created_by: userId,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          landlordId = ins.id;
        }
      }
    }

    // 3. 매물 생성 (재사용 안 된 경우)
    if (H && !propertyId) {
      const ins = await trx
        .insertInto("property")
        .values({
          address: H.address,
          address_jibeon: H.addressJibeon,
          address_detail: H.addressDetail,
          address_en: H.addressEn,
          property_type: "apartment",
          monthly_rent_krw: H.monthlyRentKrw,
          deposit_krw: H.depositKrw,
          status: "occupied",
          landlord_id: landlordId,
          created_by: userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      propertyId = ins.id;
    }

    // 4. 고객
    const T = plan.tenant;
    const tIns = await trx
      .insertInto("tenant")
      .values({
        name: T.name,
        phone: T.phone,
        rank: T.rank,
        unit: T.unit,
        base_location_id: T.baseLocationId,
        status: "active",
        created_by: userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    tenantId = tIns.id;

    // 5. 계약 + 부수효과 (createLeaseIntake와 동일한 규칙)
    if (H) {
      await trx
        .insertInto("lease")
        .values({
          property_id: propertyId,
          tenant_id: tenantId,
          start_date: new Date(H.startDate),
          end_date: new Date(H.endDate),
          monthly_rent_krw: H.monthlyRentKrw,
          deposit_krw: H.depositKrw,
          status: "active",
          created_by: userId,
        })
        .execute();
      await trx
        .updateTable("property")
        .set({ status: "occupied", updated_at: new Date() })
        .where("id", "=", propertyId)
        .execute();
      if (Number(H.monthlyRentKrw) > 0) {
        await syncTenantRentDef(trx, {
          tenantId,
          monthlyRentKrw: H.monthlyRentKrw,
          startDate: new Date(H.startDate),
          endDate: new Date(H.endDate),
          active: true,
          createdBy: userId,
        });
      }
    }

    // 6. 메모 → 카드의 메모(노트)로
    if (plan.memo) {
      const html = sanitizeNoteHtml(
        `<p>${escapeHtml(plan.memo).replace(/\n/g, "<br />")}</p>`,
      );
      await trx
        .insertInto("tenant_note")
        .values({ tenant_id: tenantId, content: html, created_by: userId })
        .execute();
    }
  });

  revalidatePath("/tenants");
  revalidatePath("/properties");
  redirect(`/tenants/${tenantId}`);
}
```

Note: `sanitizeNoteHtml` — check its actual signature at the top of `@/lib/notes/sanitize` before use; if it takes options, call it the same way the note-create action in this file already does.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter crm exec tsc --noEmit` (or `pnpm --filter crm lint` if there is no standalone tsc script; `next build` in Task 7 is the backstop).
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/_actions.ts"
git commit -m "feat(intake): createCustomerIntake server action with landlord/property reuse"
```

---

### Task 3: `AddressField` — free-text address with Postcodify assist

**Files:**
- Create: `apps/crm/src/components/address-field.tsx`

**Interfaces:**
- Consumes: `searchAddress`, `PostcodifyResult` from `@/lib/postcodify` (same as `components/address-search.tsx`).
- Produces: `<AddressField />` — no props needed for create mode. Submits form fields `address` (visible input, free text allowed), `address_jibeon`, `address_en` (hidden, filled only by a Postcodify pick), `address_detail` (visible input).

Unlike `AddressSearch` (which blocks until a suggestion is picked), the visible input IS the value. Typing shows suggestions; picking one replaces the text with the 도로명 address and fills the hidden 지번/영문 fields; any subsequent edit clears the hidden fields (it's free text again).

- [ ] **Step 1: Write the component**

Create `apps/crm/src/components/address-field.tsx`:

```tsx
"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { searchAddress, type PostcodifyResult } from "@/lib/postcodify";

/** Free-text address input with Postcodify suggestions as an assist.
 *  The visible input is the submitted `address`; picking a suggestion also
 *  fills hidden `address_jibeon`/`address_en`. Editing after a pick reverts
 *  to free text (hidden fields clear). */
export function AddressField() {
  const [value, setValue] = useState("");
  const [jibeon, setJibeon] = useState("");
  const [addressEn, setAddressEn] = useState("");
  const [results, setResults] = useState<PostcodifyResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const reqIdRef = useRef(0);

  const handleChange = useCallback((v: string) => {
    setValue(v);
    setJibeon("");
    setAddressEn("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      startTransition(async () => {
        const { results: r } = await searchAddress(v);
        if (reqId !== reqIdRef.current) return;
        setResults(r);
        setIsOpen(r.length > 0);
      });
    }, 350);
  }, []);

  const handleSelect = (r: PostcodifyResult) => {
    setValue(`${r.ko_common} ${r.ko_doro}`.trim());
    setJibeon(`${r.ko_common} ${r.ko_jibeon}`.trim());
    setAddressEn(`${r.en_doro}, ${r.en_common}`.trim());
    setIsOpen(false);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="address_jibeon" value={jibeon} />
      <input type="hidden" name="address_en" value={addressEn} />
      <Field>
        <Label htmlFor="address">주소</Label>
        <div className="relative">
          <Input
            id="address"
            name="address"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="도로명·지번·건물명 — 검색하거나 그냥 입력"
            autoComplete="off"
          />
          {isPending && (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {isOpen && (
          <div className="max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-md">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(r)}
                className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
              >
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0 text-primary" />
                  <span className="font-medium">
                    {r.ko_common} {r.ko_doro}
                  </span>
                </span>
                {r.ko_jibeon && (
                  <span className="ml-5 text-xs text-muted-foreground">
                    (지번) {r.ko_common} {r.ko_jibeon}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {jibeon && (
          <p className="text-xs text-muted-foreground">지번: {jibeon}</p>
        )}
      </Field>
      <Field>
        <Label htmlFor="address_detail">상세주소</Label>
        <Input
          id="address_detail"
          name="address_detail"
          placeholder="동/호수, 층 등"
        />
      </Field>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, commit**

Run: `pnpm --filter crm lint`
Expected: clean.

```bash
git add apps/crm/src/components/address-field.tsx
git commit -m "feat(intake): AddressField — free-text address with Postcodify assist"
```

---

### Task 4: `CustomerIntakeForm` + make it the only front door

**Files:**
- Create: `apps/crm/src/app/(dashboard)/tenants/_components/customer-intake-form.tsx`
- Modify: `apps/crm/src/app/(dashboard)/tenants/layout.tsx` (one "새 고객" dialog; drop the two old ones)
- Delete: `apps/crm/src/app/(dashboard)/leases/_components/lease-intake-dialog.tsx`, `apps/crm/src/lib/lease-intake.ts`, `apps/crm/src/lib/lease-intake.test.ts`
- Modify: `apps/crm/src/app/(dashboard)/leases/_actions.ts` (remove `createLeaseIntake` + now-unused imports `parseLeaseIntake`, `encryptRrn`)
- Modify: `apps/crm/package.json` (remove `src/lib/lease-intake.test.ts` from the test script)

**Interfaces:**
- Consumes: `createCustomerIntake` (Task 2), `AddressField` (Task 3), existing `AutocompleteCreate`, `PhoneInput`, `Field`/`FieldGroup`, `SubmitButton`, `addMonths`/`seoulDateString` from `@/lib/date`.
- Produces: `<CustomerIntakeForm landlords={{id,name}[]} baseLocations={{id,name,name_ko}[]} />`.

- [ ] **Step 1: Write the form**

Create `apps/crm/src/app/(dashboard)/tenants/_components/customer-intake-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { PhoneInput } from "@/components/phone-input";
import { AutocompleteCreate } from "@/components/autocomplete-create";
import { AddressField } from "@/components/address-field";
import { addMonths, monthsBetween, seoulDateString } from "@/lib/date";
import { createCustomerIntake } from "../_actions";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

// Standard pay grades — suggestions only; free text accepted.
const RANK_OPTIONS = [
  ...["E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9"],
  ...["W-1", "W-2", "W-3", "W-4", "W-5"],
  ...["O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7", "O-8", "O-9", "O-10"],
].map((r) => ({ id: r, label: r }));

interface Props {
  landlords: { id: number; name: string }[];
  baseLocations: { id: number; name: string; name_ko: string | null }[];
}

/** 옛 ERP 고객등록의 사고방식: 한 장, 아는 것만 채우면 저장. 이름+전화만
 *  필수. 주소를 채우면 집주인→매물→계약까지 한 번에 만들어진다. */
export function CustomerIntakeForm({ landlords, baseLocations }: Props) {
  const today = seoulDateString();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addMonths(today, 12));

  const landlordOptions = landlords.map((l) => ({
    id: String(l.id),
    label: l.name,
  }));

  return (
    <form
      action={createCustomerIntake}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (e.key === "Enter" && target.tagName === "INPUT") {
          e.preventDefault();
        }
      }}
    >
      <FieldGroup>
        {/* ── 고객 ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">고객</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor="name">
                이름 <span className="text-danger">*</span>
              </Label>
              <Input id="name" name="name" required autoFocus />
            </Field>
            <Field>
              <Label htmlFor="phone">
                전화번호 <span className="text-danger">*</span>
              </Label>
              <PhoneInput name="phone" required />
            </Field>
            <Field>
              <Label>계급</Label>
              <AutocompleteCreate
                textName="rank"
                options={RANK_OPTIONS}
                placeholder="E-5, O-3 …"
              />
            </Field>
            <Field>
              <Label htmlFor="unit">부대</Label>
              <Input id="unit" name="unit" />
            </Field>
            <Field>
              <Label htmlFor="base_location_id">기지</Label>
              <select
                id="base_location_id"
                name="base_location_id"
                defaultValue={
                  baseLocations[0] ? String(baseLocations[0].id) : ""
                }
                className={selectClassName}
              >
                {baseLocations.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_ko ?? b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* ── 주거 — 전부 선택 입력 ── */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">주거</h3>
            <p className="text-xs text-muted-foreground">
              모르는 항목은 비워두세요 — 나중에 고객 카드에서 채울 수 있습니다.
            </p>
          </div>
          <AddressField />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label>집주인 이름</Label>
              <AutocompleteCreate
                textName="landlord_name"
                idName="landlord_id"
                options={landlordOptions}
                placeholder="검색 또는 입력 (주소 입력 시 필요)"
                newHint="새 집주인 등록"
              />
            </Field>
            <Field>
              <Label htmlFor="landlord_phone">집주인 연락처</Label>
              <PhoneInput name="landlord_phone" />
            </Field>
            <Field>
              <Label htmlFor="monthly_rent_krw">월세 (₩)</Label>
              <Input
                id="monthly_rent_krw"
                name="monthly_rent_krw"
                type="number"
                min={0}
                placeholder="0"
              />
            </Field>
            <Field>
              <Label htmlFor="deposit_krw">보증금 (₩)</Label>
              <Input
                id="deposit_krw"
                name="deposit_krw"
                type="number"
                min={0}
                placeholder="0"
              />
            </Field>
            <Field>
              <Label htmlFor="start_date">계약 시작</Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value) {
                    setEndDate(
                      addMonths(
                        e.target.value,
                        Math.max(1, monthsBetween(startDate, endDate)),
                      ),
                    );
                  }
                }}
              />
            </Field>
            <Field>
              <Label htmlFor="end_date">계약 만료</Label>
              <Input
                id="end_date"
                name="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* ── 메모 ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">메모</h3>
          <textarea
            name="memo"
            rows={3}
            placeholder="선불금, 특이사항 등 — 자유롭게"
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
          />
        </section>

        <div className="flex justify-end pt-1">
          <SubmitButton label="등록" />
        </div>
      </FieldGroup>
    </form>
  );
}
```

- [ ] **Step 2: Swap the dialogs in `tenants/layout.tsx`**

In `apps/crm/src/app/(dashboard)/tenants/layout.tsx`:

1. Replace imports `TenantForm` and `LeaseIntakeForm` with `CustomerIntakeForm` from `./_components/customer-intake-form`.
2. Delete the `propertiesList` query from the `Promise.all` (matching is now server-side) and the `tenantsList` derivation. Keep `landlordsList` and `baseLocations`.
3. Replace the two `CreateDialog`s in the `actions` prop with one:

```tsx
actions={
  <CreateDialog title="새 고객" buttonLabel="새 고객" wide closeOnSuccess>
    <CustomerIntakeForm
      landlords={landlordsList}
      baseLocations={baseLocations}
    />
  </CreateDialog>
}
```

4. Remove `canViewSensitive`/`canViewRrn` if now unused in this file.

- [ ] **Step 3: Delete the old intake path**

```bash
git rm "apps/crm/src/app/(dashboard)/leases/_components/lease-intake-dialog.tsx" apps/crm/src/lib/lease-intake.ts apps/crm/src/lib/lease-intake.test.ts
```

- In `apps/crm/src/app/(dashboard)/leases/_actions.ts`: delete the whole `createLeaseIntake` function and the now-unused imports (`parseLeaseIntake`, `encryptRrn` — keep `encryptRrn` if any other function in the file uses it; grep first).
- In `apps/crm/package.json`: remove `src/lib/lease-intake.test.ts` from the `test` script.
- Grep for stragglers: `grep -rn "LeaseIntakeForm\|createLeaseIntake\|lease-intake" apps/crm/src` — expect zero hits.

- [ ] **Step 4: Verify**

Run: `pnpm --filter crm test && pnpm --filter crm lint`
Expected: PASS / clean. (TenantForm remains in use by the detail page's edit view — untouched.)

- [ ] **Step 5: Commit**

```bash
git add -A apps/crm/src apps/crm/package.json
git commit -m "feat(intake): one-page 새 고객 form replaces tenant/lease intake dialogs"
```

(`-A` is acceptable here only because Steps 1–3 touched exactly these paths; confirm with `git status` that nothing external snuck in before committing.)

---

### Task 5: Flat card — rework the tenant detail read view

**Files:**
- Create: `apps/crm/src/components/collapsed-section.tsx`
- Modify: `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx` (facts array + `readView` only; edit view, tabs, aside stay)

**Interfaces:**
- Consumes: everything already in `_detail.tsx` (queries unchanged in this task).
- Produces: `<CollapsedSection title count? defaultOpen?>` used here and by Task 6.

- [ ] **Step 1: Write `CollapsedSection`**

Create `apps/crm/src/components/collapsed-section.tsx` (server-component-safe — no hooks):

```tsx
import { ChevronRight } from "lucide-react";

/** Native-details collapsed block for below-the-fold card sections. */
export function CollapsedSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group rounded-xl border border-border/60"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
        {title}
        {count != null && count > 0 && (
          <span className="tabular text-[11px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </summary>
      <div className="border-t border-border/60 p-3.5">{children}</div>
    </details>
  );
}
```

- [ ] **Step 2: Replace the facts strip**

In `_detail.tsx`, replace the `facts` array with the spec's four (월세 · 보증금 · 계약기간 · 미납). Add above it:

```ts
const leaseEndDays = activeLease ? daysUntil(activeLease.end_date) : null;
```

```ts
const facts: Fact[] = [
  {
    label: "월세",
    value: activeLease ? formatKRW(activeLease.monthly_rent_krw) : "-",
  },
  {
    label: "보증금",
    value: activeLease ? formatKRW(activeLease.deposit_krw) : "-",
    tone: activeLease ? "muted" : "default",
  },
  {
    label: "계약기간",
    value: activeLease
      ? `${formatDate(activeLease.start_date)} ~ ${formatDate(activeLease.end_date)}`
      : "-",
    sub:
      leaseEndDays == null
        ? undefined
        : leaseEndDays >= 0
          ? `D-${leaseEndDays}`
          : `만료 D+${-leaseEndDays}`,
    tone:
      leaseEndDays == null
        ? "muted"
        : leaseEndDays < 0
          ? "danger"
          : leaseEndDays <= 60
            ? "warning"
            : "default",
  },
  {
    label: "미납",
    value: arrearsCount > 0 ? formatKRW(arrearsTotalKrw) : "없음",
    sub: arrearsCount > 0 ? `${arrearsCount}건` : undefined,
    tone: arrearsCount > 0 ? "danger" : "success",
  },
];
```

DEROS moves fully into the 군 정보 collapsed section (delete its fact); delete the 총 납부 fact (`totalPaid` stays — it is not otherwise used, so remove its computation too if nothing else references it).

- [ ] **Step 3: Rewrite `readView`**

Add imports to `_detail.tsx`:

```ts
import { Button } from "@/components/ui/button";
import { CollapsedSection } from "@/components/collapsed-section";
```

Add above `readView` (recent paid rows for the card):

```ts
const recentPayments = payments.filter((p) => p.status === "paid").slice(0, 5);
```

Replace the entire `readView` JSX with:

```tsx
const readView = (
  <div className="space-y-4">
    {/* 주거 + 집주인 — 전화 왔을 때 바로 찾는 정보 */}
    <div className="grid gap-4 lg:grid-cols-2">
      <DetailPanel
        title="주거"
        action={
          activeLease ? (
            <Link
              href={`/properties/${activeLease.property_id}`}
              className="text-xs text-brand hover:underline"
            >
              매물 상세 →
            </Link>
          ) : undefined
        }
      >
        {activeLease ? (
          <>
            <DetailRow label="주소">{activeAddress}</DetailRow>
            <DetailRow label="현관 비밀번호" mono>
              <SecretValue
                value={activeLease.front_door_password}
                label="현관 비밀번호"
              />
            </DetailRow>
            <DetailRow label="집 비밀번호" mono>
              <SecretValue
                value={activeLease.unit_password}
                label="집 비밀번호"
              />
            </DetailRow>
          </>
        ) : (
          <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
            활성 계약이 없습니다 — 임대 계약 탭에서 추가하세요.
          </p>
        )}
      </DetailPanel>

      <DetailPanel
        title="집주인"
        action={
          activeLease ? (
            <Link
              href={`/landlords/${activeLease.landlord_id}`}
              className="text-xs text-brand hover:underline"
            >
              임대인 상세 →
            </Link>
          ) : undefined
        }
      >
        {activeLease ? (
          <>
            <DetailRow label="이름">{activeLease.landlord_name}</DetailRow>
            <DetailRow label="전화" mono>
              {activeLease.landlord_phone || "-"}
            </DetailRow>
            {canViewRrn && (
              <DetailRow label="주민등록번호" mono>
                <LandlordRrn
                  landlordId={activeLease.landlord_id}
                  hasRrn={!!activeLease.landlord_rrn_encrypted}
                />
              </DetailRow>
            )}
          </>
        ) : (
          <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
            -
          </p>
        )}
      </DetailPanel>
    </div>

    {/* 최근 수납 + 큰 수납 버튼 */}
    <DetailPanel
      title="최근 수납"
      action={
        <Button asChild size="sm">
          <Link
            href={`/payments/new${activeLease ? `?lease=${activeLease.id}` : ""}`}
          >
            수납 등록
          </Link>
        </Button>
      }
    >
      {recentPayments.length > 0 ? (
        recentPayments.map((p) => (
          <DetailRow
            key={p.id}
            label={
              p.payment_date ? formatDate(p.payment_date) : "-"
            }
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-muted-foreground">
                {p.label ?? p.payment_type}
              </span>
              <span className="tabular shrink-0 font-medium">
                {formatKRW(p.amount_krw)}
              </span>
            </span>
          </DetailRow>
        ))
      ) : (
        <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
          수납 내역이 없습니다.
        </p>
      )}
    </DetailPanel>

    {/* 아래로 접힌 상세 정보 */}
    <CollapsedSection title="연락처 · 인적사항">
      <DefinitionGrid>
        <DefGroup label="연락처">
          <Def label="전화" mono>
            {tenant.phone || "-"}
          </Def>
          <Def label="이메일">{tenant.email || "-"}</Def>
        </DefGroup>
        <DefGroup label="인적사항">
          <Def label="성별">
            {tenant.sex ? (sexMap[tenant.sex] ?? tenant.sex) : "-"}
          </Def>
          <Def label="생년월일" mono>
            {formatDate(tenant.birth)}
          </Def>
        </DefGroup>
      </DefinitionGrid>
    </CollapsedSection>

    <CollapsedSection title="군 정보">
      <DefinitionGrid>
        <DefGroup label="군 정보">
          <Def label="소속">{branchLabel ?? "-"}</Def>
          <Def label="계급">{tenant.rank || "-"}</Def>
          <Def label="부대">{tenant.unit || "-"}</Def>
          <Def label="기지">
            {baseLocation
              ? `${baseLocation.name}${baseLocation.name_ko ? ` (${baseLocation.name_ko})` : ""}`
              : "-"}
          </Def>
          <Def label="DEROS" mono>
            {tenant.deros
              ? `${formatDate(tenant.deros)}${derosDays != null ? ` (${derosDays >= 0 ? `D-${derosDays}` : `D+${-derosDays}`})` : ""}`
              : "-"}
          </Def>
          <Def label="군 ID">{tenant.military_id || "-"}</Def>
          <Def label="부양가족">
            {tenant.dependent_status === "with"
              ? `동반${tenant.dependent_count ? ` (${tenant.dependent_count}명)` : ""}`
              : tenant.dependent_status === "without"
                ? "비동반"
                : familyMembers.length > 0
                  ? `${familyMembers.length}명`
                  : "-"}
          </Def>
          <Def label="OHA 한도" mono>
            {ohaLimit ? `${formatKRW(ohaLimit.amount)} / 월` : "기준표 없음"}
          </Def>
        </DefGroup>
      </DefinitionGrid>
    </CollapsedSection>

    <CollapsedSection title="가족 구성원" count={familyMembers.length}>
      <FamilyMembers tenantId={numId} members={familyMembers} />
    </CollapsedSection>

    <CollapsedSection title="반려동물" count={pets.length}>
      <TenantPets tenantId={numId} pets={pets} />
    </CollapsedSection>

    <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
      <TenantStatusButton tenantId={numId} currentStatus={tenant.status} />
      <DeleteButton
        action={deleteAction}
        title="세입자를 삭제하시겠습니까?"
        description="세입자를 삭제하면 관련 가족 구성원, 반려동물 데이터도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
      />
    </div>
  </div>
);
```

Then remove now-unused pieces this rewrite orphans: the old two-column block, the `현재 계약` `DetailPanel` (its money/dates now live in the facts strip), and any unused imports (`MapPin` stays — used in the subtitle; check `Badge`, `formatKRW` etc. are still used). `DetailRow`'s exact props: confirm against `components/detail/detail-panels.tsx` — if `DetailRow` doesn't accept arbitrary children layouts, wrap the payment row content in a plain `div` inside the panel instead of `DetailRow`.

- [ ] **Step 4: Verify visually**

Run: `pnpm --filter crm dev` → open `http://192.168.0.151:5007/tenants/<existing-id>` (debug admin login; localhost fails auth origin).
Expected: facts strip shows 월세/보증금/계약기간(D-n)/미납; 주거+집주인 panels; 최근 수납 with working 수납 등록 button that lands on `/payments/new?lease=<id>` with the tenant preselected; four collapsed sections open/close; edit pencil still shows the TenantForm; all tabs unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/crm/src/components/collapsed-section.tsx "apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx"
git commit -m "feat(card): flat-card read view — money strip, 주거/집주인 facts, recent 수납, collapsed sections"
```

---

### Task 6: 비품 + AS collapsed sections on the card

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx` (two queries + two sections)

**Interfaces:**
- Consumes: `CollapsedSection` (Task 5), `StatusBadge` (already imported).
- Produces: nothing new — read-only card sections.

- [ ] **Step 1: Add the queries**

Append to the existing `Promise.all` in `_detail.tsx` (after `inspections`), using the same latest-lease subquery pattern the inspections query uses:

```ts
db
  .selectFrom("appliance")
  .select(["id", "name", "brand", "model_number", "owner", "status"])
  .where("property_id", "=", (eb) =>
    eb
      .selectFrom("lease")
      .select("lease.property_id")
      .where("lease.tenant_id", "=", numId)
      .orderBy("lease.start_date", "desc")
      .limit(1),
  )
  .orderBy("name", "asc")
  .execute(),
db
  .selectFrom("service_request")
  .innerJoin("lease", "lease.id", "service_request.lease_id")
  .select([
    "service_request.id",
    "service_request.title",
    "service_request.category",
    "service_request.status",
    "service_request.created_at",
  ])
  .where("lease.tenant_id", "=", numId)
  .orderBy("service_request.created_at", "desc")
  .limit(10)
  .execute(),
```

Destructure as `appliances, serviceRequests` at the end of the `Promise.all` binding list (order must match).

- [ ] **Step 2: Render the sections**

Insert between the 군 정보 and 가족 구성원 `CollapsedSection`s. Check `@/lib/labels` for existing service-status and appliance-owner label maps (`grep -n "service\|owner" apps/crm/src/lib/labels.ts`) and use them if present; the code below assumes none:

```tsx
<CollapsedSection title="비품" count={appliances.length}>
  {appliances.length > 0 ? (
    <ul className="divide-y divide-border/60 text-sm">
      {appliances.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 py-2">
          <span>
            {a.name}
            {(a.brand || a.model_number) && (
              <span className="ml-2 text-xs text-muted-foreground">
                {[a.brand, a.model_number].filter(Boolean).join(" ")}
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {a.owner === "landlord" ? "집주인" : "회사"} · {a.status}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="py-4 text-center text-sm text-muted-foreground">
      등록된 비품이 없습니다.
    </p>
  )}
</CollapsedSection>

<CollapsedSection title="AS 요청" count={serviceRequests.length}>
  {serviceRequests.length > 0 ? (
    <ul className="divide-y divide-border/60 text-sm">
      {serviceRequests.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 py-2">
          <Link href={`/services/${s.id}`} className="hover:underline">
            {s.title}
          </Link>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {formatDate(s.created_at)}
            <StatusBadge status={s.status} label={s.status} />
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="py-4 text-center text-sm text-muted-foreground">
      AS 요청이 없습니다.
    </p>
  )}
</CollapsedSection>
```

Before using `/services/${s.id}`, verify that route exists (`ls "apps/crm/src/app/(dashboard)/services"`); if there is no `[id]` route, link to `/services` instead. Likewise map `s.status`/`a.status` through the label map found in Step 2's grep when available.

- [ ] **Step 3: Verify + commit**

Run dev server; check a tenant with appliances (post-2026-06-17 import data has them).
Expected: both sections render with counts; empty states on a bare tenant.

```bash
git add "apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx"
git commit -m "feat(card): read-only 비품/AS collapsed sections"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full test + lint + build**

```bash
pnpm --filter crm test && pnpm --filter crm lint && pnpm --filter crm build
```

Expected: all pass. `next build` catches any dangling import from the deletions.

- [ ] **Step 2: Drive the real flows (dev server, http://192.168.0.151:5007)**

1. 고객 → 새 고객 → only 이름+전화 → 등록 → lands on the new card; facts show "-"; 주거 shows the empty state.
2. 새 고객 → full form with a *typed* (non-Postcodify) address + new 집주인 → 등록 → card shows 주소, 집주인, 월세/보증금/계약기간 facts; 정기 청구 tab has the auto rent row; 메모 appears in the notes aside.
3. 새 고객 → same address + same 집주인 전화 again → verify property and landlord are REUSED (check /properties count didn't grow).
4. Card → 수납 등록 → collector opens with the lease preselected and the rent charge auto-filled → submit → back on card, 최근 수납 shows the row and 미납 clears.
5. Confirm the 세입자 page header shows exactly one button (새 고객).

- [ ] **Step 3: Commit any fixes, then hand off**

Use the superpowers:finishing-a-development-branch skill if this ran on a branch; otherwise report verification results.

---

## Self-Review Notes (resolved inline)

- **Spec coverage:** intake one-pager (Tasks 1–4), flat card strip/panels/수납 button (Task 5), 비품/AS card sections (Task 6), per-section inline edit — the existing pencil edit already covers tenant fields; per-section edit beyond that is deferred to Phase 2 with the nav work.
- **Deviation from spec field list:** the form includes a 기지 select (pre-filled, ignorable) because `tenant.base_location_id` is NOT NULL and the spec forbids schema changes.
- **Type consistency:** `CustomerIntakePlan` shape in Task 2's action matches Task 1's export; `CollapsedSection` props match Tasks 5–6 usage.
