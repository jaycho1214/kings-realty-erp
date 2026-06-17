# 할 일(Task) 칸반 보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared staff to-do kanban board with two views (Plan/Status), drag-to-sort, due-date badges, and an auto-suggestion rail — rendered on the dashboard (replacing `PaymentBoard`) and reachable from any page via a FAB.

**Architecture:** A new `task` schema (+`task_assignee`, `task_suggestion_dismissal`). Pure, unit-tested helpers handle plan-bucket classification, sort ordering, and suggestion dedup/dismissal. A server query (`loadBoardData`) and a set of server actions back one client `<TaskBoard>` component rendered in two layouts (`columns` on the dashboard, `stack` in the FAB sheet). Suggestions are computed from existing operational signals (lease expiry, overdue charges, open AS, DEROS).

**Tech Stack:** Next.js 16 / React 19 (server components + server actions), Kysely (Postgres), better-auth, shadcn/ui (base-ui), `@dnd-kit` for drag-and-drop, `node:test` + `tsx` for unit tests.

## Global Constraints

- Monorepo: app code in `apps/crm`, DB in `packages/db`. Package manager **pnpm**.
- All dates are **Asia/Seoul** calendar dates — compute "today"/week boundaries with `apps/crm/src/lib/date.ts` helpers, never the server clock.
- UI language is **Korean**; technical identifiers stay English.
- Money is mono/`tabular`; danger = `text-danger`, warning = `text-warning`, success = `text-success`, brand = `text-brand` (existing design tokens).
- Server actions are public endpoints — every mutation calls an authz guard (`requireUser` for any approved staff; deletion additionally checks creator-or-admin).
- No toast library exists; surface errors inline + roll back optimistic state.
- Migrations are auto-discovered by filename order (`packages/db/src/migrations/NNN_*.ts`); after migrating, regenerate `packages/db/src/types.ts` via codegen (do **not** hand-edit it).
- Run all `pnpm` commands from the repo root unless stated.

---

### Task 1: DB schema — `task`, `task_assignee`, `task_suggestion_dismissal`

**Files:**
- Create: `packages/db/src/migrations/020_task.ts`
- Modify (generated): `packages/db/src/types.ts` (via codegen, not by hand)

**Interfaces:**
- Produces tables/columns consumed by every later task:
  - `task(id, title, notes, status, planned_date, due_date, sort_order, source, suggestion_key, ref_entity_type, ref_entity_id, created_by, completed_at, created_at, updated_at)`
  - `task_assignee(id, task_id, user_id, created_at)` — unique `(task_id, user_id)`
  - `task_suggestion_dismissal(id, dedup_key, dismissed_until, dismissed_by, created_at)` — unique `(dedup_key)`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/020_task.ts` (mirrors the `014`/`019` style — `serial` PK, `timestamptz defaultTo(sql\`now()\`)`, FK `references`, unique constraints, indexes):

```ts
import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * 할 일(Task) 칸반 보드.
 *  - task: 공유 보드 카드. status(workflow) 와 planned_date(계획 버킷)를 분리,
 *    due_date 는 하드 마감일(배지 전용). source=manual|suggestion, suggestion_key
 *    로 추천 dedup, ref_entity_* 로 원본(lease/tenant/service_request/charge) 딥링크.
 *  - task_assignee: 담당자 N:M (service_request_assignee 패턴).
 *  - task_suggestion_dismissal: 추천 무시/스누즈(팀 전체 공유), dedup_key 유니크.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("task")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("title", "varchar", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("todo"))
    .addColumn("planned_date", "date")
    .addColumn("due_date", "date")
    .addColumn("sort_order", "double precision", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("source", "varchar", (col) => col.notNull().defaultTo("manual"))
    .addColumn("suggestion_key", "varchar")
    .addColumn("ref_entity_type", "varchar")
    .addColumn("ref_entity_id", "integer")
    .addColumn("created_by", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("task_assignee")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("task_id", "integer", (col) =>
      col.notNull().references("task.id").onDelete("cascade"),
    )
    .addColumn("user_id", "integer", (col) =>
      col.notNull().references("user.id"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("uq_task_assignee", ["task_id", "user_id"])
    .execute();

  await db.schema
    .createTable("task_suggestion_dismissal")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("dedup_key", "varchar", (col) => col.notNull().unique())
    .addColumn("dismissed_until", "date")
    .addColumn("dismissed_by", "integer", (col) => col.references("user.id"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_task_status")
    .on("task")
    .column("status")
    .execute();
  await db.schema
    .createIndex("idx_task_planned_date")
    .on("task")
    .column("planned_date")
    .execute();
  await db.schema
    .createIndex("idx_task_suggestion_key")
    .on("task")
    .column("suggestion_key")
    .where("suggestion_key", "is not", null)
    .execute();
  await db.schema
    .createIndex("idx_task_assignee_task")
    .on("task_assignee")
    .column("task_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("task_suggestion_dismissal").ifExists().execute();
  await db.schema.dropTable("task_assignee").ifExists().execute();
  await db.schema.dropTable("task").ifExists().execute();
}
```

- [ ] **Step 2: Run the migration up**

Run: `pnpm db:migrate`
Expected: ends with `↑ 020_task: Success` then `Done.`

- [ ] **Step 3: Verify rollback works, then re-apply**

Run: `pnpm db:migrate:down && pnpm db:migrate`
Expected: `↓ 020_task: Success` … `Done.`, then `↑ 020_task: Success` … `Done.` (clean down/up).

- [ ] **Step 4: Regenerate Kysely types**

Run: `pnpm db:generate`
Expected: command exits 0 and `packages/db/src/types.ts` now contains `export interface Task {`, `export interface TaskAssignee {`, and `export interface TaskSuggestionDismissal {`, and the `DB` interface gains `task`, `task_assignee`, `task_suggestion_dismissal` keys.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/020_task.ts packages/db/src/types.ts
git commit -m "feat(db): task kanban schema (task, task_assignee, suggestion_dismissal) (020)"
```

---

### Task 2: `seoulWeekEnd` date helper

**Files:**
- Modify: `apps/crm/src/lib/date.ts` (append a function)
- Test: `apps/crm/src/lib/date.test.ts`
- Modify: `apps/crm/package.json` (add `tsx` devDep + `test` script)

**Interfaces:**
- Consumes: existing `seoulDateString`, `addDays` from `date.ts`.
- Produces: `seoulWeekEnd(from?: string): string` — the upcoming Sunday (inclusive of today when today is Sunday) as `"YYYY-MM-DD"`.

- [ ] **Step 1: Add the test runner to the app**

Edit `apps/crm/package.json` — add to `devDependencies`: `"tsx": "^4.22.4"`, and add to `scripts`:

```json
"test": "node --import tsx --test src/lib/date.test.ts src/lib/tasks/board.test.ts src/lib/tasks/suggestions.test.ts"
```

Then run: `pnpm install`
Expected: installs `tsx` into `apps/crm`.

- [ ] **Step 2: Write the failing test**

Create `apps/crm/src/lib/date.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { seoulWeekEnd } from "./date";

test("seoulWeekEnd returns the upcoming Sunday", () => {
  // 2026-06-17 is a Wednesday → upcoming Sunday is 2026-06-21
  assert.equal(seoulWeekEnd("2026-06-17"), "2026-06-21");
});

test("seoulWeekEnd returns same day when already Sunday", () => {
  assert.equal(seoulWeekEnd("2026-06-21"), "2026-06-21");
});

