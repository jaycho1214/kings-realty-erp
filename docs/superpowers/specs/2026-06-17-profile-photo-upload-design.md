# Profile photo upload + avatars in user comboboxes

**Date:** 2026-06-17
**Status:** Approved (design)

## Summary

Let each user upload their own profile photo, store it on Vercel Blob, and
persist the URL on `user.image` (column already exists). Render the photo as an
avatar everywhere a user appears — starting with the topbar account menu and the
staff-picker (`담당자`) combobox — falling back to initials when no photo is set.

Scope is **self-service only** (a user can set/replace/remove their own photo; no
admin-manages-others flow) via a **dialog** launched from the topbar avatar
dropdown.

## Current state (already in place)

- `user.image` — nullable `text` column, managed by better-auth, currently unused.
- `@vercel/blob` (`put`, `del`) is a dependency; documents already upload to it.
  Documents are stored **private** and streamed through an auth proxy
  (`/api/documents/[id]`). Profile photos will instead be stored **public**.
- `Avatar` / `AvatarImage` / `AvatarFallback` exist (`components/ui/avatar.tsx`).
  `AvatarImage` already does `object-cover`. The topbar currently renders only the
  initials fallback.
- better-auth `authClient.updateUser({ image })` updates the current user and
  refreshes the session — we use this to set the URL after upload.

## Components

### 1. Upload route — `apps/crm/src/app/api/profile/photo/route.ts` (new)

`POST` handler, mirrors the validation style of `/api/upload`:

- Auth: `auth.api.getSession`; require any signed-in user (`session.user.id`).
  No role gate — a user always edits their **own** photo. The blob path is keyed
  to `session.user.id`, so a user can never target another account.
- Accept `multipart/form-data` with a single `file`.
- Validate MIME ∈ {`image/jpeg`, `image/png`, `image/webp`} and extension ∈
  {`.jpg`, `.jpeg`, `.png`, `.webp`}; reject otherwise (same 400 shape as
  `/api/upload`).
- Validate size ≤ **5MB** (server-side guard; the client pre-resizes much smaller).
- `put(`avatars/${userId}/${randomUUID()}${ext}`, file, { access: "public" })`.
- Best-effort cleanup: if the caller's current `user.image` is a Vercel Blob
  avatar URL, `del()` it after a successful upload. Failures here are swallowed
  (an orphan blob is harmless and must not fail the request).
- Return `{ url }`. The route does **not** write `user.image` — the client owns
  that via `updateUser` (keeps the session in sync in one step).

`DELETE` handler (same file): best-effort `del()` of the current avatar blob.
Clearing `user.image` itself is done client-side via `updateUser({ image: null })`.

### 2. Dialog — `apps/crm/src/components/layout/profile-photo-dialog.tsx` (new)

Client component, controlled `open`/`onOpenChange`. Contents:

- Current avatar preview (photo or initials), a "사진 선택" file input
  (`accept="image/*"`), a "저장" button, and a "사진 삭제" button (shown only when
  a photo exists).
- On file pick: **client-side downscale** — draw the image onto a canvas as a
  center-cropped square at max **512×512**, `canvas.toBlob(..., "image/webp", 0.9)`,
  wrap as a `File`. Show the result as the preview.
- On save: `POST` the resized file to `/api/profile/photo` → receive `{ url }` →
  `authClient.updateUser({ image: url })` → close dialog → `router.refresh()`.
- On delete: `authClient.updateUser({ image: null })` then `DELETE
  /api/profile/photo` (best-effort) → `router.refresh()`.
- Inline error text on validation/network failure; disable buttons while pending.

### 3. Topbar — `apps/crm/src/components/layout/topbar.tsx` (edit)

- Replace both initials-only avatars with `AvatarImage src={session.user.image}`
  + `AvatarFallback`{initials} (fallback renders automatically when `image` is
  null or the load fails).
- Add a `프로필 사진` `DropdownMenuItem` above `로그아웃` that opens the dialog
  (local `useState` for `open`, render `<ProfilePhotoDialog>`).

### 4. Avatars in user comboboxes

The only id-based **user picker** today is the `담당자` staff multi-select in
`ServiceAssignmentFields`. Display-only name lookups (payments "paid by", the
inspection-participant name datalist, calendar) are **out of scope**.

- `components/combobox.tsx` — add optional `image?: string | null` to
  `ComboboxOption`; when present render a small `Avatar` (size `sm`) with
  initials fallback in both the trigger (selected) and each option row. No
  behavior change when `image` is absent. (Generic support so future user
  pickers get avatars for free.)
- `services/_components/service-assignment-fields.tsx` — add
  `image?: string | null` to `UserOption`; render a `size="sm"` `Avatar` in each
  `CommandItem` and in the selected `Badge`s, initials fallback from the name.
- Server option sources add `image` to their select and thread it through:
  - `services/page.tsx` (`selectFrom("user").select(["id","name"])` → add `image`)
  - `services/[id]/_detail.tsx` (same)
  These flow into `ServiceAssignmentFields` via `service-form.tsx`’s
  `UserOption[]`, so `UserOption` gaining `image` covers both call sites.

## Data flow

```
file → [dialog] canvas resize 512² webp
     → POST /api/profile/photo  → put(public) → { url }
     → authClient.updateUser({ image: url })   (writes user.image, refreshes session)
     → router.refresh()
                ↓
session.user.image / user.image read on render
     → topbar AvatarImage
     → ServiceAssignmentFields / Combobox AvatarImage (initials fallback)
```

## Error handling

- Route: 401 unauth; 400 on bad MIME/extension/size/missing file (same JSON shape
  as `/api/upload`); blob `del` failures swallowed.
- Dialog: surface route errors inline; never leave the UI in a pending state on
  failure; if `updateUser` fails after a successful upload, show an error (the
  uploaded blob is an acceptable orphan).
- Avatars: missing/broken `image` falls back to initials automatically via
  `AvatarFallback` — no broken-image icons.

## Security / privacy

- Photos are **public** blobs with unguessable UUID paths. Justified: avatars
  render in many places (topbar, every picker row, badges); proxying each through
  an auth route (as documents do) would be heavy, and a profile photo is
  low-sensitivity. Documents remain private — unchanged.
- A user can only write to `avatars/{their own id}/…`; no cross-user writes.

## Out of scope (YAGNI)

- Admin setting/replacing other users' photos.
- A dedicated `/settings/profile` page (dialog only).
- Cropping/zoom UI (center-square auto-crop only).
- Avatars on display-only name references (payments "paid by", calendar,
  inspection participants) and the Settings → Users roster — can be added later
  using the same `user.image` data.

## Testing

- Manual: upload jpeg/png/webp; verify topbar avatar updates live, the 담당자
  picker shows the avatar, replace swaps the image and removes the old blob,
  delete reverts to initials.
- Validation: oversized file and disallowed type are rejected with a clear message.
- Fallback: a user with no photo shows initials everywhere; a broken URL falls
  back to initials.
