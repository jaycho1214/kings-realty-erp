# 지원금(OHA) by-rank popover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a tenant's rank badge opens a popover showing the full grouped OHA allowance (지원금) table with the tenant's rank-group highlighted and admin-editable inline; the same grouped rows back the Settings master.

**Architecture:** Restructure `oha_rate` from per-individual-rank (placeholder USD) to group-keyed KRW rows (4 housing groups + Utility + MIHA), seeded from the real OHA sheet. A pure `lib/oha-groups.ts` maps a stored rank → group code and holds display config (client-safe). A shared `<OhaRateTable>` (a `<form action={updateOhaRates}>`) renders the grouped table in both the tenant popover and the Settings tab. One admin-gated server action edits amounts in place.

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), React 19, Kysely + Postgres, better-auth (role gating), base-ui/shadcn (Popover, Badge, Table, Input), Tailwind. Spec: `docs/superpowers/specs/2026-06-17-oha-allowance-rank-popover-design.md`.

## Global Constraints

- **No unit-test runner exists in this repo.** Verification gates are: ESLint (`pnpm --filter crm lint`), TypeScript (`pnpm --filter crm exec tsc --noEmit`), the migration runner (`pnpm db:migrate` / `:down`), a one-off `npx tsx` assertion for pure logic, and manual browser checks. Do **not** add a test framework (YAGNI).
- **Migration number is `016`** (latest on disk is `015_property_address_jibeon.ts`).
- **Currency is KRW** everywhere for OHA. Amounts display via `formatKRW` from `@/lib/utils`.
- **OHA edits are admin-only**, enforced server-side by `requireAdmin()` (see `lib/authz.ts`). Client passes `editable` (= `isAdmin(role)`) to render read-only for non-admins.
- **Rank values** are a fixed dropdown: `E-1`–`E-9`, `W-1`–`W-5`, `O-1`–`O-11` (`tenant-form.tsx:24-46`). No `O-1E` variant is stored.
- **Group codes (exact):** `E1-E4`, `E5-O4`, `W5-O5`, `O6-O10`, `UTILITY`, `MIHA`.
- **Seed values (KRW, 비동반 / 동반), effective `2025-01-16`:** `E1-E4` 2909999/3233333 · `E5-O4` 3172788/3525320 · `W5-O5` 3600000/4000000 · `O6-O10` 4298400/4776000 · `UTILITY` 780367/1040490 · `MIHA` 334776/334776.
- `types.ts` is **generated** (`pnpm db:generate`, needs a live DB via `.env`). After the migration, regenerate it; if no DB is reachable, hand-edit the one field (Task 1).
- Commit after each task. Branch: work on a feature branch off `main` (not directly on `main`).

## File Structure

| File | Responsibility |
|---|---|
| `packages/db/src/migrations/016_oha_grouped.ts` | **new** — rename `rank`→`code`, clear placeholders, reseed KRW grouped rows, default currency KRW |
| `packages/db/src/types.ts` | regenerated/edited: `OhaRate.rank` → `code` |
| `apps/crm/src/lib/oha-groups.ts` | **new, pure (no DB import)** — `OHA_GROUPS` config, `OhaGroupCode`, `rankToGroupCode()` |
| `apps/crm/src/lib/oha.ts` | `getOhaLimit` uses `rankToGroupCode` + queries by `code`, returns KRW |
| `apps/crm/src/app/(dashboard)/settings/_actions.ts` | drop `addOhaRate`/`endOhaRate`/`deleteOhaRate`; add `updateOhaRates` |
| `apps/crm/src/components/oha-rate-table.tsx` | **new** — shared grouped editable table (`<form action>`) |
| `apps/crm/src/app/(dashboard)/tenants/_components/oha-allowance-popover.tsx` | **new** — rank chip trigger + popover |
| `apps/crm/src/app/(dashboard)/tenants/[id]/page.tsx` | load OHA rows, render popover trigger, KRW "OHA 한도" |
| `apps/crm/src/app/(dashboard)/settings/data/page.tsx` | query `code`, reshape rows + effective date, pass `isAdmin` |
| `apps/crm/src/app/(dashboard)/settings/data/_components/data-settings.tsx` | swap `OhaRateRow[]` props → reshaped rows |
| `apps/crm/src/app/(dashboard)/settings/_components/oha-rates.tsx` | rework to render shared `OhaRateTable` |

---

### Task 1: Restructure & reseed the `oha_rate` table

