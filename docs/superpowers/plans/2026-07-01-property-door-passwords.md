# Property door/unit passwords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a front-door code (현관 비밀번호) and unit-door code (집 비밀번호) to each property, editable on the property form and viewable (masked, with reveal + copy) on both the property detail and tenant detail pages.

**Architecture:** Two nullable plaintext `varchar` columns on `property`. A single reusable client component (`SecretValue`) renders a masked code with a client-side reveal toggle and copy button. The property form/actions persist the codes; both detail pages select the columns and render them through `SecretValue`.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, Kysely + kysely-codegen (Postgres), shadcn/ui, lucide-react. Monorepo: `packages/db`, `apps/crm`.

## Global Constraints

- Passwords are **plaintext** — no encryption, no server-side reveal action, no audit log. Masking is client-side only (anti-shoulder-surfing).
- No per-field/per-role permission gating. Anyone who can view the property/tenant sees the codes.
- Both columns are **nullable**; empty form input persists as `null`; a null/empty value renders as `-`.
- Column names, verbatim: `front_door_password` (현관 비밀번호), `unit_password` (집 비밀번호).
- Repo runs directly on `main` and an external process bundles the tree — in every commit step, `git add` **only** the exact files listed. Never `git add -A`.
- App dev server: `pnpm --filter crm dev` (port 5007). Lint: `pnpm --filter crm lint`.

---

### Task 1: Migration + type regeneration

Adds the two columns and regenerates the Kysely `Property` type. FileMigrationProvider
auto-discovers migrations by filename — no registration needed.

**Files:**
- Create: `packages/db/src/migrations/026_property_door_passwords.ts`
- Modify (regenerated, do not hand-edit): `packages/db/src/types.ts`

**Interfaces:**
- Produces: `property.front_door_password` and `property.unit_password` columns; `Property.front_door_password: string | null` and `Property.unit_password: string | null` in `packages/db/src/types.ts`.

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/026_property_door_passwords.ts`:

```ts
import { type Kysely } from "kysely";

