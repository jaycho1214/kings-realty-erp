# Tenant Notes Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tenant detail notes side-rail into a collaborative thread with authorship+avatar, resolve state, @mentions that fire notifications (incl. `@everyone`), single-level reply threads, SunEditor rich text, and author-only inline editing.

**Architecture:** A migration adds `parent_id`, `resolved_at/by`, and `updated_at` to `tenant_note`; `content` now stores sanitized HTML. A pure `lib/notes/sanitize.ts` module (allowlist sanitize + mention extraction) is the trust boundary. Server actions persist notes and write per-user `notification` rows from parsed mentions; the notifications page/badge become user-scoped. A dynamically-imported (`ssr:false`) `NoteComposer` wraps SunEditor with an `@` mention dropdown, and `TenantNotes` is rewritten to render threads.

**Tech Stack:** Next.js 16, React 19.2, Kysely/Postgres, `suneditor` (core, not the React wrapper), `sanitize-html`, existing shadcn `Avatar`, server actions.

## Global Constraints

- Notes panel stays in the detail **side rail** (`aside`, ~21rem) — all UI fits a narrow column.
- Use the **core `suneditor`** package mounted via ref; **never** `suneditor-react` (peer deps lag React 19).
- SunEditor is client-only → its wrapper is dynamically imported with `ssr: false` (pattern: `apps/crm/src/components/layout/topbar.tsx:10-20`).
- `content` stores **HTML sanitized on write and re-sanitized on read** before `dangerouslySetInnerHTML`. Allowlist exactly: `b, strong, i, em, u, a[href,target,rel], ul, ol, li, p, br, span[class,data-mention]`. Links forced to `target="_blank" rel="noopener nofollow"`.
- Mention chips: `<span class="mention" data-mention="{userId}">@Name</span>`; everyone: `data-mention="everyone"`.
- Notification rows for mentions: `type:"mention"`, `ref_entity_type:"tenant"`, `ref_entity_id:{tenantId}`, `dedup_key:"mention:{noteId}:{userId|everyone}"`; `@everyone` = single `target_user_id NULL` row; author never notified of self.
- All note actions keep `requirePermission("tenant","update")`; `editTenantNote` additionally requires `created_by === Number(session.user.id)`.
- Resolve toggle must **not** bump `updated_at`; "(edited)" badge shows iff `updated_at` is non-null.
- `@` mention list = **active, non-banned** staff only (`user.banned IS NOT TRUE`).
- Korean UI copy throughout; commit style matches repo (Co-Authored-By trailer, stage only your own files — repo is worked directly on `main` with an external auto-commit process).

---

### Task 1: Migration + generated types for `tenant_note`

**Files:**
- Create: `packages/db/src/migrations/026_tenant_note_enhance.ts`
- Modify: `packages/db/src/types.ts` (the `TenantNote` interface, ~line 552)

**Interfaces:**
- Produces: `tenant_note` columns `parent_id: number | null`, `resolved_at: Timestamp | null`, `resolved_by: number | null`, `updated_at: Timestamp | null`. Consumed by Tasks 3 and 6.

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/026_tenant_note_enhance.ts`:

```typescript
import type { Kysely } from "kysely";