**Files:**
- Create: `packages/db/src/migrations/016_oha_grouped.ts`
- Modify: `packages/db/src/types.ts:261-271` (regenerate or hand-edit `OhaRate`)

**Interfaces:**
- Produces: `oha_rate` table keyed by `code varchar` (values: `E1-E4`,`E5-O4`,`W5-O5`,`O6-O10`,`UTILITY`,`MIHA`), one current row per `(code, dependent_status)`, `currency='KRW'`, `effective_from='2025-01-16'`, `effective_to=null`. Kysely type `OhaRate.code: string`.

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/016_oha_grouped.ts`:

```ts
import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * OHA 기준표를 계급 그룹 단위(KRW)로 재구성한다.
 *
 * 012 의 예시 데이터(계급별·USD)를 실제 OHA Rates 시트(2025-01-16 시행, KRW)에
 * 맞춰 그룹 코드(E1-E4 / E5-O4 / W5-O5 / O6-O10 + UTILITY/MIHA)로 교체한다.
 * `rank` 컬럼을 `code` 로 rename 하고, 그룹×부양상태 당 1행만 유지한다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const typedDb = db as Kysely<Record<string, Record<string, unknown>>>;

  // 1) Drop placeholder rows.
  await typedDb.deleteFrom("oha_rate").execute();

  // 2) rank -> code, recreate lookup index, default currency KRW.
  await db.schema.alterTable("oha_rate").renameColumn("rank", "code").execute();
  await db.schema.dropIndex("idx_oha_rate_lookup").ifExists().execute();
  await db.schema
    .createIndex("idx_oha_rate_lookup")
    .on("oha_rate")
    .columns(["code", "dependent_status"])
    .execute();
  await sql`ALTER TABLE oha_rate ALTER COLUMN currency SET DEFAULT 'KRW'`.execute(
    db,
  );

  // 3) Seed real grouped rates (KRW), effective 2025-01-16.
  const amounts: Record<string, { without: number; with: number }> = {
    "E1-E4": { without: 2909999, with: 3233333 },
    "E5-O4": { without: 3172788, with: 3525320 },
    "W5-O5": { without: 3600000, with: 4000000 },
    "O6-O10": { without: 4298400, with: 4776000 },
    UTILITY: { without: 780367, with: 1040490 },
    MIHA: { without: 334776, with: 334776 },
  };
  const rows: Record<string, unknown>[] = [];
  for (const [code, amt] of Object.entries(amounts)) {
    for (const dep of ["without", "with"] as const) {
      rows.push({
        code,
        dependent_status: dep,
        region: "Default",
        amount: String(amt[dep]),
        currency: "KRW",
        effective_from: "2025-01-16",
      });
    }
  }
  await typedDb.insertInto("oha_rate").values(rows).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const typedDb = db as Kysely<Record<string, Record<string, unknown>>>;
  await typedDb.deleteFrom("oha_rate").execute();
  await db.schema.dropIndex("idx_oha_rate_lookup").ifExists().execute();
  await db.schema.alterTable("oha_rate").renameColumn("code", "rank").execute();
  await db.schema
    .createIndex("idx_oha_rate_lookup")
    .on("oha_rate")
    .columns(["rank", "dependent_status"])
    .execute();
  await sql`ALTER TABLE oha_rate ALTER COLUMN currency SET DEFAULT 'USD'`.execute(
    db,
  );
}
```

- [ ] **Step 2: Run the migration**

Run: `pnpm db:migrate`
Expected: `↑ 016_oha_grouped: Success` then `Done.`

- [ ] **Step 3: Verify the rows**

Run (psql via the same `DATABASE_URL`):
`psql "$DATABASE_URL" -c "select code, dependent_status, amount, currency, effective_from from oha_rate order by code, dependent_status;"`
Expected: exactly 12 rows, all `currency=KRW`, `effective_from=2025-01-16`, amounts matching the Global Constraints seed table (e.g. `E5-O4 | with | 3525320`).

- [ ] **Step 4: Regenerate Kysely types**

Run: `pnpm db:generate`
Expected: `packages/db/src/types.ts` `OhaRate` now has `code: string` instead of `rank: string`.
If no DB is reachable for codegen, hand-edit `packages/db/src/types.ts:269` from `rank: string;` to `code: string;`.

- [ ] **Step 5: Verify down-migration is reversible (then re-up)**

Run: `pnpm db:migrate:down` → expect `↓ 016_oha_grouped: Success`; then `pnpm db:migrate` to restore. (Re-run `pnpm db:generate` if you left it down.)

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/migrations/016_oha_grouped.ts packages/db/src/types.ts
git commit -m "feat(db): restructure oha_rate to group-keyed KRW rates (016)"
```

