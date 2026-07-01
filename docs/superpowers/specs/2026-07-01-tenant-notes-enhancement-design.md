# Tenant Notes Enhancement — Design

**Date:** 2026-07-01
**Status:** Approved design, pending implementation plan
**Scope:** Enhance the tenant detail page notes panel with authorship display,
resolve state, @mentions with notifications (including `@everyone`), reply
threads, rich text (SunEditor), and inline editing.

## Goal

Turn the tenant detail notes panel from a flat plain-text list into a
collaborative thread: staff can see who posted (with avatar), mark notes
resolved, mention colleagues (notified via the existing notification system),
reply in single-level threads, write rich text with links, and edit their own
notes.

The panel stays in the detail **side rail** (`aside`, ~21rem) — always visible
while browsing other tabs — so all UI must fit a narrow column.

## Current state

- `tenant_note` table: `id, tenant_id, content (plain text), created_by,
  created_at`. No resolve / threading / updated_at.
- `TenantNotes` (`apps/crm/src/app/(dashboard)/tenants/_components/tenant-notes.tsx`)
  renders in the `aside` rail: author name + timestamp + `whitespace-pre-wrap`
  text, an add `<Textarea>`, and a delete button. Guarded by
  `requirePermission("tenant","update")`.
- Actions in `tenants/_actions.ts`: `addTenantNote`, `deleteTenantNote`.
- `notification` table exists (migration 013): `type, target_user_id (NULL =
  everyone), ref_entity_type/id, title, message, due_date, dedup_key (unique),
  is_read, created_at`.
  - **Important:** the notifications page and sidebar unread badge currently show
    **all** rows regardless of `target_user_id`, and `is_read` is a single shared
    flag. Today it is effectively a global broadcast board, not per-user.
- No rich-text editor and no HTML sanitizer anywhere in the repo. React 19.2,
  Next 16.

## Data model — migration `026_tenant_note_enhance.ts`

Alter `tenant_note`:

- `parent_id integer null references tenant_note(id) on delete cascade` —
  single-level reply threads (a reply has a parent; top-level notes do not; no
  reply-to-reply).
- `resolved_at timestamptz null` and `resolved_by integer null references
  user(id)` — resolve state, top-level notes only.
- `updated_at timestamptz null` — set only on a **content edit** (not on resolve
  toggle), drives the "(edited)" badge.
- `content` remains `text` but now stores **sanitized HTML**. Existing plain-text
  rows render unchanged (plain text is valid HTML text content).

Index: `idx_tenant_note_tenant (tenant_id, parent_id, created_at)` to fetch a
tenant's thread efficiently.

No mention table — mentioned user ids are parsed from the note HTML at write
time (YAGNI; we do not need to query "notes mentioning me").

## Rich text — SunEditor (core package)

- Add dependency **`suneditor`** only (the framework-agnostic core). Do **not**
  use `suneditor-react` — its peer deps lag React 19.
- Mount SunEditor via `useEffect` + `ref` inside a `"use client"` `NoteComposer`
  component, **dynamically imported with `ssr: false`** (mirrors the existing
  `apps/crm/src/components/layout/topbar.tsx` dynamic-import pattern) because it
  requires `window`.
- Compact toolbar sized for the rail: **bold, italic, underline, list, link,
  removeFormat**. Fixed small min-height.
- On submit the editor yields HTML.

### Sanitization

- Add dependency **`sanitize-html`**.
- A shared server helper `sanitizeNoteHtml(html)` allows only:
  `b, strong, i, em, u, a[href,target,rel], ul, ol, li, p, br,
  span[class,data-mention]`.
- Links are forced to `target="_blank"` + `rel="noopener nofollow"`.
- Content is sanitized **on write** (stored clean) and re-sanitized **on read**
  defensively before `dangerouslySetInnerHTML`.

## Mentions + notifications

- **Inline `@` autocomplete** in the editor: typing `@` + query opens a
  positioned dropdown listing **active, non-banned staff** plus a pinned
  **@everyone** entry. Selecting inserts a chip:
  - user: `<span class="mention" data-mention="{userId}">@Name</span>`
  - everyone: `<span class="mention" data-mention="everyone">@everyone</span>`
  and removes the typed `@query`.
- Staff list for the dropdown is fetched server-side (active, non-banned) and
  passed to the composer.
- **On submit**, the server parses `data-mention` attributes from the sanitized
  HTML and writes `notification` rows:
  - one row per distinct mentioned user: `type:"mention"`,
    `target_user_id:{userId}`, `ref_entity_type:"tenant"`,
    `ref_entity_id:{tenantId}`, title/message referencing author + tenant,
    `dedup_key: mention:{noteId}:{userId}`.
  - `@everyone` → a single `target_user_id NULL` broadcast row
    (`dedup_key: mention:{noteId}:everyone`).
  - The **author is never notified** of their own mention.
