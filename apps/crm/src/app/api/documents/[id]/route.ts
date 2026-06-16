import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getDb } from "@kingsrealty/db";
import { requireUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * Authenticated read proxy for uploaded documents.
 *
 * Uploads are stored as PRIVATE blobs (see /api/upload), so they can't be
 * served from their raw URL. This route streams a document's bytes to approved
 * users only (gated by requireUser) — the stored blob URL is never exposed to
 * the client. Legacy documents uploaded as public blobs are still served too
 * (access is detected from the blob host), so older records keep working.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const doc = await getDb()
    .selectFrom("document")
    .select(["file_url", "file_name", "file_type"])
    .where("id", "=", docId)
    .executeTakeFirst();
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // New uploads are private; legacy ones live on the public blob host.
  const isPublic = doc.file_url.includes(".public.blob.vercel-storage.com");
  let result = await get(doc.file_url, {
    access: isPublic ? "public" : "private",
  }).catch(() => null);
  // Fall back to the other access mode in case the host heuristic is wrong.
  if (!result) {
    result = await get(doc.file_url, {
      access: isPublic ? "private" : "public",
    }).catch(() => null);
  }
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename = encodeURIComponent(doc.file_name);
  return new Response(result.stream, {
    headers: {
      "Content-Type": doc.file_type || "application/octet-stream",
      // inline so images/PDFs preview; browser downloads otherwise.
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