---

### Task 2: Pure OHA group config + rank→group mapping

**Files:**
- Create: `apps/crm/src/lib/oha-groups.ts`

**Interfaces:**
- Produces:
  - `type OhaGroupCode = "E1-E4" | "E5-O4" | "W5-O5" | "O6-O10" | "UTILITY" | "MIHA"`
  - `interface OhaGroupConfig { code: OhaGroupCode; kind: "housing"|"utility"|"miha"; shortLabel: string; detailLabel: string; oneTime: boolean; sort: number }`
  - `const OHA_GROUPS: OhaGroupConfig[]` (sorted by `sort`)
  - `function rankToGroupCode(rank: string | null | undefined): OhaGroupCode | null`
- This file imports **nothing** (client- and server-safe).

- [ ] **Step 1: Write the module**

Create `apps/crm/src/lib/oha-groups.ts`:

```ts
/**
 * OHA(해외주택수당) 기준표 그룹 정의 + 계급→그룹 매핑.
 *
 * 실제 OHA Rates 시트는 계급을 그룹으로 묶고(E1~E4 / E5~O4 / W5,O5 / O6~O10),
 * 공과금(Utility)·MIHA(1회성) 정액 항목이 따로 있다. 이 파일은 DB 의존성이 없는
 * 순수 모듈이라 서버/클라이언트 양쪽에서 import 할 수 있다(금액 조회는 lib/oha.ts).
 */

export type OhaGroupCode =
  | "E1-E4"
  | "E5-O4"
  | "W5-O5"
  | "O6-O10"
  | "UTILITY"
  | "MIHA";

export type OhaGroupKind = "housing" | "utility" | "miha";

export interface OhaGroupConfig {
  code: OhaGroupCode;
  kind: OhaGroupKind;
  /** Compact label for non-highlighted rows. */
  shortLabel: string;
  /** Full 계급 detail shown on the tenant's own/highlighted row. */
  detailLabel: string;
  /** One-time charge (MIHA) — renders a 1회성 tag. */
  oneTime: boolean;
  /** Display order. */
  sort: number;
}

export const OHA_GROUPS: OhaGroupConfig[] = [
  { code: "E1-E4", kind: "housing", shortLabel: "E1~E4", detailLabel: "E1~E4", oneTime: false, sort: 1 },
  { code: "E5-O4", kind: "housing", shortLabel: "E5~O4", detailLabel: "E5~E9, W1~W4, O1E~O3E, O1~O4", oneTime: false, sort: 2 },
  { code: "W5-O5", kind: "housing", shortLabel: "W5/O5", detailLabel: "W5, O5", oneTime: false, sort: 3 },
  { code: "O6-O10", kind: "housing", shortLabel: "O6~O10", detailLabel: "O6~O10", oneTime: false, sort: 4 },
  { code: "UTILITY", kind: "utility", shortLabel: "공과금", detailLabel: "공과금 (Utility)", oneTime: false, sort: 5 },
  { code: "MIHA", kind: "miha", shortLabel: "MIHA", detailLabel: "MIHA", oneTime: true, sort: 6 },
];

/**
 * Map a stored rank ("E-5", "O-3", "W-2") to its OHA housing group code.
 * Returns null for blank/unknown ranks. Utility/MIHA are never a rank's group.
 */
export function rankToGroupCode(
  rank: string | null | undefined,
): OhaGroupCode | null {
  if (!rank) return null;
  const m = /^([EWO])-?(\d+)/i.exec(rank.trim());
  if (!m) return null;
  const branch = m[1].toUpperCase();
  const num = Number(m[2]);
  if (!Number.isFinite(num)) return null;

  if (branch === "E") {
    if (num >= 1 && num <= 4) return "E1-E4";
    if (num >= 5 && num <= 9) return "E5-O4";
    return null;
  }
  if (branch === "W") {
    if (num >= 1 && num <= 4) return "E5-O4";
    if (num === 5) return "W5-O5";
    return null;
  }
  // branch === "O"
  if (num >= 1 && num <= 4) return "E5-O4";
  if (num === 5) return "W5-O5";
  if (num >= 6) return "O6-O10"; // O-6..O-11
  return null;
}
```

- [ ] **Step 2: Write a one-off assertion and run it (acts as the unit test)**

Run from the repo root:

```bash
npx tsx -e '
import { rankToGroupCode, OHA_GROUPS } from "./apps/crm/src/lib/oha-groups.ts";
const cases: [string | null, string | null][] = [
  ["E-1","E1-E4"],["E-4","E1-E4"],["E-5","E5-O4"],["E-9","E5-O4"],
  ["W-1","E5-O4"],["W-4","E5-O4"],["W-5","W5-O5"],
  ["O-1","E5-O4"],["O-4","E5-O4"],["O-5","W5-O5"],["O-6","O6-O10"],["O-11","O6-O10"],
  ["O-1E","E5-O4"],[null,null],["",null],["X-9",null],
];
let ok = true;
for (const [rank, want] of cases) {
  const got = rankToGroupCode(rank);
  if (got !== want) { ok = false; console.error("FAIL", rank, "->", got, "want", want); }
}
if (OHA_GROUPS.length !== 6) { ok = false; console.error("FAIL OHA_GROUPS length", OHA_GROUPS.length); }
console.log(ok ? "ALL PASS" : "FAILURES ABOVE");
process.exit(ok ? 0 : 1);
'
```

Expected: `ALL PASS` (exit 0).

- [ ] **Step 3: Commit**

```bash
git add apps/crm/src/lib/oha-groups.ts
git commit -m "feat(oha): pure rank-group config + rankToGroupCode mapping"
```

---

### Task 3: Update `getOhaLimit` to group-code lookup (KRW)

**Files:**
- Modify: `apps/crm/src/lib/oha.ts`

**Interfaces:**
- Consumes: `rankToGroupCode` from Task 2; `oha_rate.code` from Task 1.
- Produces: `getOhaLimit(rank, dependentStatus, region?, atDate?)` unchanged signature, returns `{ amount, currency } | null` (currency now `KRW`).

- [ ] **Step 1: Rewrite the query to use `code`**

Replace the body of `apps/crm/src/lib/oha.ts` with:

```ts
import { getDb } from "@kingsrealty/db";
import { seoulDateString } from "@/lib/date";
import { rankToGroupCode } from "@/lib/oha-groups";

/**
 * Look up a tenant's OHA monthly limit: the grouped rate matching the rank's
 * OHA group + dependent_status whose effective window contains `atDate`
 * (default today). Display/compare only — never auto-deducted (§9.4).
 */
export async function getOhaLimit(
  rank: string | null | undefined,
  dependentStatus: string | null | undefined,
  region = "Default",
  atDate: string = seoulDateString(),
): Promise<{ amount: number; currency: string } | null> {
  if (!rank || !dependentStatus) return null;
  const code = rankToGroupCode(rank);
  if (!code) return null;
  const db = getDb();
  const at = new Date(atDate);
  const row = await db
    .selectFrom("oha_rate")
    .select(["amount", "currency"])
    .where("code", "=", code)
    .where("dependent_status", "=", dependentStatus)
    .where("region", "=", region)
    .where("effective_from", "<=", at)
    .where((eb) =>
      eb.or([eb("effective_to", "is", null), eb("effective_to", ">=", at)]),
    )
    .orderBy("effective_from", "desc")
    .executeTakeFirst();
  return row ? { amount: Number(row.amount), currency: row.currency } : null;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter crm exec tsc --noEmit`
Expected: no errors (in particular, `.where("code", ...)` resolves against the regenerated `OhaRate` type).

- [ ] **Step 3: Commit**

```bash
git add apps/crm/src/lib/oha.ts
git commit -m "feat(oha): getOhaLimit resolves rank to group code, returns KRW"
```

---

### Task 4: Shared `updateOhaRates` action + `OhaRateTable` component

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/settings/_actions.ts:8-60` (replace the three OHA actions with one)
- Create: `apps/crm/src/components/oha-rate-table.tsx`

**Interfaces:**
- Consumes: `OHA_GROUPS` (Task 2), `formatKRW`/`cn` (`@/lib/utils`), `SubmitButton` (`@/components/submit-button`), `requireAdmin` (`@/lib/authz`).
- Produces:
  - `updateOhaRates(formData: FormData): Promise<void>` — admin-gated; reads `amount__{code}__{with|without}` fields, updates current rows in place.
  - `<OhaRateTable rows={Record<string,{with:string;without:string}>} highlightCode?={string|null} currentRank?={string|null} editable={boolean} />`

- [ ] **Step 1: Replace the per-rank OHA actions with `updateOhaRates`**

In `apps/crm/src/app/(dashboard)/settings/_actions.ts`, delete `addOhaRate`, `endOhaRate`, and `deleteOhaRate` (lines 8-60, the block under `// --- OHA rate table (OHA 기준표) ---` up to the `// --- Realty fee defaults` comment) and put in their place:

```ts
// --- OHA rate table (OHA 기준표) ---

/**
 * Bulk in-place amount update for the grouped OHA table. Reads
 * `amount__{code}__{with|without}` fields and updates each current row
 * (effective_to is null). Shared by the Settings master and the tenant
 * 지원금 popover. Admin-only.
 */
export async function updateOhaRates(formData: FormData) {
  await requireAdmin();
  const db = getDb();

  const updates: {
    code: string;
    dependent_status: "with" | "without";
    amount: number;
  }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^amount__(.+)__(with|without)$/.exec(key);
    if (!m) continue;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("금액을 올바르게 입력해주세요.");
    }
    updates.push({
      code: m[1],
      dependent_status: m[2] as "with" | "without",
      amount,
    });
  }

  for (const u of updates) {
    await db
      .updateTable("oha_rate")
      .set({ amount: String(u.amount) })
      .where("code", "=", u.code)
      .where("dependent_status", "=", u.dependent_status)
      .where("region", "=", "Default")
      .where("effective_to", "is", null)
      .execute();
  }

  revalidatePath("/settings");
  revalidatePath("/tenants", "layout");
}
```

(Leave the `seoulDateString` import in place only if other actions in the file still use it; if it becomes unused after deleting the three actions, remove it from the imports to satisfy lint.)

- [ ] **Step 2: Create the shared table component**

Create `apps/crm/src/components/oha-rate-table.tsx`:

```tsx
"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { OHA_GROUPS } from "@/lib/oha-groups";
import { formatKRW, cn } from "@/lib/utils";
import { updateOhaRates } from "@/app/(dashboard)/settings/_actions";

interface OhaAmounts {
  with: string;
  without: string;
}

interface OhaRateTableProps {
  /** Amounts keyed by group code: { "E1-E4": { with, without }, ... }. */
  rows: Record<string, OhaAmounts>;
  /** Group code to highlight (the tenant's own group). */
  highlightCode?: string | null;
  /** Shown as "현재 계급: …" on the highlighted row. */
  currentRank?: string | null;
  /** Admins get editable inputs + 저장; others see read-only amounts. */
  editable: boolean;
}

export function OhaRateTable({
  rows,
  highlightCode,
  currentRank,
  editable,
}: OhaRateTableProps) {
  return (
    <form action={updateOhaRates} className="space-y-2.5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>계급</TableHead>
            <TableHead className="text-right">비동반</TableHead>
            <TableHead className="text-right">동반</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {OHA_GROUPS.map((g) => {
            const r = rows[g.code] ?? { with: "0", without: "0" };
            const on = highlightCode === g.code;
            return (
              <TableRow key={g.code} className={cn(on && "bg-brand-weak/60")}>
                <TableCell
                  className={cn(
                    "font-medium",
                    on && "border-l-2 border-brand",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1.5">
                      {on ? g.detailLabel : g.shortLabel}
                      {g.oneTime && (
                        <span className="rounded bg-secondary px-1 text-[10px] text-muted-foreground">
                          1회성
                        </span>
                      )}
                    </span>
                    {on && currentRank && (
                      <span className="text-[11px] text-brand">
                        현재 계급: {currentRank}
                      </span>
                    )}
                  </div>
                </TableCell>
                {(["without", "with"] as const).map((dep) => (
                  <TableCell key={dep} className="text-right">
                    {editable ? (
                      <Input
                        type="number"
                        name={`amount__${g.code}__${dep}`}
                        defaultValue={r[dep]}
                        className="tabular ml-auto h-8 w-28 text-right"
                      />
                    ) : (
                      <span className="tabular">{formatKRW(Number(r[dep]))}</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {editable && (
        <div className="flex justify-end">
          <SubmitButton label="저장" />
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter crm exec tsc --noEmit && pnpm --filter crm lint`
Expected: no errors. (Confirms the `updateOhaRates` import path `@/app/(dashboard)/settings/_actions` resolves and the deleted actions aren't referenced anywhere yet — Task 6 fixes the old `oha-rates.tsx` consumer; if lint fails there, proceed to Task 6 in the same branch before final verification.)

> Note: `settings/_components/oha-rates.tsx` still imports the now-deleted actions until Task 6. Implement Tasks 4 and 6 back-to-back (or 4→6 before running a full build) so the tree compiles. The intermediate commit here is fine; the branch only needs to be green by end of Task 6.

- [ ] **Step 4: Commit**

```bash
git add apps/crm/src/app/(dashboard)/settings/_actions.ts apps/crm/src/components/oha-rate-table.tsx
git commit -m "feat(oha): shared OhaRateTable + admin updateOhaRates action"
```

---

### Task 5: Tenant page — rank popover trigger + KRW display

**Files:**
- Create: `apps/crm/src/app/(dashboard)/tenants/_components/oha-allowance-popover.tsx`
- Modify: `apps/crm/src/app/(dashboard)/tenants/[id]/page.tsx`

**Interfaces:**
- Consumes: `OhaRateTable` (Task 4), `rankToGroupCode` (Task 2), `formatKRW`/`formatDate` (`@/lib/utils`), `isAdmin` (`@/lib/authz`).
- Produces: `<OhaAllowancePopover rank currentGroupCode rows effectiveFrom editable />`.

- [ ] **Step 1: Create the popover component**

Create `apps/crm/src/app/(dashboard)/tenants/_components/oha-allowance-popover.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { OhaRateTable } from "@/components/oha-rate-table";
import { formatDate, cn } from "@/lib/utils";

interface OhaAllowancePopoverProps {
  rank: string;
  /** The tenant's OHA group code, or null if the rank doesn't map. */
  currentGroupCode: string | null;
  rows: Record<string, { with: string; without: string }>;
  effectiveFrom: string | null;
  editable: boolean;
}

export function OhaAllowancePopover({
  rank,
  currentGroupCode,
  rows,
  effectiveFrom,
  editable,
}: OhaAllowancePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          badgeVariants({ variant: "secondary" }),
          "cursor-pointer gap-1 ring-1 ring-transparent transition hover:ring-brand/40",
        )}
      >
        <Coins className="size-3" />
        {rank}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[420px] max-w-[calc(100vw-2rem)]"
      >
        <PopoverHeader className="flex-row items-center justify-between">
          <PopoverTitle>지원금 (OHA)</PopoverTitle>
          <Link
            href="/settings/data"
            className="text-xs text-brand hover:underline"
          >
            전체 기준표 →
          </Link>
        </PopoverHeader>
        {effectiveFrom && (
          <p className="text-[11px] text-muted-foreground">
            시행일 {formatDate(effectiveFrom)}
          </p>
        )}
        <OhaRateTable
          rows={rows}
          highlightCode={currentGroupCode}
          currentRank={rank}
          editable={editable}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Load OHA rows + admin flag in the page**

In `apps/crm/src/app/(dashboard)/tenants/[id]/page.tsx`:

(a) Extend the imports:

```ts
import { sexMap, branchMap, leaseStatusMap } from "@/lib/labels";
import { buildTenantLedger } from "@/lib/ledger";
import { getOhaLimit } from "@/lib/oha";
import { rankToGroupCode } from "@/lib/oha-groups";
import { getSession } from "@/lib/session";
import { canViewSensitive, isAdmin } from "@/lib/authz";
import { OhaAllowancePopover } from "../_components/oha-allowance-popover";
```

(b) Add an `oha_rate` query to the second `Promise.all` (the one that already yields `ohaLimit`, `charges`, …). Append this element after the `charge_item` query:

```ts
    db
      .selectFrom("oha_rate")
      .select(["code", "dependent_status", "amount", "effective_from"])
      .where("effective_to", "is", null)
      .where("region", "=", "Default")
      .execute(),
```

and add `ohaRateRows` to the destructured array:

```ts
  const [
    vacantProperties,
    realtyFeeRows,
    ledger,
    exchangeVendors,
    session,
    ohaLimit,
    charges,
    ohaRateRows,
  ] = await Promise.all([
```

(c) After `const canViewRrn = ...` (around line 217), reshape the rows and compute flags:

```ts
  const isAdminUser = isAdmin(session?.user?.role);
  const tenantGroupCode = rankToGroupCode(tenant.rank);

  const ohaRows: Record<string, { with: string; without: string }> = {};
  let ohaEffectiveFrom: string | null = null;
  for (const r of ohaRateRows) {
    const entry = (ohaRows[r.code] ??= { with: "0", without: "0" });
    if (r.dependent_status === "with") entry.with = String(r.amount);
    else entry.without = String(r.amount);
    if (!ohaEffectiveFrom && r.effective_from) {
      ohaEffectiveFrom =
        r.effective_from instanceof Date
          ? r.effective_from.toISOString().split("T")[0]
          : String(r.effective_from).slice(0, 10);
    }
  }
```

- [ ] **Step 3: Swap the rank chip for the popover trigger and fix the KRW display**

(a) Remove the combined `identityChip` line (`tenants/[id]/page.tsx:256`):

```ts
  const identityChip = [branchLabel, tenant.rank].filter(Boolean).join(" · ");
```

(b) Replace the `badges` prop content (currently `tenants/[id]/page.tsx:463-468`):

```tsx
      badges={
        <>
          <StatusBadge status={tenant.status} label={statusLabel} />
          {branchLabel && <Badge variant="secondary">{branchLabel}</Badge>}
          {tenant.rank && (
            <OhaAllowancePopover
              rank={tenant.rank}
              currentGroupCode={tenantGroupCode}
              rows={ohaRows}
              effectiveFrom={ohaEffectiveFrom}
              editable={isAdminUser}
            />
          )}
        </>
      }
```

(c) Change the "OHA 한도" `Def` (currently `tenants/[id]/page.tsx:336-340`) from `$` to KRW:

```tsx
            <Def label="OHA 한도" mono>
              {ohaLimit ? `${formatKRW(ohaLimit.amount)} / 월` : "기준표 없음"}
            </Def>
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter crm exec tsc --noEmit && pnpm --filter crm lint`
Expected: no errors. (`Badge` is still imported/used for the branch chip; `formatKRW` already imported.)

- [ ] **Step 5: Manual browser check**

Run `pnpm --filter crm dev` (port 5007), sign in as an **admin**, open a tenant whose rank is e.g. `E-5`:
- Header shows a branch chip and a clickable rank chip (coins icon).
- Clicking it opens the popover: title "지원금 (OHA)", 시행일 2025-01-16, the 6-row table, the **E5~O4** row highlighted with the full detail label and "현재 계급: E-5".
- 군 정보 → "OHA 한도" shows `₩3,172,788 / 월` (without-dependent) or `₩3,525,320 / 월` (with-dependent) per the tenant's `dependent_status`.
- A tenant with no rank shows no rank chip and the page still renders.

- [ ] **Step 6: Commit**

```bash
git add apps/crm/src/app/\(dashboard\)/tenants/_components/oha-allowance-popover.tsx apps/crm/src/app/\(dashboard\)/tenants/\[id\]/page.tsx
git commit -m "feat(tenants): rank badge opens editable 지원금(OHA) popover; KRW OHA limit"
```

---

### Task 6: Rework the Settings OHA master onto the shared table

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/settings/data/page.tsx:81-96` (OHA query) and the render
- Modify: `apps/crm/src/app/(dashboard)/settings/data/_components/data-settings.tsx`
- Rewrite: `apps/crm/src/app/(dashboard)/settings/_components/oha-rates.tsx`

**Interfaces:**
- Consumes: `OhaRateTable` (Task 4), `getSession`/`isAdmin`.
- Produces: Settings "OHA 기준표" tab renders the same grouped editable table, writing via `updateOhaRates`.

- [ ] **Step 1: Rewrite `oha-rates.tsx` to use the shared table**

Replace the entire contents of `apps/crm/src/app/(dashboard)/settings/_components/oha-rates.tsx` with:

```tsx
import { OhaRateTable } from "@/components/oha-rate-table";

interface OhaRatesProps {
  rows: Record<string, { with: string; without: string }>;
  editable: boolean;
}

export function OhaRates({ rows, editable }: OhaRatesProps) {
  return (
    <div className="space-y-3 p-3">
      <p className="px-1 text-xs text-muted-foreground">
        실제 OHA Rates 시트 기준입니다(KRW). 금액을 수정하고 저장하세요. 세입자
        상세의 계급 배지에서도 동일한 표를 편집할 수 있습니다.
      </p>
      <OhaRateTable rows={rows} editable={editable} />
    </div>
  );
}
```

- [ ] **Step 2: Update the settings query + reshape in `data/page.tsx`**

In `apps/crm/src/app/(dashboard)/settings/data/page.tsx`:

(a) Add session imports at the top:

```ts
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/authz";
```

(b) Replace the `oha_rate` query (lines 81-96) with one that selects `code` and only current rows:

```ts
    db
      .selectFrom("oha_rate")
      .select(["code", "dependent_status", "amount", "effective_from"])
      .where("effective_to", "is", null)
      .where("region", "=", "Default")
      .execute(),
```

(Keep its position in the `Promise.all`; the destructured name stays `ohaRates`.)

(c) After the existing `serviceCategoryUsageMap` loop (around line 126), reshape and read the session:

```ts
  const ohaRows: Record<string, { with: string; without: string }> = {};
  for (const r of ohaRates) {
    const entry = (ohaRows[r.code] ??= { with: "0", without: "0" });
    if (r.dependent_status === "with") entry.with = String(r.amount);
    else entry.without = String(r.amount);
  }

  const session = await getSession();
  const canEditOha = isAdmin(session?.user?.role);
```

(d) Change the prop passed to `DataSettings` from `ohaRates={ohaRates}` to:

```tsx
      ohaRows={ohaRows}
      canEditOha={canEditOha}
```

- [ ] **Step 3: Update `data-settings.tsx` props + render**

In `apps/crm/src/app/(dashboard)/settings/data/_components/data-settings.tsx`:

(a) Delete the `OhaRateRow` interface (lines 43-52).

(b) In `DataSettingsProps` (lines 54-64), replace `ohaRates: OhaRateRow[];` with:

```ts
  ohaRows: Record<string, { with: string; without: string }>;
  canEditOha: boolean;
```

(c) In the destructured params (lines 66-76), replace `ohaRates,` with `ohaRows,` and `canEditOha,`.

(d) Replace the OHA tab render (lines 121-125):

```tsx
        <TabsContent value="oha-rates">
          <DataPanel>
            <OhaRates rows={ohaRows} editable={canEditOha} />
          </DataPanel>
        </TabsContent>
```

- [ ] **Step 4: Full typecheck, lint, and build**

Run: `pnpm --filter crm exec tsc --noEmit && pnpm --filter crm lint`
Expected: no errors anywhere (the old `addOhaRate`/`endOhaRate`/`deleteOhaRate` references are gone; the new `OhaRates` signature matches its only caller).

Then a production build as the final gate:
Run: `pnpm --filter crm build`
Expected: build succeeds.

- [ ] **Step 5: Manual browser check (parity)**

In `dev`, go to Settings → 데이터 관리 → **OHA 기준표** as an admin:
- The grouped table shows the same 6 rows/amounts as the tenant popover (no row highlighted here).
- Edit `E5-O4` 동반 to a new value, 저장 → value persists; reopen a tenant in `E5-O4` and confirm the popover and "OHA 한도" reflect the new amount.
- As a non-admin (or by temporarily passing `editable={false}`), amounts render read-only with no 저장 button.

- [ ] **Step 6: Commit**

```bash
git add apps/crm/src/app/\(dashboard\)/settings/_components/oha-rates.tsx apps/crm/src/app/\(dashboard\)/settings/data/page.tsx apps/crm/src/app/\(dashboard\)/settings/data/_components/data-settings.tsx
git commit -m "feat(settings): OHA 기준표 uses shared grouped editable table"
```

---

## Self-Review

**Spec coverage:**
- Group-keyed KRW model + seed + effective date → Task 1. ✓
- Rank→group mapping + `OHA_GROUPS` config → Task 2. ✓
- `getOhaLimit` group lookup + KRW → Task 3. ✓
- Shared `updateOhaRates` action (admin-gated, in-place) → Task 4. ✓
- Shared `OhaRateTable` (highlight, editable/read-only, Utility+MIHA, 1회성) → Task 4. ✓
- Rank badge → popover trigger; "전체 기준표 →" link; effective date; KRW "OHA 한도" → Task 5. ✓
- Settings master reworked onto the same grouped rows; old per-rank actions removed → Task 6. ✓
- Permissions (admin edit, others read-only) → `editable` prop wired in Tasks 5 & 6; server gate in Task 4. ✓
- Out-of-scope items (versioning UI, region UI, O-1E tracking, auto-apply) → not built. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `OhaGroupCode` and `code` column used consistently; `rows: Record<string,{with,without}>` shape identical across `OhaRateTable`, popover, tenant page, settings page; `updateOhaRates(formData)` field convention `amount__{code}__{with|without}` matches the table's `name=` attributes; `OhaRates` new props (`rows`, `editable`) match its single caller. ✓

**Cross-task compile note:** Task 4 deletes the old OHA actions that `oha-rates.tsx` still imports; Task 6 rewrites that consumer. Implement 4→6 before the final `pnpm --filter crm build` gate (called out in Task 4 Step 3 and Task 6 Step 4).