/**
 * 세입자 메모 고도화: 답글 스레드(parent_id), 해결 상태(resolved_at/by),
 * 수정 시각(updated_at). content 는 이제 정화된 HTML(rich text)을 저장한다.
 * 기존 평문 메모는 그대로 텍스트로 렌더된다.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("tenant_note")
    .addColumn("parent_id", "integer", (col) =>
      col.references("tenant_note.id").onDelete("cascade"),
    )
    .addColumn("resolved_at", "timestamptz")
    .addColumn("resolved_by", "integer", (col) => col.references("user.id"))
    .addColumn("updated_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("idx_tenant_note_tenant")
    .on("tenant_note")
    .columns(["tenant_id", "parent_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex("idx_tenant_note_tenant")
    .ifExists()
    .execute();
  await db.schema
    .alterTable("tenant_note")
    .dropColumn("parent_id")
    .dropColumn("resolved_at")
    .dropColumn("resolved_by")
    .dropColumn("updated_at")
    .execute();
}
```

- [ ] **Step 2: Run the migration**

Run: `pnpm --filter @kingsrealty/db migrate`
Expected: `↑ 026_tenant_note_enhance: Success` then `Done.`

- [ ] **Step 3: Regenerate types (or hand-edit)**

If a dev DB is reachable: `pnpm --filter @kingsrealty/db generate` and confirm `TenantNote` gained the new fields.
Otherwise hand-edit `packages/db/src/types.ts` — replace the `TenantNote` interface with:

```typescript
export interface TenantNote {
  content: string;
  created_at: Generated<Timestamp>;
  created_by: number;
  id: Generated<number>;
  parent_id: number | null;
  resolved_at: Timestamp | null;
  resolved_by: number | null;
  tenant_id: number;
  updated_at: Timestamp | null;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/crm && ./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/026_tenant_note_enhance.ts packages/db/src/types.ts
git commit -m "feat(db): tenant_note threads, resolve, updated_at (migration 026)"
```

---

### Task 2: Sanitize + mention-extraction library (TDD)

**Files:**
- Create: `apps/crm/src/lib/notes/sanitize.ts`
- Test: `apps/crm/src/lib/notes/sanitize.test.ts`
- Modify: `apps/crm/package.json` (add `sanitize-html` + `@types/sanitize-html`; register test file in `test` script)

**Interfaces:**
- Produces:
  - `sanitizeNoteHtml(html: string): string`
  - `extractMentions(html: string): { userIds: number[]; everyone: boolean }`
  Both consumed by Task 3; `sanitizeNoteHtml` also consumed by Task 6 (read-side).

- [ ] **Step 1: Add dependencies**

Run: `pnpm --filter crm add sanitize-html && pnpm --filter crm add -D @types/sanitize-html`
Expected: both appear in `apps/crm/package.json`.

- [ ] **Step 2: Write the failing test**

Create `apps/crm/src/lib/notes/sanitize.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeNoteHtml, extractMentions } from "./sanitize.ts";

test("keeps allowed formatting tags", () => {
  const out = sanitizeNoteHtml("<p>hi <strong>there</strong> <em>ok</em></p>");
  assert.equal(out, "<p>hi <strong>there</strong> <em>ok</em></p>");
});

test("strips script and event handlers", () => {
  const out = sanitizeNoteHtml('<p onclick="x()">a</p><script>alert(1)</script>');
  assert.equal(out, "<p>a</p>");
});

test("forces safe link attributes", () => {
  const out = sanitizeNoteHtml('<a href="https://ex.com">x</a>');
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener nofollow"/);
});

test("drops javascript: hrefs", () => {
  const out = sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>');
  assert.doesNotMatch(out, /javascript:/);
});

test("keeps mention span with data-mention and class", () => {
  const html = '<span class="mention" data-mention="7">@Kim</span>';
  assert.equal(sanitizeNoteHtml(html), html);
});

test("extractMentions collects user ids, dedups, ignores malformed", () => {
  const html =
    '<span data-mention="7">@A</span><span data-mention="7">@A</span>' +
    '<span data-mention="9">@B</span><span data-mention="abc">@C</span>';
  const m = extractMentions(html);
  assert.deepEqual(m.userIds.sort((a, b) => a - b), [7, 9]);
  assert.equal(m.everyone, false);
});

test("extractMentions detects everyone", () => {
  const m = extractMentions('<span data-mention="everyone">@everyone</span>');
  assert.equal(m.everyone, true);
  assert.deepEqual(m.userIds, []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/crm && node --import tsx --test src/lib/notes/sanitize.test.ts`
Expected: FAIL — cannot find module `./sanitize.ts`.

- [ ] **Step 4: Implement the module**

Create `apps/crm/src/lib/notes/sanitize.ts`:

```typescript
import sanitizeHtml from "sanitize-html";

/**
 * Allowlist sanitizer for tenant-note rich text. Runs on write (store clean)
 * and again on read (defensive) before dangerouslySetInnerHTML.
 */
export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "p", "br", "span",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["class", "data-mention"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener nofollow",
        },
      }),
    },
  });
}

/** Parse mention chips (`data-mention="7"` / `"everyone"`) from note HTML. */
export function extractMentions(html: string): {
  userIds: number[];
  everyone: boolean;
} {
  const ids = new Set<number>();
  let everyone = false;
  const re = /data-mention="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const value = match[1];
    if (value === "everyone") {
      everyone = true;
      continue;
    }
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) ids.add(n);
  }
  return { userIds: [...ids], everyone };
}
```

- [ ] **Step 5: Register the test file**

In `apps/crm/package.json`, append ` src/lib/notes/sanitize.test.ts` to the end of the `test` script string.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/crm && node --import tsx --test src/lib/notes/sanitize.test.ts`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/crm/src/lib/notes/sanitize.ts apps/crm/src/lib/notes/sanitize.test.ts apps/crm/package.json pnpm-lock.yaml
git commit -m "feat(notes): HTML sanitizer + mention extraction with tests"
```

---

### Task 3: Server actions (add / edit / resolve) + mention notifications

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/tenants/_actions.ts` (Tenant Notes section, ~line 810-840)

