# Property door/unit passwords (현관 · 집 비밀번호)

**Date:** 2026-07-01
**Status:** Approved

## Problem

Each managed unit has access codes — a front-door / lobby code (현관 비밀번호) and a
unit-door code (집 비밀번호). Staff need these on hand when coordinating move-in,
maintenance, or visits, but they aren't recorded anywhere. They should be editable on the
property and viewable from the tenant's page (the operator's most common jumping-off point).

## Goals

- Store two access codes per property.
- Edit them on the property create/edit form.
- View (and copy) them on both the **property detail** page and the **tenant detail** page.

## Non-goals

- Encryption at rest / server-side reveal with audit logging (the RRN pattern). These are
  operational codes, not regulated PII — chosen approach is plaintext + client-side masking.
- Per-field / per-role permission gating. Anyone who can view the property or tenant sees
  the codes (consistent with how the property detail page already exposes all fields).
- History / rotation tracking of codes.

## Security posture (explicit)

Plaintext columns, masked in the UI by default with a client-side reveal toggle. Because the
values are plaintext and sent to the client, they exist in the page's RSC payload/HTML
regardless of the mask — the mask defends against shoulder-surfing and screen-sharing, **not**
against someone reading the network response. This is the accepted trade-off for the
convenience the feature is about. If stronger secrecy is ever needed, migrate to the RRN
pattern (encrypted column + `reveal*` server action + `audit_log`).

## Design

### 1. Migration — `packages/db/src/migrations/026_property_door_passwords.ts`

Add two nullable columns to `property` (unbounded `varchar`, matching the table's existing
columns):

- `front_door_password` → 현관 비밀번호
- `unit_password` → 집 비밀번호

`up()` = two `alterTable("property").addColumn(...)`; `down()` = drop both. Both nullable, no
default — existing rows simply have no codes.

Then regenerate Kysely types: `pnpm --filter @kingsrealty/db db:up` (runs the migration and
`kysely-codegen`), which adds `front_door_password: string | null` and
`unit_password: string | null` to the `Property` interface in `packages/db/src/types.ts`.

### 2. Reveal component — `apps/crm/src/components/secret-value.tsx` (new, client)

A small reusable client component, reused by both detail pages.

```
<SecretValue value={string | null} label="현관 비밀번호" />
```

- `value == null || value.trim() === ""` → render `<span className="text-muted-foreground">-</span>`
  (matches the existing empty-value convention).
- Otherwise render, inline: masked text (`●●●●●`, fixed-width mask independent of the real
  length so it doesn't leak the code length), an eye/eye-off ghost `icon-sm` toggle
  (`aria-label={\`${label} 보기\`}` / `가리기`), and a copy button (`Copy` → `Check` for ~2s,
  via `navigator.clipboard.writeText`). Mirrors `LandlordRrn`'s visual style but is fully
  client-side — no server action, since the value is already in props.

### 3. Property form — `_components/property-form.tsx`

Add two text `Input`s (labels 현관 비밀번호 / 집 비밀번호), `autoComplete="off"` so browser
password managers don't hijack them. Placed with the other operational field (관리실 연락처,
Row 6). Add `front_door_password: string | null` and `unit_password: string | null` to
`PropertyFormProps.defaultValues`, seeding the inputs when editing. Plain text inputs (editing
context — no masking needed while typing).

### 4. Property actions — `_actions.ts`

In both `createProperty` and `updateProperty`: read the two fields from `FormData`, coerce
empty → `null` (`(formData.get("front_door_password") as string) || null`), and include them
in the `.values({...})` insert / `.set({...})` update. No new validation (free-form codes).

### 5. Property detail — `properties/[id]/_detail.tsx`

- Add `property.front_door_password` and `property.unit_password` to the `property` select.
- In the **매물 정보** `DefGroup`, add two `Def`s rendering `<SecretValue .../>`.
- Pass both into the `editView` `PropertyForm` `defaultValues`.

### 6. Tenant detail — `tenants/[id]/_detail.tsx`

- Add `property.front_door_password` and `property.unit_password` to the lease→property
  select (the query joining `lease`→`property`→`landlord`).
- In the **현재 계약** `DetailPanel`, add two `DetailRow`s (현관 비밀번호 / 집 비밀번호)
  rendering `<SecretValue .../>` from the active lease's property. Shown for the active lease
  only (the panel already renders only when `activeLease` exists).

## Data flow

Form (FormData) → `createProperty`/`updateProperty` → `property` row. Read paths: property
detail selects the columns directly; tenant detail selects them via the active lease's joined
property. Both render through `SecretValue`.

## Testing / verification

Mostly UI + a schema change; no pure logic worth unit-testing. Verify manually:

1. `pnpm --filter @kingsrealty/db db:up` applies migration 026 and regenerates types cleanly.
2. Create/edit a property with both codes → persisted; clearing a field stores `null`.
3. Property detail shows both, masked; eye reveals; copy copies; empty shows `-`.
4. Tenant detail (active lease) shows both in 현재 계약 with the same behavior; a tenant with
   no active lease is unaffected.
5. `pnpm lint` / typecheck pass.

## Files touched

- `packages/db/src/migrations/026_property_door_passwords.ts` (new)
- `packages/db/src/types.ts` (regenerated)
- `apps/crm/src/components/secret-value.tsx` (new)
- `apps/crm/src/app/(dashboard)/properties/_components/property-form.tsx`
- `apps/crm/src/app/(dashboard)/properties/_actions.ts`
- `apps/crm/src/app/(dashboard)/properties/[id]/_detail.tsx`
- `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx`
