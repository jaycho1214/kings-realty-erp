# Profile Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user upload/replace/remove their own profile photo and render it as an avatar in the topbar and the `담당자` (staff assignee) picker, falling back to initials.

**Architecture:** A new `POST/DELETE /api/profile/photo` route stores the image as a **public** Vercel Blob and returns its URL; the client persists the URL onto the existing `user.image` column via better-auth `authClient.updateUser`, which refreshes the session. A dialog launched from the topbar avatar dropdown handles file picking + client-side square downscale. `AvatarImage` (already in the design system) renders the photo wherever a user appears, with `AvatarFallback` initials when absent.

**Tech Stack:** Next.js 16 App Router, React 19, better-auth (`authClient.updateUser`), `@vercel/blob` (`put`/`del`), Kysely, base-ui Avatar/Dialog/DropdownMenu, Tailwind.

## Global Constraints

- **No test framework exists in this repo.** Verification per task = TypeScript typecheck/lint via `pnpm --filter @kingsrealty/crm lint` and a production typecheck via `pnpm --filter @kingsrealty/crm build`, plus the explicit manual checks each task lists. Do **not** add a test runner.
- Self-service only: a user edits **their own** photo. The blob path is keyed to `session.user.id`; never accept a target user id from the client.
- Photos are **public** blobs (avatars render in many places); documents stay private — do not touch `/api/upload` or `/api/documents/[id]`.
- Allowed image types: `image/jpeg`, `image/png`, `image/webp` (extensions `.jpg`/`.jpeg`/`.png`/`.webp`). Server size cap: **5MB**.
- UI copy is Korean, matching existing components.
- Run all commands from the repo root `/Users/jay/Codes/kingsrealty`.

---

### Task 1: Profile photo upload route

**Files:**
- Create: `apps/crm/src/app/api/profile/photo/route.ts`

**Interfaces:**
- Produces:
  - `POST /api/profile/photo` — `multipart/form-data` with field `file`; returns `200 { url: string }` on success, `401 { error }` if unauthenticated, `400 { error }` on missing/invalid/oversized file.
  - `DELETE /api/profile/photo` — best-effort delete of the caller's current avatar blob; returns `200 { ok: true }` (or `401`).

- [ ] **Step 1: Write the route**

Create `apps/crm/src/app/api/profile/photo/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import path from "path";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Only ever delete avatar blobs we created (Vercel Blob host + /avatars/ path),
// so a malformed or external image URL is never passed to del().
function isOwnAvatarBlob(url: string | null | undefined): url is string {
  return Boolean(
    url &&
      url.includes(".blob.vercel-storage.com") &&
      url.includes("/avatars/"),
  );
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: `File type "${file.type}" is not allowed. Accepted types: JPEG, PNG, WebP.`,
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File size exceeds the 5MB limit." },
      { status: 400 },
    );
  }
  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      {
        error: `File extension "${extension}" is not allowed. Accepted types: JPEG, PNG, WebP.`,
      },
      { status: 400 },
    );
  }

  const userId = String(session.user.id);
  const safeFilename = `${randomUUID()}${extension}`;
  const blob = await put(`avatars/${userId}/${safeFilename}`, file, {
    access: "public",
  });

  // Best-effort: drop the previous avatar so blobs don't accumulate. A failure
  // here (or an orphaned blob) must never fail the upload.
  const previous = session.user.image;
  if (isOwnAvatarBlob(previous)) {
    await del(previous).catch(() => {});
  }

  return NextResponse.json({ url: blob.url });
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const current = session.user.image;
  if (isOwnAvatarBlob(current)) {
    await del(current).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @kingsrealty/crm lint`
Expected: no errors for `app/api/profile/photo/route.ts`. (`session.user.image` is typed by better-auth; if the role/image fields are not on the inferred session type, read it as `(session.user as { image?: string | null }).image` — but verify first, the admin plugin usually includes `image`.)

- [ ] **Step 3: Manual smoke (deferred)**

The route is exercised end-to-end in Task 3's manual check (needs the dialog). For now confirm the file compiles in the build step at the end of Task 4. No standalone run needed.

- [ ] **Step 4: Commit**

```bash
git add apps/crm/src/app/api/profile/photo/route.ts
git commit -m "feat(profile): add /api/profile/photo upload + delete route"
```