**Interfaces:**
- Consumes: `sanitizeNoteHtml`, `extractMentions` (Task 2); new `tenant_note` columns (Task 1).
- Produces server actions consumed by Tasks 5/6:
  - `addTenantNote(tenantId: number, formData: FormData): Promise<void>` — reads `content` (HTML) and optional `parentId`.
  - `editTenantNote(noteId: number, tenantId: number, formData: FormData): Promise<void>`
  - `toggleTenantNoteResolved(noteId: number, tenantId: number): Promise<void>`
  - `deleteTenantNote(id: number, tenantId: number): Promise<void>` (unchanged signature).

- [ ] **Step 1: Add imports at the top of `_actions.ts`**

Ensure these imports exist (add if missing):

```typescript
import { sanitizeNoteHtml, extractMentions } from "@/lib/notes/sanitize";
```

- [ ] **Step 2: Add a shared mention-notification helper**

In the Tenant Notes section of `_actions.ts`, add:

```typescript
// Create per-user "mention" notifications for the mentions in a note's HTML.
// authorId is skipped; @everyone becomes a single broadcast (target NULL) row.
// dedup_key makes this idempotent, so edits only ever add missing rows.
async function notifyMentions(
  db: ReturnType<typeof getDb>,
  opts: {
    tenantId: number;
    noteId: number;
    html: string;
    authorId: number;
    authorName: string;
    tenantName: string;
    onlyUserIds?: number[]; // when set (edit), restrict to these ids
  },
) {
  const { userIds, everyone } = extractMentions(opts.html);
  const rows: {
    type: string;
    target_user_id: number | null;
    ref_entity_type: string;
    ref_entity_id: number;
    title: string;
    message: string;
    dedup_key: string;
  }[] = [];

  const allow = opts.onlyUserIds ? new Set(opts.onlyUserIds) : null;
  for (const uid of userIds) {
    if (uid === opts.authorId) continue;
    if (allow && !allow.has(uid)) continue;
    rows.push({
      type: "mention",
      target_user_id: uid,
      ref_entity_type: "tenant",
      ref_entity_id: opts.tenantId,
      title: `${opts.authorName} 님이 메모에서 회원님을 멘션했습니다`,
      message: `${opts.tenantName} · 메모를 확인하세요.`,
      dedup_key: `mention:${opts.noteId}:${uid}`,
    });
  }
  if (everyone && (!allow || allow.has(-1))) {
    rows.push({
      type: "mention",
      target_user_id: null,
      ref_entity_type: "tenant",
      ref_entity_id: opts.tenantId,
      title: `${opts.authorName} 님이 전체 멘션(@everyone)했습니다`,
      message: `${opts.tenantName} · 메모를 확인하세요.`,
      dedup_key: `mention:${opts.noteId}:everyone`,
    });
  }
  if (rows.length === 0) return;
  await db
    .insertInto("notification")
    .values(rows)
    .onConflict((oc) => oc.column("dedup_key").doNothing())
    .execute();
}
```

- [ ] **Step 3: Replace `addTenantNote` with the HTML/threaded version**

```typescript
export async function addTenantNote(tenantId: number, formData: FormData) {
  const session = await requirePermission("tenant", "update");

  const raw = (formData.get("content") as string) ?? "";
  const content = sanitizeNoteHtml(raw).trim();
  if (!content || content === "<p><br></p>") return;

  const parentRaw = formData.get("parentId") as string | null;
  const parentId = parentRaw ? Number(parentRaw) : null;

  const db = getDb();
  const authorId = Number(session.user.id);

  const inserted = await db
    .insertInto("tenant_note")
    .values({
      tenant_id: tenantId,
      content,
      created_by: authorId,
      parent_id: parentId,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const tenant = await db
    .selectFrom("tenant")
    .select("name")
    .where("id", "=", tenantId)
    .executeTakeFirst();

  await notifyMentions(db, {
    tenantId,
    noteId: inserted.id,
    html: content,
    authorId,
    authorName: session.user.name ?? "동료",
    tenantName: tenant?.name ?? "세입자",
  });

  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/notifications");
}
```

