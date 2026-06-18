import { notFound } from "next/navigation";
import { getDb } from "@kingsrealty/db";
import { requireUser } from "@/lib/authz";
import { parseSnapshot } from "@/lib/inspection/parse";
import { InspectionEditor } from "./_editor";

export default async function InspectionEditorPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  await requireUser();
  const { inspectionId } = await params;
  const inspId = Number(inspectionId);
  const db = getDb();

  const insp = await db
    .selectFrom("inspection")
    .innerJoin("property", "property.id", "inspection.property_id")
    .innerJoin("lease", "lease.id", "inspection.lease_id")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .select([
      "inspection.id as id",
      "inspection.type as type",
      "inspection.status as status",
      "inspection.inspected_at as inspected_at",
      "inspection.checklist as checklist",
      "inspection.signature as signature",
      "inspection.summary as summary",
      "inspection.property_id as property_id",
      "lease.tenant_id as tenant_id",
      "tenant.name as tenant_name",
      "property.address as address",
      "property.address_detail as address_detail",
    ])
    .where("inspection.id", "=", inspId)
    .executeTakeFirst();
  if (!insp) notFound();

  // All inspection documents (item-linked + general gallery).
  const docs = await db
    .selectFrom("document")
    .select(["id"])
    .where("entity_type", "=", "inspection")
    .where("entity_id", "=", inspId)
    .execute();

  const snapshot = parseSnapshot(insp.checklist);
  const linkedIds = new Set(
    snapshot.sections
      .flatMap((s) => s.items)
      .flatMap((it) => it.photos.map((p) => p.id)),
  );
  const galleryPhotos = docs
    .filter((d) => !linkedIds.has(d.id))
    .map((d) => ({ id: d.id, url: `/api/documents/${d.id}` }));

  const signature: {
    tenant?: { name?: string } | null;
    inspector?: { name?: string } | null;
  } = (() => {
    try {
      return insp.signature ? JSON.parse(insp.signature) : {};
    } catch {
      return {};
    }
  })();

  return (
    <InspectionEditor
      tenantId={insp.tenant_id}
      inspectionId={inspId}
      type={insp.type}
      status={insp.status}
      inspectedAt={
        insp.inspected_at instanceof Date
          ? insp.inspected_at.toISOString()
          : String(insp.inspected_at)
      }
      tenantName={insp.tenant_name}
      propertyLabel={`${insp.address}${insp.address_detail ? " " + insp.address_detail : ""}`}
      initialSnapshot={snapshot}
      initialGallery={galleryPhotos}
      initialSignature={{
        tenant: signature?.tenant?.name ?? "",
        inspector: signature?.inspector?.name ?? "",
      }}
      initialSummary={insp.summary ?? ""}
    />
  );
}