test("seoulWeekEnd handles Saturday (one day to Sunday)", () => {
  assert.equal(seoulWeekEnd("2026-06-20"), "2026-06-21");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/crm && pnpm exec node --import tsx --test src/lib/date.test.ts`
Expected: FAIL — `seoulWeekEnd` is not exported / not a function.

- [ ] **Step 4: Implement `seoulWeekEnd`**

Append to `apps/crm/src/lib/date.ts`:

```ts
/**
 * Upcoming Sunday (the end of the current week) as "YYYY-MM-DD", in Asia/Seoul.
 * Returns `from` itself when it is already a Sunday. Used to bucket the 계획 뷰's
 * "이번 주" column relative to today.
 */
export function seoulWeekEnd(from: string = seoulDateString()): string {
  const [y, m, d] = from.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return addDays(from, (7 - dow) % 7);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/crm && pnpm exec node --import tsx --test src/lib/date.test.ts`
Expected: PASS — `# pass 3`.

- [ ] **Step 6: Commit**

```bash
git add apps/crm/src/lib/date.ts apps/crm/src/lib/date.test.ts apps/crm/package.json
git commit -m "feat(date): seoulWeekEnd helper + node:test runner"
```

---

### Task 3: Board pure logic — bucket classification & sort ordering

**Files:**
- Create: `apps/crm/src/lib/tasks/board.ts`
- Test: `apps/crm/src/lib/tasks/board.test.ts`

**Interfaces:**
- Consumes: `addDays` from `@/lib/date`.
- Produces:
  - `type PlanBucket = "today" | "this_week" | "later" | "done"`
  - `type TaskStatus = "todo" | "in_progress" | "done"`
  - `planBucket(t: { status: string; planned_date: string | null; completed_at: string | null }, today: string, weekEnd: string): PlanBucket`
  - `plannedDateForBucket(bucket: "today" | "this_week" | "later", today: string, weekEnd: string): string | null`
  - `midpointSortOrder(before: number | null, after: number | null): number`

- [ ] **Step 1: Write the failing test**

Create `apps/crm/src/lib/tasks/board.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { planBucket, plannedDateForBucket, midpointSortOrder } from "./board";

const TODAY = "2026-06-17";
const WEEK_END = "2026-06-21";

test("done within 7 days → done bucket", () => {
  assert.equal(
    planBucket(
      { status: "done", planned_date: null, completed_at: "2026-06-15T03:00:00Z" },
      TODAY,
      WEEK_END,
    ),
    "done",
  );
});

test("done older than 7 days → not shown (also 'done' bucket but caller hides)", () => {
  // planBucket still classifies by status; recency filtering is the caller's job.
  assert.equal(
    planBucket(
      { status: "done", planned_date: null, completed_at: "2026-06-01T03:00:00Z" },
      TODAY,
      WEEK_END,
    ),
    "done",
  );
});

test("planned today → today", () => {
  assert.equal(
    planBucket({ status: "todo", planned_date: "2026-06-17", completed_at: null }, TODAY, WEEK_END),
    "today",
  );
});

test("planned in the past (carried over) → today", () => {
  assert.equal(
    planBucket({ status: "todo", planned_date: "2026-06-10", completed_at: null }, TODAY, WEEK_END),
    "today",
  );
});

test("planned later this week → this_week", () => {
  assert.equal(
    planBucket({ status: "in_progress", planned_date: "2026-06-19", completed_at: null }, TODAY, WEEK_END),
    "this_week",
  );
});

test("planned after week end → later", () => {
  assert.equal(
    planBucket({ status: "todo", planned_date: "2026-06-30", completed_at: null }, TODAY, WEEK_END),
    "later",
  );
});

test("no planned date → later", () => {
  assert.equal(
    planBucket({ status: "todo", planned_date: null, completed_at: null }, TODAY, WEEK_END),
    "later",
  );
});

test("plannedDateForBucket maps each column", () => {
  assert.equal(plannedDateForBucket("today", TODAY, WEEK_END), TODAY);
  assert.equal(plannedDateForBucket("this_week", TODAY, WEEK_END), WEEK_END);
  assert.equal(plannedDateForBucket("later", TODAY, WEEK_END), null);
});

test("midpointSortOrder between neighbors and at the ends", () => {
  assert.equal(midpointSortOrder(2, 4), 3);
  assert.equal(midpointSortOrder(null, 4), 3); // before first
  assert.equal(midpointSortOrder(2, null), 3); // after last
  assert.equal(midpointSortOrder(null, null), 0); // empty column
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/crm && pnpm exec node --import tsx --test src/lib/tasks/board.test.ts`
Expected: FAIL — module `./board` not found.

- [ ] **Step 3: Implement `board.ts`**

Create `apps/crm/src/lib/tasks/board.ts`:

```ts
import { addDays } from "@/lib/date";

export type PlanBucket = "today" | "this_week" | "later" | "done";
export type TaskStatus = "todo" | "in_progress" | "done";

/**
 * Classify a task into a 계획 뷰 column relative to `today`/`weekEnd`
 * ("YYYY-MM-DD", Seoul). Done tasks always land in "done"; the caller hides
 * those completed more than 7 days ago. Non-done tasks bucket by planned_date:
 * past/today → today (carry-over), within the week → this_week, else/null → later.
 */
export function planBucket(
  t: { status: string; planned_date: string | null; completed_at: string | null },
  today: string,
  weekEnd: string,
): PlanBucket {
  if (t.status === "done") return "done";
  const p = t.planned_date;
  if (!p) return "later";
  if (p <= today) return "today";
  if (p <= weekEnd) return "this_week";
  return "later";
}

/** The planned_date to write when a card is dropped into a non-done 계획 column. */
export function plannedDateForBucket(
  bucket: "today" | "this_week" | "later",
  today: string,
  weekEnd: string,
): string | null {
  if (bucket === "today") return today;
  if (bucket === "this_week") return weekEnd;
  return null;
}

/**
 * New sort_order for a card dropped between two neighbors (their sort_order, or
 * null at a column edge). Midpoint keeps ordering stable without renumbering.
 */
export function midpointSortOrder(
  before: number | null,
  after: number | null,
): number {
  if (before == null && after == null) return 0;
  if (before == null) return after! - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}
```

> Note: `addDays` import is intentionally available for future helpers; if your linter flags it as unused, drop the import line.

Actually, to avoid an unused import lint error now, **do not import `addDays`** — omit the import line entirely (this file does not use it).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/crm && pnpm exec node --import tsx --test src/lib/tasks/board.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/crm/src/lib/tasks/board.ts apps/crm/src/lib/tasks/board.test.ts
git commit -m "feat(tasks): plan-bucket + sort-order pure helpers"
```

---

### Task 4: Shared types + suggestion dedup/dismissal logic

**Files:**
- Create: `apps/crm/src/lib/tasks/types.ts`
- Create: `apps/crm/src/lib/tasks/suggestions.ts`
- Test: `apps/crm/src/lib/tasks/suggestions.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `SuggestionKind = "lease_expiry" | "charge_due" | "service_open" | "deros"`
  - `interface SuggestedTask { dedupKey: string; kind: SuggestionKind; title: string; dueDate: string | null; refEntityType: string; refEntityId: number; suggestedAssigneeIds: number[] }`
  - `interface TaskAssigneeView { id: number; name: string; image: string | null }`
  - `interface TaskView { id; title; notes; status; planned_date; due_date; sort_order; source; suggestion_key; ref_entity_type; ref_entity_id; created_by; completed_at; assignees }` (string dates)
  - `interface StaffOption { id: number; name: string; image: string | null }`
  - `interface BoardData { tasks: TaskView[]; suggestions: SuggestedTask[]; staff: StaffOption[]; currentUserId: number }`
- Produces (`suggestions.ts`): `filterSuggestions(candidates: SuggestedTask[], activeKeys: Set<string>, dismissals: Map<string, string | null>, today: string): SuggestedTask[]`

- [ ] **Step 1: Create the shared types**

Create `apps/crm/src/lib/tasks/types.ts`:

```ts
import type { PlanBucket, TaskStatus } from "./board";

export type { PlanBucket, TaskStatus };

export type SuggestionKind =
  | "lease_expiry"
  | "charge_due"
  | "service_open"
  | "deros";

export interface SuggestedTask {
  dedupKey: string;
  kind: SuggestionKind;
  title: string;
  dueDate: string | null; // "YYYY-MM-DD"
  refEntityType: string;
  refEntityId: number;
  suggestedAssigneeIds: number[];
}

export interface TaskAssigneeView {
  id: number;
  name: string;
  image: string | null;
}

export interface TaskView {
  id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  planned_date: string | null; // "YYYY-MM-DD"
  due_date: string | null; // "YYYY-MM-DD"
  sort_order: number;
  source: "manual" | "suggestion";
  suggestion_key: string | null;
  ref_entity_type: string | null;
  ref_entity_id: number | null;
  created_by: number;
  completed_at: string | null; // "YYYY-MM-DD"
  assignees: TaskAssigneeView[];
}

export interface StaffOption {
  id: number;
  name: string;
  image: string | null;
}

export interface BoardData {
  tasks: TaskView[];
  suggestions: SuggestedTask[];
  staff: StaffOption[];
  currentUserId: number;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/crm/src/lib/tasks/suggestions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSuggestions } from "./suggestions";
import type { SuggestedTask } from "./types";

const TODAY = "2026-06-17";

function cand(dedupKey: string): SuggestedTask {
  return {
    dedupKey,
    kind: "lease_expiry",
    title: dedupKey,
    dueDate: null,
    refEntityType: "lease",
    refEntityId: 1,
    suggestedAssigneeIds: [],
  };
}

test("drops candidates already an active task", () => {
  const out = filterSuggestions(
    [cand("a"), cand("b")],
    new Set(["a"]),
    new Map(),
    TODAY,
  );
  assert.deepEqual(out.map((c) => c.dedupKey), ["b"]);
});

test("drops permanently dismissed candidates", () => {
  const out = filterSuggestions(
    [cand("a"), cand("b")],
    new Set(),
    new Map([["a", null]]),
    TODAY,
  );
  assert.deepEqual(out.map((c) => c.dedupKey), ["b"]);
});

test("drops candidates still snoozed (until > today)", () => {
  const out = filterSuggestions(
    [cand("a"), cand("b")],
    new Set(),
    new Map([["a", "2026-06-25"]]),
    TODAY,
  );
  assert.deepEqual(out.map((c) => c.dedupKey), ["b"]);
});

test("keeps candidates whose snooze has expired (until <= today)", () => {
  const out = filterSuggestions(
    [cand("a")],
    new Set(),
    new Map([["a", "2026-06-10"]]),
    TODAY,
  );
  assert.deepEqual(out.map((c) => c.dedupKey), ["a"]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/crm && pnpm exec node --import tsx --test src/lib/tasks/suggestions.test.ts`
Expected: FAIL — `filterSuggestions` not exported.

- [ ] **Step 4: Implement `filterSuggestions`**

Create `apps/crm/src/lib/tasks/suggestions.ts`:

```ts
import type { SuggestedTask } from "./types";

/**
 * Remove suggestion candidates that are already represented as an active
 * (non-done) task (`activeKeys`) or that have a live dismissal: permanent
 * (`null`) or snoozed until a future date (`> today`). Date strings are
 * "YYYY-MM-DD" so lexical comparison equals chronological comparison.
 */
export function filterSuggestions(
  candidates: SuggestedTask[],
  activeKeys: Set<string>,
  dismissals: Map<string, string | null>,
  today: string,
): SuggestedTask[] {
  return candidates.filter((c) => {
    if (activeKeys.has(c.dedupKey)) return false;
    if (dismissals.has(c.dedupKey)) {
      const until = dismissals.get(c.dedupKey) ?? null;
      if (until == null) return false; // permanent
      if (until > today) return false; // still snoozed
    }
    return true;
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/crm && pnpm exec node --import tsx --test src/lib/tasks/suggestions.test.ts`
Expected: PASS — `# pass 4`.

- [ ] **Step 6: Commit**

```bash
git add apps/crm/src/lib/tasks/types.ts apps/crm/src/lib/tasks/suggestions.ts apps/crm/src/lib/tasks/suggestions.test.ts
git commit -m "feat(tasks): board view types + suggestion dedup/dismissal filter"
```

---

### Task 5: `loadBoardData` server query (tasks + signals → BoardData)

**Files:**
- Create: `apps/crm/src/lib/tasks/queries.ts`

**Interfaces:**
- Consumes: `getDb` from `@kingsrealty/db`; `getSession` from `@/lib/session`; `seoulDateString`, `seoulWeekEnd`, `daysUntil` from `@/lib/date`; `filterSuggestions` from `./suggestions`; `BoardData`, `SuggestedTask`, `TaskView` from `./types`.
- Produces: `loadBoardData(): Promise<BoardData>` — used by the dashboard page (Task 8) and the `getTaskBoardData` action (Task 6).

- [ ] **Step 1: Implement `loadBoardData`**

Create `apps/crm/src/lib/tasks/queries.ts`:

```ts
import { getDb, sql } from "@kingsrealty/db";
import { getSession } from "@/lib/session";
import { seoulDateString, seoulWeekEnd, daysUntil } from "@/lib/date";
import { filterSuggestions } from "./suggestions";
import type {
  BoardData,
  SuggestedTask,
  TaskView,
  TaskAssigneeView,
} from "./types";

const d = (v: Date | string | null): string | null =>
  v == null ? null : seoulDateString(v instanceof Date ? v : new Date(v));

/** Load the full shared board: tasks (+assignees), live suggestions, staff. */
export async function loadBoardData(): Promise<BoardData> {
  const db = getDb();
  const session = await getSession();
  const currentUserId = Number(session?.user?.id ?? 0);
  const today = seoulDateString();
  const weekEnd = seoulWeekEnd(today);
  const in7 = new Date(Date.now() + 7 * 864e5);
  const in60 = new Date(Date.now() + 60 * 864e5);
  const todayDate = new Date(today);

  const [taskRows, assigneeRows, staff, dismissalRows] = await Promise.all([
    db
      .selectFrom("task")
      .selectAll()
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("task_assignee")
      .innerJoin("user", "user.id", "task_assignee.user_id")
      .select([
        "task_assignee.task_id",
        "user.id as id",
        "user.name as name",
        "user.image as image",
      ])
      .execute(),
    db
      .selectFrom("user")
      .select(["id", "name", "image"])
      .where("role", "is not", null)
      .where("role", "not like", "%pending%")
      .orderBy("name", "asc")
      .execute(),
    db
      .selectFrom("task_suggestion_dismissal")
      .select(["dedup_key", "dismissed_until"])
      .execute(),
  ]);

  const byTask = new Map<number, TaskAssigneeView[]>();
  for (const a of assigneeRows) {
    const list = byTask.get(a.task_id) ?? [];
    list.push({ id: a.id, name: a.name, image: a.image });
    byTask.set(a.task_id, list);
  }

  const tasks: TaskView[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status as TaskView["status"],
    planned_date: d(t.planned_date),
    due_date: d(t.due_date),
    sort_order: Number(t.sort_order),
    source: t.source as TaskView["source"],
    suggestion_key: t.suggestion_key,
    ref_entity_type: t.ref_entity_type,
    ref_entity_id: t.ref_entity_id,
    created_by: t.created_by,
    completed_at: d(t.completed_at),
    assignees: byTask.get(t.id) ?? [],
  }));

  // ---- Suggestion candidates from operational signals ----
  const [leases, charges, services, derosTenants] = await Promise.all([
    db
      .selectFrom("lease")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "lease.id as id",
        "lease.end_date as end_date",
        "tenant.name as tenant_name",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as("address"),
      ])
      .where("lease.status", "in", ["active", "renewed"])
      .where("tenant.deleted_at", "is", null)
      .where("lease.end_date", ">=", todayDate)
      .where("lease.end_date", "<=", in60)
      .execute(),
    db
      .selectFrom("charge_item")
      .innerJoin("lease", "lease.id", "charge_item.lease_id")
      .innerJoin("tenant", "tenant.id", "lease.tenant_id")
      .select([
        "charge_item.id as id",
        "charge_item.type as type",
        "charge_item.status as status",
        "charge_item.due_date as due_date",
        "tenant.id as tenant_id",
        "tenant.name as tenant_name",
      ])
      .where("charge_item.status", "in", ["billed", "overdue"])
      .where("charge_item.amount", "is not", null)
      .where("tenant.deleted_at", "is", null)
      .execute(),
    db
      .selectFrom("service_request")
      .innerJoin("lease", "lease.id", "service_request.lease_id")
      .innerJoin("property", "property.id", "lease.property_id")
      .select([
        "service_request.id as id",
        "service_request.category as category",
        "service_request.scheduled_date as scheduled_date",
        sql<string>`coalesce(property.address_jibeon, property.address)`.as("address"),
      ])
      .where("service_request.status", "in", [
        "received",
        "pending_repair",
        "in_progress",
        "postponed",
      ])
      .execute(),
    db
      .selectFrom("tenant")
      .select(["id", "name", "deros"])
      .where("status", "=", "active")
      .where("deleted_at", "is", null)
      .where("deros", ">=", todayDate)
      .where("deros", "<=", in60)
      .execute(),
  ]);

  // service assignee prefill
  const svcAssignees = await db
    .selectFrom("service_request_assignee")
    .select(["service_request_id", "user_id"])
    .where(
      "service_request_id",
      "in",
      services.length ? services.map((s) => s.id) : [0],
    )
    .execute();
  const svcAssigneeMap = new Map<number, number[]>();
  for (const a of svcAssignees) {
    const list = svcAssigneeMap.get(a.service_request_id) ?? [];
    list.push(a.user_id);
    svcAssigneeMap.set(a.service_request_id, list);
  }

  const chargeTypeLabel: Record<string, string> = {
    rent: "월세",
    utility: "공과금",
    management: "관리비",
    parking: "주차",
    deposit: "보증금",
    realty_fee: "중개수수료",
  };

  const candidates: SuggestedTask[] = [];

  for (const l of leases) {
    const dleft = daysUntil(l.end_date, today);
    const milestone = dleft <= 7 ? 7 : dleft <= 30 ? 30 : dleft <= 60 ? 60 : null;
    if (milestone == null) continue;
    candidates.push({
      dedupKey: `lease_expiry:${l.id}:${milestone}`,
      kind: "lease_expiry",
      title: `계약 만료 D-${dleft} · ${l.tenant_name} ${l.address}`,
      dueDate: d(l.end_date),
      refEntityType: "lease",
      refEntityId: l.id,
      suggestedAssigneeIds: [],
    });
  }

  for (const c of charges) {
    const label = chargeTypeLabel[c.type] ?? c.type;
    candidates.push({
      dedupKey: `charge_due:${c.id}`,
      kind: "charge_due",
      title: `${c.status === "overdue" ? "연체" : "미납"} ${label} · ${c.tenant_name}`,
      dueDate: d(c.due_date),
      refEntityType: "tenant",
      refEntityId: c.tenant_id,
      suggestedAssigneeIds: [],
    });
  }

  for (const s of services) {
    candidates.push({
      dedupKey: `service_open:${s.id}`,
      kind: "service_open",
      title: `AS ${s.category} · ${s.address}`,
      dueDate: d(s.scheduled_date),
      refEntityType: "service_request",
      refEntityId: s.id,
      suggestedAssigneeIds: svcAssigneeMap.get(s.id) ?? [],
    });
  }

  for (const t of derosTenants) {
    const dleft = daysUntil(t.deros as Date, today);
    candidates.push({
      dedupKey: `deros:${t.id}:60`,
      kind: "deros",
      title: `DEROS 임박 D-${dleft} · ${t.name}`,
      dueDate: d(t.deros),
      refEntityType: "tenant",
      refEntityId: t.id,
      suggestedAssigneeIds: [],
    });
  }

  const activeKeys = new Set(
    taskRows
      .filter((t) => t.suggestion_key && t.status !== "done")
      .map((t) => t.suggestion_key as string),
  );
  const dismissals = new Map<string, string | null>(
    dismissalRows.map((r) => [r.dedup_key, d(r.dismissed_until)]),
  );

  const suggestions = filterSuggestions(candidates, activeKeys, dismissals, today);

  return { tasks, suggestions, staff, currentUserId };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/crm && pnpm exec tsc --noEmit`
Expected: no errors referencing `queries.ts`. (Pre-existing unrelated errors, if any, are out of scope — but there should be none introduced here.)

- [ ] **Step 3: Commit**

```bash
git add apps/crm/src/lib/tasks/queries.ts
git commit -m "feat(tasks): loadBoardData — tasks + lease/charge/AS/DEROS suggestions"
```

---

### Task 6: Server actions (`_task-actions.ts`)

**Files:**
- Create: `apps/crm/src/app/(dashboard)/_task-actions.ts`

**Interfaces:**
- Consumes: `getDb`, `type DB`, `type Transaction` from `@kingsrealty/db`; `requireUser` + `isAdmin` from `@/lib/authz`; `revalidatePath`; `seoulDateString`, `seoulWeekEnd` from `@/lib/date`; `loadBoardData` from `@/lib/tasks/queries`; `SuggestedTask`, `BoardData`, `TaskStatus` from `@/lib/tasks/types`.
- Produces (all server actions): `createTask`, `updateTask`, `moveTask`, `deleteTask`, `setAssignees`, `acceptSuggestion`, `dismissSuggestion`, `snoozeSuggestion`, `getTaskBoardData`. Signatures are defined in the implementation below — Task 7/9 consume them exactly as written.

- [ ] **Step 1: Implement the actions file**

Create `apps/crm/src/app/(dashboard)/_task-actions.ts`:

```ts
"use server";

import { getDb, type DB, type Transaction } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { requireUser, isAdmin } from "@/lib/authz";
import { seoulDateString, seoulWeekEnd } from "@/lib/date";
import { loadBoardData } from "@/lib/tasks/queries";
import type { BoardData, SuggestedTask, TaskStatus } from "@/lib/tasks/types";

async function nextSortOrder(trx: Transaction<DB>): Promise<number> {
  const row = await trx
    .selectFrom("task")
    .select(({ fn }) => fn.max("sort_order").as("max"))
    .executeTakeFirst();
  return (Number(row?.max ?? 0) || 0) + 1;
}

function completedAtFor(status: TaskStatus): Date | null {
  return status === "done" ? new Date() : null;
}

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  plannedDate?: string | null;
  assigneeIds?: number[];
}

export async function createTask(input: CreateTaskInput): Promise<void> {
  const session = await requireUser();
  const title = input.title?.trim();
  if (!title) throw new Error("제목을 입력하세요.");
  const db = getDb();
  await db.transaction().execute(async (trx) => {
    const sort_order = await nextSortOrder(trx);
    const task = await trx
      .insertInto("task")
      .values({
        title,
        notes: input.notes?.trim() || null,
        status: "todo",
        planned_date: input.plannedDate ?? null,
        due_date: input.dueDate ?? null,
        sort_order,
        source: "manual",
        created_by: Number(session.user.id),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await insertAssignees(trx, task.id, input.assigneeIds ?? []);
  });
  revalidatePath("/");
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  dueDate?: string | null;
}

export async function updateTask(
  id: number,
  input: UpdateTaskInput,
): Promise<void> {
  await requireUser();
  const db = getDb();
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("제목을 입력하세요.");
    patch.title = t;
  }
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  await db.updateTable("task").set(patch).where("id", "=", id).execute();
  revalidatePath("/");
}

/** Persist a drag/drop: target status, planned_date and new sort_order. */
export async function moveTask(
  id: number,
  status: TaskStatus,
  plannedDate: string | null,
  sortOrder: number,
): Promise<void> {
  await requireUser();
  const db = getDb();
  await db
    .updateTable("task")
    .set({
      status,
      planned_date: plannedDate,
      sort_order: sortOrder,
      completed_at: completedAtFor(status),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath("/");
}

export async function deleteTask(id: number): Promise<void> {
  const session = await requireUser();
  const db = getDb();
  const row = await db
    .selectFrom("task")
    .select(["created_by"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return;
  if (row.created_by !== Number(session.user.id) && !isAdmin(session.user.role)) {
    throw new Error("작성자 또는 관리자만 삭제할 수 있습니다.");
  }
  await db.deleteFrom("task").where("id", "=", id).execute();
  revalidatePath("/");
}

export async function setAssignees(
  id: number,
  userIds: number[],
): Promise<void> {
  await requireUser();
  const db = getDb();
  const clean = Array.from(
    new Set(userIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("task_assignee").where("task_id", "=", id).execute();
    await insertAssignees(trx, id, clean);
  });
  revalidatePath("/");
}

async function insertAssignees(
  trx: Transaction<DB>,
  taskId: number,
  userIds: number[],
): Promise<void> {
  const clean = Array.from(
    new Set(userIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  if (!clean.length) return;
  await trx
    .insertInto("task_assignee")
    .values(clean.map((user_id) => ({ task_id: taskId, user_id })))
    .execute();
}

/** Turn a suggestion into a real task (idempotent on dedupKey). */
export async function acceptSuggestion(s: SuggestedTask): Promise<void> {
  const session = await requireUser();
  const db = getDb();
  const today = seoulDateString();
  const weekEnd = seoulWeekEnd(today);

  let planned: string | null = null;
  if (s.dueDate) {
    if (s.dueDate < today) planned = today;
    else if (s.dueDate <= weekEnd) planned = s.dueDate;
    else planned = null;
  }

  await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("task")
      .select(["id"])
      .where("suggestion_key", "=", s.dedupKey)
      .where("status", "!=", "done")
      .executeTakeFirst();
    if (existing) return; // race / double-click guard
    const sort_order = await nextSortOrder(trx);
    const task = await trx
      .insertInto("task")
      .values({
        title: s.title,
        status: "todo",
        planned_date: planned,
        due_date: s.dueDate,
        sort_order,
        source: "suggestion",
        suggestion_key: s.dedupKey,
        ref_entity_type: s.refEntityType,
        ref_entity_id: s.refEntityId,
        created_by: Number(session.user.id),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await insertAssignees(trx, task.id, s.suggestedAssigneeIds);
  });
  revalidatePath("/");
}

async function upsertDismissal(
  dedupKey: string,
  dismissedUntil: string | null,
  userId: number,
): Promise<void> {
  const db = getDb();
  await db
    .insertInto("task_suggestion_dismissal")
    .values({
      dedup_key: dedupKey,
      dismissed_until: dismissedUntil,
      dismissed_by: userId,
    })
    .onConflict((oc) =>
      oc.column("dedup_key").doUpdateSet({
        dismissed_until: dismissedUntil,
        dismissed_by: userId,
      }),
    )
    .execute();
  revalidatePath("/");
}

export async function dismissSuggestion(dedupKey: string): Promise<void> {
  const session = await requireUser();
  await upsertDismissal(dedupKey, null, Number(session.user.id));
}

export async function snoozeSuggestion(dedupKey: string): Promise<void> {
  const session = await requireUser();
  const until = seoulWeekEnd(seoulDateString()); // snooze to end of this week…
  // …but at least +7 days: use the later of (week end, today+7).
  const plus7 = new Date(Date.now() + 7 * 864e5);
  const plus7Str = seoulDateString(plus7);
  await upsertDismissal(
    dedupKey,
    until > plus7Str ? until : plus7Str,
    Number(session.user.id),
  );
}

export async function getTaskBoardData(): Promise<BoardData> {
  await requireUser();
  return loadBoardData();
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/crm && pnpm exec tsc --noEmit`
Expected: no new errors. (Confirms action signatures and Kysely `onConflict`/`returning` usage are valid against the regenerated types.)

- [ ] **Step 3: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/_task-actions.ts"
git commit -m "feat(tasks): server actions (create/update/move/delete/assign/suggest)"
```

---

### Task 7: Presentational components — card, suggestion rail, dialog

**Files:**
- Create: `apps/crm/src/app/(dashboard)/_components/task-card.tsx`
- Create: `apps/crm/src/app/(dashboard)/_components/suggestion-rail.tsx`
- Create: `apps/crm/src/app/(dashboard)/_components/task-dialog.tsx`

**Interfaces:**
- Consumes: `TaskView`, `SuggestedTask`, `StaffOption` from `@/lib/tasks/types`; `daysUntil` from `@/lib/date`; ui primitives; `createTask`/`updateTask`/`setAssignees` actions.
- Produces:
  - `DueBadge({ due, today }: { due: string | null; today: string })`
  - `TaskCard({ task, today, onEdit, onDelete }: { task: TaskView; today: string; onEdit?: (t: TaskView) => void; onDelete?: (id: number) => void })`
  - `SuggestionRail({ suggestions, today, onAccept, onDismiss, onSnooze, busyKeys }: …)`
  - `TaskDialog({ open, onOpenChange, staff, task, today }: …)` — create when `task` is undefined, edit otherwise.

- [ ] **Step 1: Implement `task-card.tsx`**

Create `apps/crm/src/app/(dashboard)/_components/task-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { daysUntil } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { TaskView } from "@/lib/tasks/types";

const refHref: Record<string, (id: number) => string> = {
  tenant: (id) => `/tenants/${id}`,
  lease: (id) => `/leases/${id}`,
  service_request: (id) => `/services/${id}`,
  property: (id) => `/properties/${id}`,
};

export function DueBadge({ due, today }: { due: string | null; today: string }) {
  if (!due) return null;
  const dleft = daysUntil(due, today);
  const overdue = dleft < 0;
  return (
    <span
      className={cn(
        "tabular rounded px-1.5 py-0.5 text-[10.5px] font-medium",
        overdue
          ? "bg-danger/10 text-danger"
          : dleft <= 3
            ? "bg-warning/10 text-warning"
            : "text-muted-foreground",
      )}
    >
      {overdue ? `연체 ${-dleft}일` : `D-${dleft}`}
    </span>
  );
}

export function TaskCard({
  task,
  today,
  onEdit,
  onDelete,
}: {
  task: TaskView;
  today: string;
  onEdit?: (t: TaskView) => void;
  onDelete?: (id: number) => void;
}) {
  const href =
    task.ref_entity_type && task.ref_entity_id
      ? refHref[task.ref_entity_type]?.(task.ref_entity_id)
      : undefined;
  return (
    <div className="group rounded-lg border bg-card p-2.5 text-[13px] shadow-xs">
      <div className="flex items-start gap-1.5">
        <span className="flex-1 leading-snug">{task.title}</span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="수정"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-danger"
              aria-label="삭제"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <DueBadge due={task.due_date} today={today} />
        {href && (
          <Link
            href={href}
            className="text-muted-foreground hover:text-foreground"
            aria-label="원본 보기"
          >
            <ExternalLink className="size-3" />
          </Link>
        )}
        <div className="ml-auto flex -space-x-1.5">
          {task.assignees.map((u) => (
            <Avatar key={u.id} className="size-5 ring-2 ring-card">
              {u.image && <AvatarImage src={u.image} alt="" />}
              <AvatarFallback className="text-[8px]">
                {u.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `suggestion-rail.tsx`**

Create `apps/crm/src/app/(dashboard)/_components/suggestion-rail.tsx`:

```tsx
"use client";

import { CalendarDays, CreditCard, Wrench, Clock, Plus, X, Clock3 } from "lucide-react";
import { DueBadge } from "./task-card";
import { cn } from "@/lib/utils";
import type { SuggestedTask, SuggestionKind } from "@/lib/tasks/types";

const kindIcon: Record<SuggestionKind, React.ComponentType<{ className?: string }>> = {
  lease_expiry: CalendarDays,
  charge_due: CreditCard,
  service_open: Wrench,
  deros: Clock,
};

export function SuggestionRail({
  suggestions,
  today,
  onAccept,
  onDismiss,
  onSnooze,
  busyKeys,
}: {
  suggestions: SuggestedTask[];
  today: string;
  onAccept: (s: SuggestedTask) => void;
  onDismiss: (key: string) => void;
  onSnooze: (key: string) => void;
  busyKeys: Set<string>;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
        추천
        <span className="tabular text-[12px] font-medium text-muted-foreground">
          {suggestions.length}
        </span>
      </div>
      {suggestions.length === 0 ? (
        <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">
          추천 없음
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {suggestions.map((s) => {
            const Icon = kindIcon[s.kind];
            const busy = busyKeys.has(s.dedupKey);
            return (
              <div
                key={s.dedupKey}
                className={cn(
                  "rounded-lg border border-dashed bg-card/60 p-2.5 text-[13px]",
                  busy && "opacity-50",
                )}
              >
                <div className="flex items-start gap-1.5">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 leading-snug">{s.title}</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <DueBadge due={s.dueDate} today={today} />
                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAccept(s)}
                      className="flex items-center gap-1 rounded bg-brand px-1.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <Plus className="size-3" /> 추가
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSnooze(s.dedupKey)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="나중에"
                    >
                      <Clock3 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDismiss(s.dedupKey)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-danger"
                      aria-label="무시"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement `task-dialog.tsx`**

Create `apps/crm/src/app/(dashboard)/_components/task-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ChevronsUpDown, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createTask, updateTask, setAssignees } from "../_task-actions";
import type { StaffOption, TaskView } from "@/lib/tasks/types";

export function TaskDialog({
  open,
  onOpenChange,
  staff,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: StaffOption[];
  task?: TaskView;
  onSaved?: () => void;
}) {
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [due, setDue] = useState(task?.due_date ?? "");
  const [ids, setIds] = useState<number[]>(
    task ? task.assignees.map((a) => a.id) : [],
  );
  const [staffOpen, setStaffOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = staff.filter((u) => ids.includes(u.id));
  const toggle = (id: number) =>
    setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        if (editing && task) {
          await updateTask(task.id, {
            title,
            notes,
            dueDate: due || null,
          });
          await setAssignees(task.id, ids);
        } else {
          await createTask({
            title,
            notes,
            dueDate: due || null,
            assigneeIds: ids,
          });
        }
        onOpenChange(false);
        onSaved?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "할 일 수정" : "할 일 추가"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <Label htmlFor="task-title">제목</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="무엇을 해야 하나요?"
              autoFocus
            />
          </Field>
          <Field>
            <Label htmlFor="task-notes">메모</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </Field>
          <Field>
            <Label htmlFor="task-due">마감일</Label>
            <Input
              id="task-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <Field>
            <Label>담당자</Label>
            <Popover open={staffOpen} onOpenChange={setStaffOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-8 w-full justify-between px-2.5 font-normal"
                  />
                }
              >
                {selected.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selected.map((u) => (
                      <Badge key={u.id} variant="outline" className="gap-1 py-0.5 pr-1 pl-1">
                        <Avatar className="size-4">
                          {u.image && <AvatarImage src={u.image} alt="" />}
                          <AvatarFallback className="text-[8px]">
                            {u.name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        {u.name}
                        <button
                          type="button"
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(u.id);
                          }}
                        >
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">담당자 선택</span>
                )}
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent className="w-[--anchor-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="이름 검색..." />
                  <CommandList>
                    <CommandEmpty>결과 없음</CommandEmpty>
                    <CommandGroup>
                      {staff.map((u) => (
                        <CommandItem
                          key={u.id}
                          value={`${u.name} ${u.id}`}
                          onSelect={() => toggle(u.id)}
                        >
                          <Check
                            className={cn(
                              "mr-1.5 size-3.5",
                              ids.includes(u.id) ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <Avatar className="mr-2 size-5">
                            {u.image && <AvatarImage src={u.image} alt="" />}
                            <AvatarFallback className="text-[9px]">
                              {u.name.slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          {u.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Field>
          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            취소
          </Button>
          <Button onClick={submit} disabled={pending || !title.trim()}>
            {pending ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Verify the dialog's ui imports exist**

Run: `cd apps/crm && grep -l "DialogFooter" src/components/ui/dialog.tsx && grep -l "Textarea" src/components/ui/textarea.tsx`
Expected: both files print (the named exports exist). If `DialogFooter` is missing from `dialog.tsx`, replace its usage with a plain `<div className="flex justify-end gap-2">`.

- [ ] **Step 5: Typecheck**

Run: `cd apps/crm && pnpm exec tsc --noEmit`
Expected: no errors in the three new files.

- [ ] **Step 6: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/_components/task-card.tsx" "apps/crm/src/app/(dashboard)/_components/suggestion-rail.tsx" "apps/crm/src/app/(dashboard)/_components/task-dialog.tsx"
git commit -m "feat(tasks): task card, suggestion rail, create/edit dialog"
```

---

### Task 8: `<TaskBoard>` — views, filters, drag-and-drop, optimistic state

**Files:**
- Create: `apps/crm/src/app/(dashboard)/_components/task-board.tsx`
- Modify: `apps/crm/package.json` (add `@dnd-kit/*` deps)

**Interfaces:**
- Consumes: `BoardData`, `TaskView`, `SuggestedTask`, `TaskStatus` from `@/lib/tasks/types`; `planBucket`, `plannedDateForBucket`, `midpointSortOrder` from `@/lib/tasks/board`; `seoulWeekEnd` from `@/lib/date`; actions from `../_task-actions`; `TaskCard`, `SuggestionRail`, `TaskDialog`.
- Produces: `TaskBoard({ data, today, layout }: { data: BoardData; today: string; layout: "columns" | "stack" })`.

- [ ] **Step 1: Add drag-and-drop dependencies**

Edit `apps/crm/package.json` — add to `dependencies`:

```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

Run: `pnpm install`
Expected: the three packages install under `apps/crm`.

- [ ] **Step 2: Implement `task-board.tsx`**

Create `apps/crm/src/app/(dashboard)/_components/task-board.tsx`:

```tsx
"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { seoulWeekEnd } from "@/lib/date";
import {
  planBucket,
  plannedDateForBucket,
  midpointSortOrder,
  type PlanBucket,
  type TaskStatus,
} from "@/lib/tasks/board";
import type { BoardData, TaskView, SuggestedTask } from "@/lib/tasks/types";
import { TaskCard } from "./task-card";
import { SuggestionRail } from "./suggestion-rail";
import { TaskDialog } from "./task-dialog";
import {
  moveTask,
  deleteTask,
  acceptSuggestion,
  dismissSuggestion,
  snoozeSuggestion,
} from "../_task-actions";

type View = "plan" | "status";
type ColId = PlanBucket | TaskStatus;

const PLAN_COLS: { id: PlanBucket; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "this_week", label: "이번 주" },
  { id: "later", label: "예정" },
  { id: "done", label: "완료" },
];
const STATUS_COLS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "할 일" },
  { id: "in_progress", label: "진행 중" },
  { id: "done", label: "완료" },
];

function withinLast7Days(completed: string | null, today: string): boolean {
  if (!completed) return false;
  const cutoff = new Date(new Date(today).getTime() - 7 * 864e5)
    .toISOString()
    .slice(0, 10);
  return completed >= cutoff;
}

function SortableCard({
  task,
  today,
  onEdit,
  onDelete,
}: {
  task: TaskView;
  today: string;
  onEdit: (t: TaskView) => void;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} today={today} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function Column({
  id,
  label,
  tasks,
  today,
  onEdit,
  onDelete,
}: {
  id: ColId;
  label: string;
  tasks: TaskView[];
  today: string;
  onEdit: (t: TaskView) => void;
  onDelete: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-24 flex-col rounded-lg bg-secondary/40 p-2",
        isOver && "ring-2 ring-brand/40",
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold">
        {label}
        <span className="tabular text-[12px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <SortableCard
              key={t.id}
              task={t}
              today={today}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function TaskBoard({
  data,
  today,
  layout,
}: {
  data: BoardData;
  today: string;
  layout: "columns" | "stack";
}) {
  const weekEnd = React.useMemo(() => seoulWeekEnd(today), [today]);
  const [view, setView] = React.useState<View>("plan");
  const [mine, setMine] = React.useState(layout === "stack");
  const [assigneeFilter, setAssigneeFilter] = React.useState<number | null>(null);
  const [tasks, setTasks] = React.useState<TaskView[]>(data.tasks);
  const [suggestions, setSuggestions] = React.useState<SuggestedTask[]>(
    data.suggestions,
  );
  const [busyKeys, setBusyKeys] = React.useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TaskView | undefined>();
  const [error, setError] = React.useState<string | null>(null);

  // Keep optimistic state in sync when the server sends fresh props.
  React.useEffect(() => setTasks(data.tasks), [data.tasks]);
  React.useEffect(() => setSuggestions(data.suggestions), [data.suggestions]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const cols = view === "plan" ? PLAN_COLS : STATUS_COLS;

  const visible = React.useMemo(
    () =>
      tasks.filter((t) => {
        if (mine && !t.assignees.some((a) => a.id === data.currentUserId))
          return false;
        if (assigneeFilter && !t.assignees.some((a) => a.id === assigneeFilter))
          return false;
        return true;
      }),
    [tasks, mine, assigneeFilter, data.currentUserId],
  );

  const colOf = React.useCallback(
    (t: TaskView): ColId =>
      view === "plan" ? planBucket(t, today, weekEnd) : (t.status as TaskStatus),
    [view, today, weekEnd],
  );

  const byCol = React.useMemo(() => {
    const map = new Map<ColId, TaskView[]>();
    for (const c of cols) map.set(c.id, []);
    for (const t of visible) {
      const col = colOf(t);
      if (col === "done" && !withinLast7Days(t.completed_at, today)) continue;
      map.get(col)?.push(t);
    }
    for (const list of map.values())
      list.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [visible, cols, colOf, today]);

  function reload() {
    // Server actions revalidate "/"; for client-only surfaces the parent
    // refreshes props. Optimistic state already reflects the change.
  }

  async function handleDragEnd(e: DragEndEvent) {
    const activeId = Number(e.active.id);
    const overId = e.over?.id;
    if (overId == null) return;
    const moved = tasks.find((t) => t.id === activeId);
    if (!moved) return;

    // Resolve the target column id from either a column droppable or a card.
    let targetCol: ColId;
    if (typeof overId === "string" && overId.startsWith("col:")) {
      targetCol = overId.slice(4) as ColId;
    } else {
      const overTask = tasks.find((t) => t.id === Number(overId));
      if (!overTask) return;
      targetCol = colOf(overTask);
    }

    // Compute neighbors in the target column (excluding the moved card).
    const colTasks = (byCol.get(targetCol) ?? []).filter((t) => t.id !== activeId);
    const overIdx =
      typeof overId === "string"
        ? colTasks.length
        : Math.max(0, colTasks.findIndex((t) => t.id === Number(overId)));
    const before = colTasks[overIdx - 1]?.sort_order ?? null;
    const after = colTasks[overIdx]?.sort_order ?? null;
    const sortOrder = midpointSortOrder(before, after);

    let status: TaskStatus;
    let plannedDate: string | null;
    if (view === "plan") {
      if (targetCol === "done") {
        status = "done";
        plannedDate = moved.planned_date;
      } else {
        status = moved.status === "done" ? "todo" : moved.status;
        plannedDate = plannedDateForBucket(
          targetCol as "today" | "this_week" | "later",
          today,
          weekEnd,
        );
      }
    } else {
      status = targetCol as TaskStatus;
      plannedDate = moved.planned_date;
    }

    const prev = tasks;
    const completed_at =
      status === "done"
        ? (moved.completed_at ?? today)
        : null;
    setTasks((ts) =>
      ts.map((t) =>
        t.id === activeId
          ? { ...t, status, planned_date: plannedDate, sort_order: sortOrder, completed_at }
          : t,
      ),
    );
    try {
      await moveTask(activeId, status, plannedDate, sortOrder);
    } catch {
      setTasks(prev);
      setError("이동을 저장하지 못했습니다.");
    }
  }

  function handleDelete(id: number) {
    const prev = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    deleteTask(id).catch(() => {
      setTasks(prev);
      setError("삭제하지 못했습니다.");
    });
  }

  function mark(key: string, on: boolean) {
    setBusyKeys((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function handleAccept(s: SuggestedTask) {
    mark(s.dedupKey, true);
    setSuggestions((list) => list.filter((x) => x.dedupKey !== s.dedupKey));
    acceptSuggestion(s).catch(() => {
      setSuggestions((list) => [s, ...list]);
      setError("추가하지 못했습니다.");
    }).finally(() => mark(s.dedupKey, false));
  }

  function handleDismiss(key: string, snooze: boolean) {
    const removed = suggestions.find((x) => x.dedupKey === key);
    setSuggestions((list) => list.filter((x) => x.dedupKey !== key));
    (snooze ? snoozeSuggestion(key) : dismissSuggestion(key)).catch(() => {
      if (removed) setSuggestions((list) => [removed, ...list]);
      setError("처리하지 못했습니다.");
    });
  }

  const stack = layout === "stack";

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5 text-[12px]">
          {(["plan", "status"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded px-2 py-1 font-medium",
                view === v
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {v === "plan" ? "계획" : "상태"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border p-0.5 text-[12px]">
          {[
            { v: false, label: "전체" },
            { v: true, label: "내 할 일" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setMine(o.v)}
              className={cn(
                "rounded px-2 py-1 font-medium",
                mine === o.v
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select
          value={assigneeFilter ?? ""}
          onChange={(e) =>
            setAssigneeFilter(e.target.value ? Number(e.target.value) : null)
          }
          className="h-7 rounded-md border bg-background px-2 text-[12px]"
        >
          <option value="">담당자 전체</option>
          {data.staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
          className="ml-auto flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          <Plus className="size-3.5" /> 할 일
        </button>
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}

      {/* Board + suggestions */}
      <div
        className={cn(
          "grid gap-3",
          stack ? "grid-cols-1" : "lg:grid-cols-[1fr_260px]",
        )}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <div
            className={cn(
              "grid gap-2",
              stack ? "grid-cols-1" : `grid-cols-${cols.length}`,
            )}
            style={
              stack
                ? undefined
                : { gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }
            }
          >
            {cols.map((c) => (
              <Column
                key={c.id}
                id={c.id}
                label={c.label}
                tasks={byCol.get(c.id) ?? []}
                today={today}
                onEdit={(t) => {
                  setEditing(t);
                  setDialogOpen(true);
                }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </DndContext>

        <div className={cn(stack && "border-t pt-3")}>
          <SuggestionRail
            suggestions={suggestions}
            today={today}
            onAccept={handleAccept}
            onDismiss={(k) => handleDismiss(k, false)}
            onSnooze={(k) => handleDismiss(k, true)}
            busyKeys={busyKeys}
          />
        </div>
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        staff={data.staff}
        task={editing}
        onSaved={reload}
      />
    </div>
  );
}
```

> The `grid-cols-${cols.length}` template literal in the className is overridden by the inline `gridTemplateColumns` style (Tailwind can't see dynamic class names) — the inline style is the source of truth; keep both for clarity or drop the className expression.

- [ ] **Step 3: Typecheck**

Run: `cd apps/crm && pnpm exec tsc --noEmit`
Expected: no errors in `task-board.tsx`.

- [ ] **Step 4: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/_components/task-board.tsx" apps/crm/package.json pnpm-lock.yaml
git commit -m "feat(tasks): TaskBoard — plan/status views, filters, dnd, optimistic"
```

---

### Task 9: Mount on the dashboard (replace `PaymentBoard`) + remove dead code

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/page.tsx`
- Delete: `apps/crm/src/app/(dashboard)/_components/payment-board.tsx`

**Interfaces:**
- Consumes: `loadBoardData` from `@/lib/tasks/queries`; `seoulDateString` from `@/lib/date`; `TaskBoard` from `./_components/task-board`.

- [ ] **Step 1: Swap imports**

In `apps/crm/src/app/(dashboard)/page.tsx`, replace the PaymentBoard import block:

```ts
import {
  PaymentBoard,
  type BoardItem,
  type ListItem,
} from "./_components/payment-board";
```

with:

```ts
import { TaskBoard } from "./_components/task-board";
import { loadBoardData } from "@/lib/tasks/queries";
```

- [ ] **Step 2: Remove the payment-board-only data and helpers**

In the same file, delete the symbols that only fed `PaymentBoard` (verify each is unused elsewhere with the grep in Step 5 before deleting):
- the `statusLabelMap` constant
- the `PaymentRow` type, `amountLabel`, `shortDate`, `toBoardItem` functions
- the `ChargeRow`-to-board mapper `chargeToBoardItem` (keep the `ChargeRow` type and `chargeTypeLabel` / `chargeAmountLabel` only if still used by stats — `chargeAmountLabel` and `chargeToBoardItem` are board-only, remove them; `ChargeRow` is still used by `const charges = openCharges as ChargeRow[]`, so KEEP `ChargeRow`)
- the `paymentSelect` const
- the `paidPayments` and `recentPayments` queries inside `Promise.all` and their names in the destructuring array
- the derived `pending`, `overdue`, `paid`, `list` variables near the end

Then load board data — add after the `const db = getDb();` / session block (anywhere before `return`):

```ts
  const board = await loadBoardData();
  const todayStr2 = seoulDateString();
```

(If `seoulDateString` is already imported and a today string already exists, reuse it instead of `todayStr2`.)

- [ ] **Step 3: Replace the board JSX**

Replace:

```tsx
      {/* Board + list */}
      <PaymentBoard
        pending={pending}
        overdue={overdue}
        paid={paid}
        list={list}
      />
```

with:

```tsx
      {/* 할 일 보드 */}
      <TaskBoard data={board} today={todayStr2} layout="columns" />
```

- [ ] **Step 4: Delete the unused component**

Run: `git rm "apps/crm/src/app/(dashboard)/_components/payment-board.tsx"`

- [ ] **Step 5: Confirm nothing else references the removed symbols**

Run:
```bash
cd apps/crm && grep -rn "payment-board\|PaymentBoard\|toBoardItem\|chargeToBoardItem\|paymentSelect\|recentPayments\|paidPayments" src/
```
Expected: **no matches** (all references removed). If any remain, remove them.

- [ ] **Step 6: Typecheck + lint + build**

Run: `cd apps/crm && pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: typecheck clean, lint clean (no unused-var errors from the deletions), build succeeds.

- [ ] **Step 7: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/page.tsx"
git commit -m "feat(dashboard): replace PaymentBoard with the 할 일 TaskBoard"
```

---

### Task 10: FAB — board access from any page

**Files:**
- Create: `apps/crm/src/components/layout/task-fab.tsx`
- Modify: `apps/crm/src/components/layout/app-shell.tsx`

**Interfaces:**
- Consumes: `getTaskBoardData` from `@/app/(dashboard)/_task-actions`; `TaskBoard` from `@/app/(dashboard)/_components/task-board`; `seoulDateString` from `@/lib/date`; `BoardData` from `@/lib/tasks/types`; `Sheet`/`SheetContent` from `@/components/ui/sheet`; `usePathname` from `next/navigation`.
- Produces: `TaskFab()` — fixed FAB, hidden on `/`, opens a right Sheet that lazy-loads board data and renders `<TaskBoard layout="stack">`.

- [ ] **Step 1: Implement `task-fab.tsx`**

Create `apps/crm/src/components/layout/task-fab.tsx`:

```tsx
"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ListChecks } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TaskBoard } from "@/app/(dashboard)/_components/task-board";
import { getTaskBoardData } from "@/app/(dashboard)/_task-actions";
import { seoulDateString } from "@/lib/date";
import type { BoardData } from "@/lib/tasks/types";

export function TaskFab() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<BoardData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const today = seoulDateString();

  // The dashboard already shows the board — no FAB there.
  if (pathname === "/") return null;

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v && !data) {
      setLoading(true);
      getTaskBoardData()
        .then(setData)
        .finally(() => setLoading(false));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="할 일 보드 열기"
        className="fixed bottom-5 right-5 z-30 flex size-12 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 md:bottom-6 md:right-6"
      >
        <ListChecks className="size-5" />
      </button>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>할 일</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {loading || !data ? (
              <p className="py-10 text-center text-[13px] text-muted-foreground">
                불러오는 중…
              </p>
            ) : (
              <TaskBoard data={data} today={today} layout="stack" />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

> If `SheetContent` does not accept a `side` prop in this codebase's version, drop it (default is `right`). Confirm with `grep "side" apps/crm/src/components/ui/sheet.tsx` (Task already verified `side?: "top"|"right"|"bottom"|"left"` exists).

- [ ] **Step 2: Mount the FAB in the app shell**

In `apps/crm/src/components/layout/app-shell.tsx`, add the import at the top:

```ts
import { TaskFab } from "@/components/layout/task-fab";
```

and render it inside the root `<div className="flex min-h-svh flex-col">`, immediately before its closing `</div>` (after the `<div className="flex min-h-0 flex-1">…</div>` block):

```tsx
      <TaskFab />
```

- [ ] **Step 3: Typecheck + build**

Run: `cd apps/crm && pnpm exec tsc --noEmit && pnpm build`
Expected: clean typecheck and successful build.

- [ ] **Step 4: Manual verification in the running app**

Run: `pnpm --filter crm dev` (serves on http://localhost:5007)
Verify:
1. Dashboard `/` shows the 할 일 board in place of the old payment board; toggling 계획/상태 swaps columns; 전체/내 할 일 and the 담당자 select filter cards; suggestions appear in the rail.
2. `추가` on a suggestion moves it into the board and it disappears from the rail; `무시`/`나중에` remove it.
3. Dragging a card between columns persists across a page refresh (status/plan bucket + order stick).
4. On any non-dashboard page (e.g. `/tenants`), the FAB appears bottom-right; clicking opens the sheet with the stacked board defaulting to 내 할 일; the FAB is absent on `/`.
5. `할 일` dialog: create a card with a due date + assignee; the D-day badge and avatar render; editing updates it; delete removes it (and is blocked for non-creator/non-admin — spot-check if multiple accounts are available).

- [ ] **Step 5: Run the full unit-test suite**

Run: `pnpm --filter crm test`
Expected: all `node:test` files pass (date, board, suggestions).

- [ ] **Step 6: Commit**

```bash
git add apps/crm/src/components/layout/task-fab.tsx apps/crm/src/components/layout/app-shell.tsx
git commit -m "feat(tasks): FAB → sheet board on every non-dashboard page"
```

---

## Self-Review

**Spec coverage (each spec section → task):**
- §3 data model → Task 1 (all three tables + indexes).
- §4 two views (plan/status, bucket math, drag semantics, 7-day done, shared sort_order) → Task 3 (pure) + Task 8 (`TaskBoard`).
- §5 filters (전체/내 할 일 + assignee select) → Task 8 toolbar.
- §6 suggestion engine (4 providers, dedup, dismiss/snooze, accept→task with planned_date rule) → Task 4 (filter), Task 5 (providers/candidates), Task 6 (`acceptSuggestion`/`dismiss`/`snooze`).
- §7 surfaces (dashboard home replacing PaymentBoard; FAB→Sheet; columns/stack layouts) → Task 9 (dashboard) + Task 10 (FAB) + Task 8 (`layout` prop).
- §8 components/data flow (file list, lazy FAB load via `getTaskBoardData`, optimistic+revalidate) → Tasks 5–10.
- §9 server actions (all 9) → Task 6.
- §10 permissions (approved staff; delete = creator/admin) → Task 6 (`requireUser`, delete check) + staff query excludes pending in Task 5.
- §11 error handling (inline + rollback, accept race guard) → Task 8 (rollback) + Task 6 (`acceptSuggestion` existence check).
- §12 testing (suggestion filter + board math as pure units) → Tasks 2–4 tests.
- §13 deps/migration/regression → Task 1 (codegen), Task 8 (dnd deps), Task 9 (regression grep + build).

**Placeholder scan:** No TBD/TODO; every code step contains full code; commands have expected output. The two inline notes (unused `addDays` import; dynamic grid class) are corrective guidance, not placeholders.

**Type consistency:** `moveTask(id, status, plannedDate, sortOrder)` — same shape in Task 6 (definition) and Task 8 (call). `acceptSuggestion(s: SuggestedTask)` consistent across Tasks 6/8. `SuggestedTask`/`TaskView`/`BoardData`/`StaffOption` defined once in Task 4, imported everywhere. `planBucket`/`plannedDateForBucket`/`midpointSortOrder` signatures match between Task 3 and Task 8. `loadBoardData(): Promise<BoardData>` consistent across Tasks 5/6/9. `getTaskBoardData` (Task 6) consumed in Task 10. `DueBadge` exported from `task-card.tsx` (Task 7) and reused in `suggestion-rail.tsx`.