- [ ] **Step 4: Add `editTenantNote` (author-only, notifies only new mentions)**

```typescript
export async function editTenantNote(
  noteId: number,
  tenantId: number,
  formData: FormData,
) {
  const session = await requirePermission("tenant", "update");
  const db = getDb();
  const authorId = Number(session.user.id);

  const existing = await db
    .selectFrom("tenant_note")
    .select(["created_by", "content"])
    .where("id", "=", noteId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!existing) return;
  if (existing.created_by !== authorId) {
    throw new Error("본인이 작성한 메모만 수정할 수 있습니다.");
  }

  const raw = (formData.get("content") as string) ?? "";
  const content = sanitizeNoteHtml(raw).trim();
  if (!content || content === "<p><br></p>") return;

  await db
    .updateTable("tenant_note")
    .set({ content, updated_at: new Date() })
    .where("id", "=", noteId)
    .execute();

  // Only newly added mentions should notify.
  const before = extractMentions(existing.content);
  const after = extractMentions(content);
  const newUserIds = after.userIds.filter((id) => !before.userIds.includes(id));
  const everyoneIsNew = after.everyone && !before.everyone;
  if (newUserIds.length > 0 || everyoneIsNew) {
    const tenant = await db
      .selectFrom("tenant")
      .select("name")
      .where("id", "=", tenantId)
      .executeTakeFirst();
    await notifyMentions(db, {
      tenantId,
      noteId,
      html: content,
      authorId,
      authorName: session.user.name ?? "동료",
      tenantName: tenant?.name ?? "세입자",
      onlyUserIds: everyoneIsNew ? [...newUserIds, -1] : newUserIds,
    });
  }

  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/notifications");
}
```

- [ ] **Step 5: Add `toggleTenantNoteResolved` (does not touch updated_at)**

```typescript
export async function toggleTenantNoteResolved(
  noteId: number,
  tenantId: number,
) {
  const session = await requirePermission("tenant", "update");
  const db = getDb();

  const note = await db
    .selectFrom("tenant_note")
    .select("resolved_at")
    .where("id", "=", noteId)
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!note) return;

  const resolving = note.resolved_at == null;
  await db
    .updateTable("tenant_note")
    .set({
      resolved_at: resolving ? new Date() : null,
      resolved_by: resolving ? Number(session.user.id) : null,
    })
    .where("id", "=", noteId)
    .execute();

  revalidatePath(`/tenants/${tenantId}`);
}
```

(`deleteTenantNote` is unchanged; the DB `on delete cascade` removes replies.)

- [ ] **Step 6: Typecheck**

Run: `cd apps/crm && ./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/crm/src/app/\(dashboard\)/tenants/_actions.ts
git commit -m "feat(notes): threaded/edit/resolve actions + mention notifications"
```

---

### Task 4: Make notifications user-scoped + label mentions

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/notifications/page.tsx`
- Modify: `apps/crm/src/app/(dashboard)/layout.tsx:65-69` (unread count query)
- Modify: `apps/crm/src/app/(dashboard)/notifications/_components/notification-list.tsx` (mention link — already links `tenant`, verify)

**Interfaces:**
- Consumes: `getSession`/session user id (already imported where needed — `getSession` from `@/lib/session`).

- [ ] **Step 1: Scope the notifications page to the current user**

In `notifications/page.tsx`, import the session helper and add a `where` clause. Replace the query with:

```typescript
import { getDb } from "@kingsrealty/db";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/session";
import { NotificationList } from "./_components/notification-list";

