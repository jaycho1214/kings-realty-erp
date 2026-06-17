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