---

### Task 2: Profile photo dialog component

**Files:**
- Create: `apps/crm/src/components/layout/profile-photo-dialog.tsx`

**Interfaces:**
- Consumes: `POST/DELETE /api/profile/photo` (Task 1); `authClient.updateUser` from `@/lib/auth-client`.
- Produces: `ProfilePhotoDialog` React component:
  ```ts
  function ProfilePhotoDialog(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentImage: string | null;
    name: string;
  }): JSX.Element
  ```

- [ ] **Step 1: Write the component**

Create `apps/crm/src/components/layout/profile-photo-dialog.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const MAX_DIM = 512;

// Center-crop to a square, downscale to <=512px, re-encode as webp. Keeps the
// stored blob tiny and consistent regardless of the source image.
async function resizeToSquareWebp(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const dim = Math.min(side, MAX_DIM);
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, dim, dim);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/webp",
      0.9,
    ),
  );
  return new File([blob], "avatar.webp", { type: "image/webp" });
}

export function ProfilePhotoDialog({
  open,
  onOpenChange,
  currentImage,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentImage: string | null;
  name: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = name.slice(0, 2);
  const shownImage = preview ?? currentImage;

  const close = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPendingFile(null);
    setError(null);
    setBusy(false);
    onOpenChange(false);
  };

  const handlePick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const resized = await resizeToSquareWebp(file);
      setPendingFile(resized);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(resized);
      });
    } catch {
      setError("이미지를 처리할 수 없습니다.");
    }
  };

  const handleSave = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const res = await fetch("/api/profile/photo", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "업로드에 실패했습니다.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      const { error: updateError } = await authClient.updateUser({ image: url });
      if (updateError) {
        setError("프로필 사진 저장에 실패했습니다.");
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("업로드 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await authClient.updateUser({
        image: null,
      });
      if (updateError) {
        setError("삭제에 실패했습니다.");
        return;
      }
      await fetch("/api/profile/photo", { method: "DELETE" }).catch(() => {});
      close();
      router.refresh();
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>프로필 사진</DialogTitle>
          <DialogDescription>
            JPG, PNG, WebP · 정사각형으로 자동 변환됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <Avatar className="size-24">
            {shownImage && <AvatarImage src={shownImage} alt="" />}
            <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-700 text-xl font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handlePick(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            사진 선택
          </Button>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          {currentImage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={handleRemove}
              disabled={busy}
            >
              사진 삭제
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={close}
              disabled={busy}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={busy || !pendingFile}
            >
              {busy ? "저장 중..." : "저장"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @kingsrealty/crm lint`
Expected: no errors. If `authClient.updateUser({ image: null })` is a type error (better-auth typing `image` as `string`), change that one call to `authClient.updateUser({ image: null as unknown as string })` and leave a `// better-auth accepts null to clear the image` comment. Verify the null path actually clears `user.image` during Task 3's manual check.

- [ ] **Step 3: Commit**

```bash
git add apps/crm/src/components/layout/profile-photo-dialog.tsx
git commit -m "feat(profile): add profile photo dialog with client-side square resize"
```

---

### Task 3: Wire the dialog + photo avatar into the topbar

**Files:**
- Modify: `apps/crm/src/components/layout/topbar.tsx`

**Interfaces:**
- Consumes: `ProfilePhotoDialog` (Task 2); `session.user.image` from `useSession`.

- [ ] **Step 1: Update imports**

In `apps/crm/src/components/layout/topbar.tsx`:

Change the React/icon imports and avatar import. Replace this line:

```tsx
import { Menu, Bell, ChevronDown, LogOut } from "lucide-react";
```
with:
```tsx
import { useState } from "react";
import { Menu, Bell, ChevronDown, LogOut, Camera } from "lucide-react";
```

Replace this line:
```tsx
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
```
with:
```tsx
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProfilePhotoDialog } from "@/components/layout/profile-photo-dialog";
```

- [ ] **Step 2: Add state + image var**

Just after `const { data: session } = useSession();` add:

```tsx
const [photoOpen, setPhotoOpen] = useState(false);
```

And after `const initials = name.slice(0, 2);` add:

```tsx
const image = session?.user?.image ?? null;
```

- [ ] **Step 3: Render the photo in both avatars**