export default async function NotificationsPage() {
  const db = getDb();
  const session = await getSession();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const notifications = await db
    .selectFrom("notification")
    .select([
      "id", "type", "title", "message", "due_date",
      "ref_entity_type", "ref_entity_id", "is_read", "created_at",
    ])
    .where((eb) =>
      eb.or([
        eb("target_user_id", "is", null),
        ...(userId != null ? [eb("target_user_id", "=", userId)] : []),
      ]),
    )
    .orderBy("is_read", "asc")
    .orderBy("created_at", "desc")
    .limit(200)
    .execute();

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-5">
      <PageHeader title="알림 센터" count={unread} />
      <NotificationList
        notifications={notifications.map((n) => ({
          ...n,
          due_date: n.due_date
            ? new Date(n.due_date).toISOString().split("T")[0]
            : null,
          created_at:
            n.created_at instanceof Date
              ? n.created_at.toISOString()
              : String(n.created_at),
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Scope the sidebar unread badge**

In `apps/crm/src/app/(dashboard)/layout.tsx`, find where the session user id is available (this layout already resolves the session for the shell). If a `userId` is in scope, change the notification count query (lines ~65-69) to:

```typescript
db
  .selectFrom("notification")
  .select(({ fn }) => fn.count<number>("id").as("c"))
  .where("is_read", "=", false)
  .where((eb) =>
    eb.or([
      eb("target_user_id", "is", null),
      ...(userId != null ? [eb("target_user_id", "=", userId)] : []),
    ]),
  )
  .executeTakeFirst(),
```

If no session id is currently resolved in this file, add `const session = await getSession();` (import `getSession` from `@/lib/session`) and `const userId = session?.user?.id ? Number(session.user.id) : null;` before the `Promise.all`.

- [ ] **Step 3: Confirm the mention link resolves**

In `notification-list.tsx`, `hrefFor` already maps `ref_entity_type === "tenant"` → `/tenants/{id}`, which covers `type:"mention"`. No change needed unless you want a distinct icon; leave as-is.

- [ ] **Step 4: Typecheck + lint**

Run: `cd apps/crm && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint "src/app/(dashboard)/notifications/page.tsx" "src/app/(dashboard)/layout.tsx"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/crm/src/app/\(dashboard\)/notifications/page.tsx apps/crm/src/app/\(dashboard\)/layout.tsx
git commit -m "feat(notifications): scope center + unread badge to current user"
```

---

### Task 5: `NoteComposer` — SunEditor + `@` mention dropdown

**Files:**
- Create: `apps/crm/src/app/(dashboard)/tenants/_components/note-composer.tsx`
- Modify: `apps/crm/package.json` (add `suneditor`)

**Interfaces:**
- Produces `NoteComposer` (default export from a dynamically-importable module):
  ```typescript
  interface StaffOption { id: number; name: string }
  interface NoteComposerProps {
    staff: StaffOption[];
    onSubmit: (html: string) => void | Promise<void>;
    submitLabel: string;      // e.g. "메모 추가" / "저장"
    initialHtml?: string;     // for edit mode
    autoFocus?: boolean;
    onCancel?: () => void;    // shown as a 취소 button when provided
  }
  ```
  Consumed by Task 6.

- [ ] **Step 1: Add the editor dependency**

Run: `pnpm --filter crm add suneditor`
Expected: `suneditor` in `apps/crm/package.json`.

- [ ] **Step 2: Write the composer**

Create `apps/crm/src/app/(dashboard)/tenants/_components/note-composer.tsx`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import suneditor from "suneditor";
import plugins from "suneditor/src/plugins";
import type SunEditorCore from "suneditor/src/lib/core";
import "suneditor/dist/css/suneditor.min.css";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";

interface StaffOption {
  id: number;
  name: string;
}

interface NoteComposerProps {
  staff: StaffOption[];
  onSubmit: (html: string) => void | Promise<void>;
  submitLabel: string;
  initialHtml?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}

// Escape a mention name so it can't inject markup into the chip.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function NoteComposer({
  staff,
  onSubmit,
  submitLabel,
  initialHtml,
  autoFocus,
  onCancel,
}: NoteComposerProps) {
  const hostRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<SunEditorCore | null>(null);
  const [pending, setPending] = useState(false);
  const [menu, setMenu] = useState<{
    query: string;
    top: number;
    left: number;
    index: number;
  } | null>(null);

  // Build the mention candidate list (users + @everyone) for the current query.
  const candidates = (() => {
    if (!menu) return [] as { id: string; label: string }[];
    const q = menu.query.toLowerCase();
    const users = staff
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((s) => ({ id: String(s.id), label: s.name }));
    const everyone = "everyone".includes(q) || q === ""
      ? [{ id: "everyone", label: "everyone" }]
      : [];
    return [...everyone, ...users];
  })();

  useEffect(() => {
    if (!hostRef.current) return;
    const editor = suneditor.create(hostRef.current, {
      plugins,
      buttonList: [["bold", "underline", "italic"], ["list"], ["link"], ["removeFormat"]],
      minHeight: "72px",
      height: "auto",
      resizingBar: false,
      placeholder: "메모를 입력하세요...",
      defaultTag: "p",
    });
    if (initialHtml) editor.setContents(initialHtml);
    editorRef.current = editor;
    if (autoFocus) editor.core.focus();

    // Detect a trailing `@query` token at the caret and position the dropdown.
    editor.onKeyUp = (_e: unknown) => {
      const sel = editor.core?.getSelection?.() ?? window.getSelection();
      if (!sel || sel.rangeCount === 0) return setMenu(null);
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return setMenu(null);
      const text = (node.textContent ?? "").slice(0, range.startOffset);
      const m = /(?:^|\s)@(\S*)$/.exec(text);
      if (!m) return setMenu(null);
      const rect = range.getBoundingClientRect();
      const host = hostRef.current!.parentElement!.getBoundingClientRect();
      setMenu({
        query: m[1],
        top: rect.bottom - host.top,
        left: rect.left - host.left,
        index: 0,
      });
    };

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function insertMention(id: string, label: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && menu) {
      // Replace the typed `@query` with the chip.
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const offset = range.startOffset;
      const consumed = menu.query.length + 1; // include the '@'
      range.setStart(node, Math.max(0, offset - consumed));
      range.setEnd(node, offset);
      range.deleteContents();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    editor.insertHTML(
      `<span class="mention" data-mention="${id}">@${escapeHtml(label)}</span>&nbsp;`,
      true,
      true,
    );
    setMenu(null);
  }

  function onKeyDownCapture(e: React.KeyboardEvent) {
    if (!menu || candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenu({ ...menu, index: (menu.index + 1) % candidates.length });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenu({
        ...menu,
        index: (menu.index - 1 + candidates.length) % candidates.length,
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = candidates[menu.index];
      insertMention(c.id, c.label);
    } else if (e.key === "Escape") {
      setMenu(null);
    }
  }

  async function handleSubmit() {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.getContents(true);
    setPending(true);
    try {
      await onSubmit(html);
      editor.setContents("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative" onKeyDownCapture={onKeyDownCapture}>
      {/* SunEditor replaces this textarea in place. */}
      <textarea ref={hostRef} defaultValue={initialHtml ?? ""} />

      {menu && candidates.length > 0 && (
        <ul
          className="absolute z-50 max-h-48 w-44 overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
          style={{ top: menu.top, left: menu.left }}
        >
          {candidates.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={`flex w-full items-center rounded-md px-2 py-1 text-left ${
                  i === menu.index ? "bg-secondary" : "hover:bg-secondary/60"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(c.id, c.label);
                }}
              >
                @{c.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            취소
          </Button>
        )}
        <SubmitButton label={submitLabel} onClick={handleSubmit} disabled={pending} />
      </div>
    </div>
  );
}
```

> Note: verify `SubmitButton` accepts `onClick`/`disabled`; if it is form-action-only, replace with a plain `<Button type="button" onClick={handleSubmit} disabled={pending}>{submitLabel}</Button>`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/crm && ./node_modules/.bin/tsc --noEmit`
Expected: no errors. Resolve any SunEditor type-path issues (if `suneditor/src/lib/core` types don't resolve, type `editorRef` as `any` and add a `// eslint-disable` — keep it local).

- [ ] **Step 4: Commit**

```bash
git add apps/crm/src/app/\(dashboard\)/tenants/_components/note-composer.tsx apps/crm/package.json pnpm-lock.yaml
git commit -m "feat(notes): SunEditor NoteComposer with @ mention dropdown"
```

---

### Task 6: Rewrite `TenantNotes` (threads, avatar, resolve, edit) + wire detail query

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/tenants/_components/tenant-notes.tsx` (full rewrite)
- Modify: `apps/crm/src/app/(dashboard)/tenants/[id]/_detail.tsx` (notes query + staff query + `aside` props)

**Interfaces:**
- Consumes: `NoteComposer` (Task 5); actions `addTenantNote`, `editTenantNote`, `toggleTenantNoteResolved`, `deleteTenantNote` (Task 3); `sanitizeNoteHtml` (Task 2) for read-side defense.

- [ ] **Step 1: Update the detail-page notes query**

In `tenants/[id]/_detail.tsx`, replace the `notes` query (currently joining `tenant_note`→`user` selecting `author_name`) so it returns thread + resolve + avatar data:

```typescript
db
  .selectFrom("tenant_note")
  .innerJoin("user", "user.id", "tenant_note.created_by")
  .leftJoin("user as resolver", "resolver.id", "tenant_note.resolved_by")
  .select([
    "tenant_note.id",
    "tenant_note.content",
    "tenant_note.parent_id",
    "tenant_note.created_at",
    "tenant_note.updated_at",
    "tenant_note.resolved_at",
    "user.name as author_name",
    "user.image as author_image",
    "resolver.name as resolver_name",
  ])
  .where("tenant_note.tenant_id", "=", numId)
  .orderBy("tenant_note.created_at", "asc")
  .execute(),
```

- [ ] **Step 2: Fetch the active-staff list for mentions**

Add to one of the `Promise.all` batches in `_detail.tsx`:

```typescript
db
  .selectFrom("user")
  .select(["id", "name"])
  .where("banned", "is not", true)
  .orderBy("name", "asc")
  .execute(),
```

Bind it to a `staff` variable.

- [ ] **Step 3: Pass the new props to `TenantNotes` in `aside`**

```tsx
aside={
  <TenantNotes
    tenantId={numId}
    staff={staff}
    notes={notes.map((n) => ({
      id: n.id,
      content: n.content,
      parent_id: n.parent_id,
      author_name: n.author_name,
      author_image: n.author_image,
      resolver_name: n.resolver_name,
      resolved: n.resolved_at != null,
      edited: n.updated_at != null,
      created_at:
        n.created_at instanceof Date
          ? n.created_at.toISOString()
          : String(n.created_at),
    }))}
  />
}
```

- [ ] **Step 4: Rewrite `tenant-notes.tsx`**

```typescript
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Pencil, Reply, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { sanitizeNoteHtml } from "@/lib/notes/sanitize";
import {
  addTenantNote,
  editTenantNote,
  deleteTenantNote,
  toggleTenantNoteResolved,
} from "../_actions";

const NoteComposer = dynamic(() => import("./note-composer"), {
  ssr: false,
  loading: () => (
    <div className="h-24 rounded-lg border bg-secondary/40" />
  ),
});

interface StaffOption {
  id: number;
  name: string;
}
interface NoteRow {
  id: number;
  content: string;
  parent_id: number | null;
  author_name: string;
  author_image: string | null;
  resolver_name: string | null;
  resolved: boolean;
  edited: boolean;
  created_at: string;
}
interface TenantNotesProps {
  tenantId: number;
  staff: StaffOption[];
  notes: NoteRow[];
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function NoteBody({ html }: { html: string }) {
  return (
    <div
      className="note-content whitespace-pre-wrap text-sm [&_a]:text-brand [&_a]:underline [&_.mention]:font-medium [&_.mention]:text-brand"
      dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(html) }}
    />
  );
}

export function TenantNotes({ tenantId, staff, notes }: TenantNotesProps) {
  const [hideResolved, setHideResolved] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const { roots, repliesByParent } = useMemo(() => {
    const roots: NoteRow[] = [];
    const repliesByParent = new Map<number, NoteRow[]>();
    for (const n of notes) {
      if (n.parent_id == null) roots.push(n);
      else {
        const arr = repliesByParent.get(n.parent_id) ?? [];
        arr.push(n);
        repliesByParent.set(n.parent_id, arr);
      }
    }
    // Open notes first, resolved sink to the bottom.
    roots.sort((a, b) => Number(a.resolved) - Number(b.resolved));
    return { roots, repliesByParent };
  }, [notes]);

  const visibleRoots = hideResolved ? roots.filter((r) => !r.resolved) : roots;

  function renderNote(n: NoteRow, isReply: boolean) {
    const del = deleteTenantNote.bind(null, n.id, tenantId);
    return (
      <li
        key={n.id}
        className={`group rounded-lg border bg-card p-3 ${
          n.resolved ? "opacity-60" : ""
        } ${isReply ? "ml-4 border-l-2" : ""}`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Avatar className="size-5">
              {n.author_image && <AvatarImage src={n.author_image} alt="" />}
              <AvatarFallback className="text-[9px]">
                {n.author_name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate font-medium text-foreground/70">
              {n.author_name}
            </span>
            <span className="tabular shrink-0">{fmt(n.created_at)}</span>
            {n.edited && <span className="shrink-0">(수정됨)</span>}
          </div>
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
            {!isReply && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label={n.resolved ? "미해결로" : "해결"}
                onClick={() => toggleTenantNoteResolved(n.id, tenantId)}
              >
                {n.resolved ? (
                  <RotateCcw className="size-3" />
                ) : (
                  <Check className="size-3" />
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6"
              aria-label="수정"
              onClick={() => setEditing(editing === n.id ? null : n.id)}
            >
              <Pencil className="size-3" />
            </Button>
            {!isReply && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label="답글"
                onClick={() => setReplyTo(replyTo === n.id ? null : n.id)}
              >
                <Reply className="size-3" />
              </Button>
            )}
            <form action={del}>
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                className="size-6 hover:text-danger"
                aria-label="삭제"
              >
                <Trash2 className="size-3" />
              </Button>
            </form>
          </div>
        </div>

        {editing === n.id ? (
          <NoteComposer
            staff={staff}
            initialHtml={n.content}
            submitLabel="저장"
            autoFocus
            onCancel={() => setEditing(null)}
            onSubmit={async (html) => {
              const fd = new FormData();
              fd.set("content", html);
              await editTenantNote(n.id, tenantId, fd);
              setEditing(null);
            }}
          />
        ) : (
          <NoteBody html={n.content} />
        )}

        {n.resolved && n.resolver_name && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {n.resolver_name} 님이 해결함
          </div>
        )}

        {!isReply &&
          (repliesByParent.get(n.id) ?? []).map((r) => (
            <ul key={r.id} className="mt-2 space-y-2">
              {renderNote(r, true)}
            </ul>
          ))}

        {!isReply && replyTo === n.id && (
          <div className="mt-2">
            <NoteComposer
              staff={staff}
              submitLabel="답글"
              autoFocus
              onCancel={() => setReplyTo(null)}
              onSubmit={async (html) => {
                const fd = new FormData();
                fd.set("content", html);
                fd.set("parentId", String(n.id));
                await addTenantNote(tenantId, fd);
                setReplyTo(null);
              }}
            />
          </div>
        )}
      </li>
    );
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 xl:max-h-[calc(100svh-5.75rem)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        <span className="text-[13px] font-semibold">메모</span>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={hideResolved}
            onChange={(e) => setHideResolved(e.target.checked)}
          />
          해결된 메모 숨기기
        </label>
      </header>

      <div className="shrink-0 border-b border-border/60 p-3.5">
        <NoteComposer
          staff={staff}
          submitLabel="메모 추가"
          onSubmit={async (html) => {
            const fd = new FormData();
            fd.set("content", html);
            await addTenantNote(tenantId, fd);
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {visibleRoots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            등록된 메모가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleRoots.map((n) => renderNote(n, false))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd apps/crm && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint "src/app/(dashboard)/tenants/_components/tenant-notes.tsx" "src/app/(dashboard)/tenants/_components/note-composer.tsx" "src/app/(dashboard)/tenants/[id]/_detail.tsx"`
Expected: no errors.

- [ ] **Step 6: Manual verification (dev server)**

Run: `pnpm --filter crm dev` and open a tenant detail page.
Confirm: compose with bold/link renders; typing `@` shows the staff + `@everyone` dropdown; posting a mention creates a notification for that user only (check `/notifications` as that user) and `@everyone` reaches all; reply nests under its parent; resolve greys+sinks the note and the filter hides it; editing your own note shows "(수정됨)"; editing someone else's note is rejected by the action.

- [ ] **Step 7: Commit**

```bash
git add apps/crm/src/app/\(dashboard\)/tenants/_components/tenant-notes.tsx apps/crm/src/app/\(dashboard\)/tenants/\[id\]/_detail.tsx
git commit -m "feat(notes): threaded notes UI with avatars, resolve, edit, mentions"
```

---

## Self-Review Notes

- **Spec coverage:** authorship+avatar (T6), resolve (T1/T3/T6), mentions+notifications incl. @everyone (T2/T3/T4/T5), reply threads (T1/T3/T6), rich text SunEditor + sanitize (T2/T5/T6), edit + "(edited)" badge (T1/T3/T6), active-staff-only mention list (T6). All covered.
- **Read-side defense:** `NoteBody` re-sanitizes with `sanitizeNoteHtml` before `dangerouslySetInnerHTML`.
- **Known fiddly area:** the mention caret replacement in `NoteComposer` (Task 5, `insertMention`) and SunEditor type paths — budget iteration; fall back to `any`-typed editor ref if the `suneditor/src/lib/core` type import doesn't resolve.
- **Verify during T5:** whether `SubmitButton` supports `onClick`/`disabled`; if not, use a plain `Button`.