/**
 * 매물별 출입 비밀번호. 현관(공동/로비) 비밀번호와 세대(집) 도어락 비밀번호를
 * 평문으로 저장한다(민감 PII 아님 — 열람 편의 우선, UI에서 마스킹만 한다).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("property")
    .addColumn("front_door_password", "varchar")
    .execute();
  await db.schema
    .alterTable("property")
    .addColumn("unit_password", "varchar")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("property")
    .dropColumn("front_door_password")
    .execute();
  await db.schema
    .alterTable("property")
    .dropColumn("unit_password")
    .execute();
}
```

- [ ] **Step 2: Run the migration**

Run: `pnpm db:migrate`
Expected: output includes `↑ 026_property_door_passwords: Success` and `Done.`
(Requires `DATABASE_URL` in `packages/db/.env` — applies to whatever DB it points at.)

- [ ] **Step 3: Regenerate Kysely types**

Run: `pnpm db:generate`
Expected: exits 0; `packages/db/src/types.ts` now shows in `interface Property`:
`front_door_password: string | null;` and `unit_password: string | null;`

- [ ] **Step 4: Verify the type change**

Run: `grep -nE "front_door_password|unit_password" packages/db/src/types.ts`
Expected: two matches inside the `Property` interface, both typed `string | null`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/026_property_door_passwords.ts packages/db/src/types.ts
git commit -m "feat(db): add front_door_password/unit_password to property (migration 026)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `SecretValue` reveal component

Reusable client component used by both detail pages. Renders `-` when empty; otherwise a
masked value with an eye toggle and a copy button. Mirrors the visual style of
`landlords/[id]/_components/landlord-rrn.tsx` but is fully client-side (value comes in via
props — no server action).

**Files:**
- Create: `apps/crm/src/components/secret-value.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button` (`variant="ghost"`, `size="icon-sm"` — same as `LandlordRrn`).
- Produces: `SecretValue({ value: string | null, label: string })` — default export is NOT used; named export `SecretValue`.

- [ ] **Step 1: Write the component**

Create `apps/crm/src/components/secret-value.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// Fixed-width mask — independent of the real length so it doesn't leak how many
// digits the code has.
const MASK = "●●●●●";

export function SecretValue({
  value,
  label,
}: {
  value: string | null;
  label: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const trimmed = value?.trim();
  if (!trimmed) return <span className="text-muted-foreground">-</span>;

  function handleCopy() {
    void navigator.clipboard.writeText(trimmed as string).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{revealed ? trimmed : MASK}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setRevealed((r) => !r)}
        aria-label={`${label} ${revealed ? "가리기" : "보기"}`}
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        aria-label={`${label} 복사`}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </span>
  );
}
```

- [ ] **Step 2: Lint the new file**

Run: `pnpm --filter crm lint`
Expected: no errors for `src/components/secret-value.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/crm/src/components/secret-value.tsx
git commit -m "feat(crm): add SecretValue masked reveal+copy component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Property form inputs + server actions

Add the two inputs to the create/edit form and persist them in both actions.

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/properties/_components/property-form.tsx`
- Modify: `apps/crm/src/app/(dashboard)/properties/_actions.ts`

**Interfaces:**
- Consumes: the `property` columns from Task 1.
- Produces: form fields named `front_door_password` / `unit_password`; both actions read and write them. `PropertyFormProps.defaultValues` gains `front_door_password: string | null` and `unit_password: string | null` (consumed by Task 4's `editView`).

- [ ] **Step 1: Extend `defaultValues` prop type**

In `property-form.tsx`, in the `defaultValues` object type (currently ending with
`moveout_date: string | null;` around line 33), add two fields after `management_phone`:

```tsx
    management_phone: string | null;
    front_door_password: string | null;
    unit_password: string | null;
    moveout_date: string | null;
```

- [ ] **Step 2: Add the two inputs to the form**

In `property-form.tsx`, immediately after the Row 6 관리실 연락처 `Field` (the block ending
`</Field>` right before `{/* Row 7: 비고 */}`), insert:

```tsx
        {/* Row 6b: 출입 비밀번호 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="front_door_password">현관 비밀번호</Label>
            <Input
              id="front_door_password"
              name="front_door_password"
              autoComplete="off"
              defaultValue={defaultValues?.front_door_password ?? ""}
              placeholder="공동현관 / 로비 비밀번호"
            />
          </Field>

          <Field>
            <Label htmlFor="unit_password">집 비밀번호</Label>
            <Input
              id="unit_password"
              name="unit_password"
              autoComplete="off"
              defaultValue={defaultValues?.unit_password ?? ""}
              placeholder="세대 도어락 비밀번호"
            />
          </Field>
        </div>
```

- [ ] **Step 3: Read + persist in `createProperty`**

In `_actions.ts`, inside `createProperty`, after the `management_phone` read
(`const management_phone = ...`) add:

```ts
  const front_door_password =
    (formData.get("front_door_password") as string) || null;
  const unit_password = (formData.get("unit_password") as string) || null;
```

Then in the `.values({ ... })` object, after `management_phone,` add:

```ts
      management_phone,
      front_door_password,
      unit_password,
```

- [ ] **Step 4: Read + persist in `updateProperty`**

In `_actions.ts`, inside `updateProperty`, after its `management_phone` read add the same two
`const` lines as Step 3. Then in the `.set({ ... })` object, after `management_phone,` add:

```ts
      management_phone,
      front_door_password,
      unit_password,
```

- [ ] **Step 5: Lint**

Run: `pnpm --filter crm lint`
Expected: no errors in `_components/property-form.tsx` or `_actions.ts`.

- [ ] **Step 6: Manual verify**

Start `pnpm --filter crm dev`. Create a property with both codes and edit an existing one;
confirm the values save and reload into the form. Clear a field and save → stored as `null`
(verify via DB or by the field showing empty on reload).

- [ ] **Step 7: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/properties/_components/property-form.tsx" "apps/crm/src/app/(dashboard)/properties/_actions.ts"
git commit -m "feat(properties): edit front-door/unit passwords on property form

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Property detail display

Select the columns, show them in the 매물 정보 group via `SecretValue`, and seed the edit form.

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/properties/[id]/_detail.tsx`

**Interfaces:**
- Consumes: `SecretValue` (Task 2); `property.front_door_password` / `property.unit_password` (Task 1); `PropertyForm` `defaultValues` fields (Task 3).

- [ ] **Step 1: Import `SecretValue`**

At the top of `properties/[id]/_detail.tsx`, after the existing `PropertyPayments` import, add:

```tsx
import { SecretValue } from "@/components/secret-value";
```

- [ ] **Step 2: Select the two columns**

In the `property` query's `.select([...])` array, after `"property.management_phone",` add:

```tsx
          "property.management_phone",
          "property.front_door_password",
          "property.unit_password",
```

- [ ] **Step 3: Render in the 매물 정보 group**

In the `매물 정보` `DefGroup`, after the 보증금 `Def` (the one rendering
`{formatKRW(property.deposit_krw)}`), add:

```tsx
          <Def label="현관 비밀번호">
            <SecretValue
              value={property.front_door_password}
              label="현관 비밀번호"
            />
          </Def>
          <Def label="집 비밀번호">
            <SecretValue value={property.unit_password} label="집 비밀번호" />
          </Def>
```

- [ ] **Step 4: Seed the edit form**

In the `editView` `PropertyForm` `defaultValues`, after `management_phone: property.management_phone,` add:

```tsx
        management_phone: property.management_phone,
        front_door_password: property.front_door_password,
        unit_password: property.unit_password,
```

- [ ] **Step 5: Lint**

Run: `pnpm --filter crm lint`
Expected: no errors in `properties/[id]/_detail.tsx`.

- [ ] **Step 6: Manual verify**

On a property detail page (read view): both codes appear masked with an eye toggle and copy
button; reveal shows the code; copy copies it; an empty code shows `-`. The edit tab
pre-fills both inputs.

- [ ] **Step 7: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/properties/[id]/_detail.tsx"
git commit -m "feat(properties): show door/unit passwords on property detail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Tenant detail display

Select the columns via the active lease's property and render them in the 현재 계약 panel.

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx`

**Interfaces:**
- Consumes: `SecretValue` (Task 2); `property.front_door_password` / `property.unit_password` (Task 1) via the lease→property join. `activeLease` already carries the joined property fields.

- [ ] **Step 1: Import `SecretValue`**

Add near the other `@/components` imports in `tenants/[id]/_detail.tsx`:

```tsx
import { SecretValue } from "@/components/secret-value";
```

- [ ] **Step 2: Select the two columns in the lease→property query**

In the leases query (the one with `.innerJoin("property", "property.id", "lease.property_id")`),
in its `.select([...])`, after `"property.address_detail",` add:

```tsx
        "property.address_detail",
        "property.front_door_password",
        "property.unit_password",
```

- [ ] **Step 3: Render in the 현재 계약 panel**

In the `현재 계약` `DetailPanel`, after the 계약기간 `DetailRow` (the one showing
`{formatDate(activeLease.start_date)} ~ ...`), add:

```tsx
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
```

- [ ] **Step 4: Lint**

Run: `pnpm --filter crm lint`
Expected: no errors in `tenants/[id]/_detail.tsx`.

- [ ] **Step 5: Manual verify**

On a tenant with an active lease: the 현재 계약 panel shows 현관 비밀번호 and 집 비밀번호,
masked, with reveal + copy, sourced from that lease's property. A tenant with no active lease
is unaffected (panel still shows "활성 계약이 없습니다.").

- [ ] **Step 6: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx"
git commit -m "feat(tenants): show property door/unit passwords in 현재 계약

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** migration + types (Task 1) ✓; reveal component (Task 2) ✓; form + actions
  (Task 3) ✓; property detail (Task 4) ✓; tenant detail (Task 5) ✓. Non-goals (encryption,
  RBAC, history) intentionally excluded.
- **Type consistency:** component named `SecretValue({ value, label })` used identically in
  Tasks 4 & 5; columns `front_door_password` / `unit_password` and prop fields match across
  Tasks 1, 3, 4, 5.
- **Verification:** no pure logic to unit-test (client UI + schema), so each task verifies via
  `pnpm --filter crm lint` + manual dev-server check, per the spec's testing section.