Replace the trigger avatar block:

```tsx
<Avatar className="size-6">
  <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-700 text-[10px] font-semibold text-white">
    {initials}
  </AvatarFallback>
</Avatar>
```
with:
```tsx
<Avatar className="size-6">
  {image && <AvatarImage src={image} alt="" />}
  <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-700 text-[10px] font-semibold text-white">
    {initials}
  </AvatarFallback>
</Avatar>
```

Replace the dropdown-content avatar block:

```tsx
<Avatar className="size-8">
  <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-700 text-xs font-semibold text-white">
    {initials}
  </AvatarFallback>
</Avatar>
```
with:
```tsx
<Avatar className="size-8">
  {image && <AvatarImage src={image} alt="" />}
  <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-700 text-xs font-semibold text-white">
    {initials}
  </AvatarFallback>
</Avatar>
```

- [ ] **Step 4: Add the menu item + render the dialog**

In the `DropdownMenuContent`, the tail currently reads:

```tsx
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
```
Replace it with:
```tsx
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPhotoOpen(true)}>
              <Camera />
              프로필 사진
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
```

Then render the dialog as a sibling of the `DropdownMenu`. The dropdown lives inside `<div className="ml-auto flex items-center gap-2">…</div>`. Immediately before that div's closing `</div>` (after `</DropdownMenu>`), add:

```tsx
        <ProfilePhotoDialog
          open={photoOpen}
          onOpenChange={setPhotoOpen}
          currentImage={image}
          name={name}
        />
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @kingsrealty/crm lint`
Expected: no errors in `topbar.tsx`.

- [ ] **Step 6: Manual end-to-end check**

Run the app: `pnpm --filter @kingsrealty/crm dev` (port 5007). Sign in, then:
1. Open the avatar dropdown → click **프로필 사진** → dialog opens showing initials.
2. Pick a JPG/PNG → square preview appears → click **저장**. Dialog closes; the topbar avatar shows the photo within a moment (session refresh).
3. Reopen → **사진 삭제** → avatar reverts to initials.
4. Pick a non-image file via OS dialog (or temporarily remove the `accept` filter) → server returns a 400 and the dialog shows the Korean error.

Expected: all four behave as described; no broken-image icon at any point.

- [ ] **Step 7: Commit**

```bash
git add apps/crm/src/components/layout/topbar.tsx
git commit -m "feat(profile): show photo avatar in topbar + launch photo dialog"
```

---

### Task 4: Avatars in the 담당자 (staff assignee) picker

**Files:**
- Modify: `apps/crm/src/app/(dashboard)/services/_components/service-assignment-fields.tsx`
- Modify: `apps/crm/src/app/(dashboard)/services/page.tsx:169` (user options query)
- Modify: `apps/crm/src/app/(dashboard)/services/[id]/_detail.tsx:139` (user options query)

**Interfaces:**
- Consumes: the `Avatar`/`AvatarImage`/`AvatarFallback` design-system components.
- Produces: `UserOption` gains an optional `image` field:
  ```ts
  export interface UserOption { id: number; name: string; image?: string | null }
  ```
  Both server queries now `select(["id", "name", "image"])`, which structurally matches `UserOption`. `service-form.tsx` passes `users` straight through, so no change there.

- [ ] **Step 1: Extend `UserOption` and import Avatar**

In `service-assignment-fields.tsx`, add the avatar import next to the existing UI imports (e.g. below the `Badge` import):

```tsx
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
```

Change the interface:

```tsx
export interface UserOption {
  id: number;
  name: string;
}
```
to:
```tsx
export interface UserOption {
  id: number;
  name: string;
  image?: string | null;
}
```

- [ ] **Step 2: Render avatars in selected badges**

Replace the selected-users badge block:

```tsx
                {selectedUsers.map((u) => (
                  <Badge key={u.id} variant="outline" className="gap-0.5 pr-1">
                    {u.name}
                    <button
                      type="button"
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUser(u.id);
                      }}
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
```
with:
```tsx
                {selectedUsers.map((u) => (
                  <Badge
                    key={u.id}
                    variant="outline"
                    className="gap-1 py-0.5 pr-1 pl-1"
                  >
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
                        toggleUser(u.id);
                      }}
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
```

- [ ] **Step 3: Render avatars in the command list rows**

