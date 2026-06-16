import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@kingsrealty/db";
import { getSession } from "@/lib/session";
import { isStaffOrAdmin } from "@/lib/authz";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isStaffOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const numId = Number(id);
  const db = getDb();

  const lease = await db
    .selectFrom("lease")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .innerJoin("property", "property.id", "lease.property_id")
    .innerJoin("landlord", "landlord.id", "property.landlord_id")
    .select([
      "lease.start_date",
      "lease.end_date",
      "lease.monthly_rent_krw",
      "lease.deposit_krw",
      "tenant.name as tenant_name",
      "tenant.rank as tenant_rank",
      "tenant.unit as tenant_unit",
      "tenant.email as tenant_email",
      "tenant.phone as tenant_phone",
      "property.address as property_address",
      "property.size_pyeong",
      "landlord.name as landlord_name",
      "landlord.phone as landlord_phone",
      "landlord.email as landlord_email",
    ])
    .where("lease.id", "=", numId)
    .executeTakeFirst();

  if (!lease) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Load fillable template & Korean font
  const templatesDir = path.join(process.cwd(), "src", "templates");
  const [templateBytes, fontBytes] = await Promise.all([
    fs.readFile(path.join(templatesDir, "lease-agreement-fillable.pdf")),
    fs.readFile(path.join(templatesDir, "NanumGothic.ttf")),
  ]);

  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const form = pdfDoc.getForm();

  // Fill a named form field — field names must match the fillable PDF
  const fill = (name: string, value: string | null | undefined) => {
    if (!value) return;
    try {
      const field = form.getTextField(name);
      field.setText(value);
      field.updateAppearances(font);
    } catch {
      // Field not found in template — skip silently
    }
  };

  // Parse dates
  const startDate = new Date(lease.start_date);
  const endDate = new Date(lease.end_date);
  const termMonths =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

  const fmtKRW = (v: string | number) => Number(v).toLocaleString("ko-KR");

  // Fill all fields
  fill("lessee_name", lease.tenant_name);
  fill("lessor_name", lease.landlord_name);
  fill("rank_grade", lease.tenant_rank);
  fill("organization_unit", lease.tenant_unit);
  fill("lessor_phone", lease.landlord_phone);
  fill("lessee_email", lease.tenant_email);
  fill("lessee_phone", lease.tenant_phone);
  fill("lessor_email", lease.landlord_email);
  fill("rental_address", lease.property_address);
  fill("date_of_lease", fmtDate(startDate));
  fill("sqft_pyeong", lease.size_pyeong ? `${lease.size_pyeong}평` : null);

  fill("lease_term_months", String(termMonths));
  fill("beginning_date", fmtDate(startDate));
  fill("expiring_date", fmtDate(endDate));

  fill("start_year", String(startDate.getFullYear()));
  fill("start_month", String(startDate.getMonth() + 1));
  fill("start_day", String(startDate.getDate()));
  fill("end_year", String(endDate.getFullYear()));
  fill("end_month", String(endDate.getMonth() + 1));
  fill("end_day", String(endDate.getDate()));
  fill("term_months_kr", String(termMonths));

  fill("monthly_rent", fmtKRW(lease.monthly_rent_krw));
  fill("number_of_months", String(termMonths));
  fill("security_deposit", fmtKRW(lease.deposit_krw));

  // Flatten so fields become static text (not editable)
  form.flatten();

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="lease-${numId}.pdf"`,
    },
  });
}