- **On edit**, only **newly added** mentions (present now, absent in the prior
  version) generate notifications; existing mentions are not re-notified.
  `dedup_key` also guards against duplicates.

### Required companion change — make notifications per-user

- Notifications page (`notifications/page.tsx`) and sidebar unread badge
  (`(dashboard)/layout.tsx`) queries change to scope rows to the current user:
  `target_user_id = me OR target_user_id IS NULL`.
- Backward-compatible: existing `contract_expiry` rows have `target_user_id
  NULL`, so they still reach everyone.
- `notification-list.tsx`: add handling for `type:"mention"` (label + link to
  `/tenants/{ref_entity_id}`).
- Shared read-state caveat (accepted, YAGNI): `is_read` remains a single flag per
  row. For personal (user-targeted) mentions this is effectively per-user since
  only that user sees the row. For `NULL` broadcasts (contract expiry,
  `@everyone`) read state is shared — same as today. No per-user read table.

## Resolve, threads, edit, authorship

- **Resolve:** a check-toggle on top-level notes → sets/clears
  `resolved_at` + `resolved_by`. Resolved notes collapse to a muted one-line
  summary, sort below open notes, and are hidden when a "해결된 메모 숨기기"
  filter is on. Resolve toggle does **not** bump `updated_at`.
- **Threads:** replies render indented under their parent with a compact "답글"
  composer (same SunEditor composer, `parentId` set). Replies support
  mention/edit/delete but not independent resolve.
- **Edit:** author-only. `editTenantNote` updates sanitized `content`, sets
  `updated_at`, and notifies newly added mentions. UI shows an "(edited)" badge
  when `updated_at` is set (i.e. `updated_at > created_at`).
- **Authorship:** show `user.image` avatar beside the existing author name.

## Server actions (`tenants/_actions.ts`)

- `addTenantNote(tenantId, formData)` — extended: reads `content` (HTML) and
  optional `parentId`; sanitizes; inserts; creates mention notifications.
- `editTenantNote(noteId, tenantId, formData)` — author-only; sanitizes; updates
  content + `updated_at`; notifies newly added mentions.
- `toggleTenantNoteResolved(noteId, tenantId)` — toggles resolve fields; does not
  touch `updated_at`.
- `deleteTenantNote(id, tenantId)` — unchanged behavior; DB cascade removes
  replies.

All keep `requirePermission("tenant","update")`; `editTenantNote` additionally
checks `created_by === session.user.id`.

## Data flow

1. Detail page (`tenants/[id]/_detail.tsx`) query loads the tenant's notes
   (top-level + replies) joined to `user` for author name/avatar and resolver,
   plus the active-staff list for the mention dropdown; passes both to
   `TenantNotes` in the `aside`.
2. `TenantNotes` groups replies under parents, renders sanitized HTML, resolve
   toggle, filter, and composers.
3. Composers post HTML to the server actions → sanitize → persist → create
   notifications → `revalidatePath('/tenants/{id}')` (and `/notifications`).

## Components

- `NoteComposer` (`"use client"`, dynamic `ssr:false`) — wraps SunEditor + the
  `@` mention dropdown; used for both new notes and replies.
- `TenantNotes` — rewritten to render threads, authorship w/ avatar, resolve,
  filter, edit/delete controls, and embed `NoteComposer`.
- `lib/notes/sanitize.ts` — `sanitizeNoteHtml` + `extractMentions(html)` helpers.

## Out of scope

- Per-user read state for broadcast notifications (shared flag retained).
- Reply-to-reply nesting (single level only).
- Reactions / attachments / note pinning.
- Rich media embeds beyond links.

## Risks

- **SunEditor + React 19 / Next 16 SSR:** mitigated by using the core package via
  ref + `ssr:false` dynamic import rather than the React wrapper.
- **Stored XSS:** mitigated by server-side allowlist sanitization on write and
  defensive re-sanitization on read.
- **Narrow rail UX:** compact toolbar + minimal chrome; if it proves too cramped
  in practice, promoting to a dedicated tab is a follow-up (not this spec).
- **Mention dropdown caret positioning** inside SunEditor's contenteditable is
  the fiddliest part; budget for iteration.

## Testing

- Unit: `sanitizeNoteHtml` (strips disallowed tags/attrs, forces link rel/target)
  and `extractMentions` (user ids + `everyone`, dedup, ignores malformed).
- Manual: post/edit/reply/resolve/delete; mention a user and `@everyone`;
  confirm notifications land for the target user only (and broadcast reaches
  all); confirm "(edited)" badge and resolve filter behavior.