Replace the `CommandItem` block:

```tsx
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={`${u.name} ${u.id}`}
                      onSelect={() => toggleUser(u.id)}
                    >
                      <Check
                        className={cn(
                          "mr-1.5 size-3.5",
                          selectedIds.includes(u.id)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {u.name}
                    </CommandItem>
                  ))}
```
with:
```tsx
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={`${u.name} ${u.id}`}
                      onSelect={() => toggleUser(u.id)}
                    >
                      <Check
                        className={cn(
                          "mr-1.5 size-3.5",
                          selectedIds.includes(u.id)
                            ? "opacity-100"
                            : "opacity-0",
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
```

- [ ] **Step 4: Add `image` to the two server queries**

In `apps/crm/src/app/(dashboard)/services/page.tsx`, change the user query (~line 169):

```tsx
    db
      .selectFrom("user")
      .select(["id", "name"])
      .orderBy("name", "asc")
      .execute(),
```
to:
```tsx
    db
      .selectFrom("user")
      .select(["id", "name", "image"])
      .orderBy("name", "asc")
      .execute(),
```

In `apps/crm/src/app/(dashboard)/services/[id]/_detail.tsx`, change the equivalent user query (~line 139) the same way:

```tsx
      db
        .selectFrom("user")
        .select(["id", "name"])
        .orderBy("name", "asc")
        .execute(),
```
to:
```tsx
      db
        .selectFrom("user")
        .select(["id", "name", "image"])
        .orderBy("name", "asc")
        .execute(),
```

(Leave the `service_request_assignee` join query in `_detail.tsx` untouched — it feeds `defaultAssigneeIds`, not the option list.)

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @kingsrealty/crm lint`
Expected: no errors. The query result `{ id, name, image }` satisfies `UserOption`.

- [ ] **Step 6: Full production typecheck/build**

Run: `pnpm --filter @kingsrealty/crm build`
Expected: build succeeds (this is the authoritative typecheck across all four tasks).

- [ ] **Step 7: Manual check**

With `pnpm --filter @kingsrealty/crm dev` running and at least one user having a photo (set via Task 3):
1. Go to the 서비스(services) list → open the new-service form → open the **담당자** picker. Each row shows an avatar (photo or initials).
2. Select a user → the selected badge shows the small avatar + name.
3. Open a service detail page and confirm the same picker there shows avatars.

Expected: avatars render in both rows and badges; users without a photo show initials.

- [ ] **Step 8: Commit**

```bash
git add "apps/crm/src/app/(dashboard)/services/_components/service-assignment-fields.tsx" \
        "apps/crm/src/app/(dashboard)/services/page.tsx" \
        "apps/crm/src/app/(dashboard)/services/[id]/_detail.tsx"
git commit -m "feat(services): show user avatars in the 담당자 assignee picker"
```

---

## Notes / deviations from the spec

- **Generic `Combobox` avatar support was dropped (YAGNI).** The spec proposed adding an optional `image` to `ComboboxOption` "so future user pickers get avatars for free," but an audit shows the generic `Combobox` is only ever used for property/tenant/lease pickers — never users. The single id-based **user** picker is `ServiceAssignmentFields`, fully covered by Task 4. If a user picker is ever built on the generic `Combobox`, add the `image` field then.
- Display-only user name lookups (payments "paid by", calendar, inspection-participant datalist, Settings → Users roster) remain out of scope per the spec.

## Self-review

- **Spec coverage:** Upload route → Task 1. Public blob + own-id path + old-blob cleanup → Task 1. Dialog with client-side 512² webp crop, save, remove → Task 2. Topbar `AvatarImage` + dropdown entry point → Task 3. `담당자` picker avatars + `image` threaded through both option queries + `UserOption.image` → Task 4. The one spec item not built (generic `Combobox` image support) is explicitly called out above as a deliberate YAGNI drop with rationale.
- **Placeholder scan:** none — every code step shows complete code; verification steps use real commands.
- **Type consistency:** `UserOption { id; name; image? }` defined in Task 4 Step 1 and consumed by the same file; both queries select `["id","name","image"]` to match. `ProfilePhotoDialog` prop shape is identical in Task 2 (definition) and Task 3 (call site). `isOwnAvatarBlob` is defined and used only within Task 1's route.
