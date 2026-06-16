import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { headers } from "next/headers";
import { getDb } from "@kingsrealty/db";
import { auth } from "@/lib/auth";
import { isStaffOrAdmin } from "@/lib/authz";
import { randomUUID } from "crypto";
import path from "path";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
]);

const ALLOWED_ENTITY_TYPES = new Set([
  "tenant",
  "property",
  "lease",
  "service_request",
  "service_request_status_log",
  "payment",
]);

const INTEGER_REGEX = /^\d+$/;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const entityType = formData.get("entity_type") as string;
  const entityId = formData.get("entity_id") as string;

  if (!file || !entityType || !entityId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Validate file type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: `File type "${file.type}" is not allowed. Accepted types: PDF, JPEG, PNG, WebP, DOC, DOCX.`,
      },
      { status: 400 },
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File size exceeds the 10MB limit." },
      { status: 400 },
    );
  }

  // Validate entityType
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json(
      { error: `Invalid entity type "${entityType}".` },
      { status: 400 },
    );
  }

  // Validate entityId is a positive integer
  if (!INTEGER_REGEX.test(entityId)) {
    return NextResponse.json(
      { error: "Invalid entity ID format." },
      { status: 400 },
    );
  }

  // Generate a safe filename using a random UUID, preserving only the extension.
  // Validate the extension against an allowlist consistent with the MIME set so
  // the stored object's extension cannot be set to an arbitrary value.
  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      {
        error: `File extension "${extension}" is not allowed. Accepted types: PDF, JPEG, PNG, WebP, DOC, DOCX.`,
      },
      { status: 400 },
    );
  }
  const safeFilename = `${randomUUID()}${extension}`;

  const blob = await put(
    `documents/${entityType}/${entityId}/${safeFilename}`,
    file,
    { access: "private" },
  );

  const title = (formData.get("title") as string) || null;
  const comments = (formData.get("comments") as string) || null;

  const db = getDb();
  await db
    .insertInto("document")
    .values({
      entity_type: entityType,
      entity_id: Number(entityId),
      file_name: file.name,
      file_url: blob.url,
      file_type: file.type,
      uploaded_by: Number(session.user.id),
      title,
      comments,
    })
    .execute();

  return NextResponse.json({ url: blob.url });
}
