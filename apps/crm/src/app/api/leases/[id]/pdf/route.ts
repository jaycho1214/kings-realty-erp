import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@kingsrealty/db";
import { getSession } from "@/lib/session";
import { isStaffOrAdmin } from "@/lib/authz";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

  // The official HQ IMHM 1057EK-R fillable template is not bundled with the app,
  // so the document is generated directly with pdf-lib. NanumGothic carries both
  // Korean and Latin glyphs, so it is used for the whole document.
  const fontBytes = await fs.readFile(
    path.join(process.cwd(), "src", "templates", "NanumGothic.ttf"),
  );

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  // --- date / number helpers ---
  const startDate = new Date(lease.start_date);
  const endDate = new Date(lease.end_date);
  const termMonths =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const fmtKRW = (v: string | number) =>
    `₩${Number(v).toLocaleString("ko-KR")}`;
  const dash = (v: string | number | null | undefined) =>
    v === null || v === undefined || v === "" ? "-" : String(v);

  // --- layout primitives ---
  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 56;
  const INK = rgb(0.13, 0.14, 0.18);
  const MUTED = rgb(0.42, 0.45, 0.52);
  const LINE = rgb(0.82, 0.84, 0.88);

  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const text = (
    value: string,
    x: number,
    size: number,
    color = INK,
    f: PDFFont = font,
  ) => {
    page.drawText(value, { x, y, size, font: f, color });
  };

  const hr = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 1,
      color: LINE,
    });
  };

  // --- title ---
  text("임대차 계약 요약서", MARGIN, 20);
  y -= 22;
  text("Lease Agreement Summary", MARGIN, 11, MUTED);
  y -= 14;
  text("HQ IMHM Form 1057EK-R · USAG Humphreys", MARGIN, 9, MUTED);
  y -= 18;
  hr();
  y -= 28;

  const sectionTitle = (title: string) => {
    ensureSpace(40);
    text(title, MARGIN, 13);
    y -= 8;
    hr();
    y -= 18;
  };

  const row = (label: string, value: string) => {
    ensureSpace(22);
    const labelX = MARGIN;
    const valueX = MARGIN + 150;
    text(label, labelX, 10, MUTED);
    // wrap long values to the available width
    const maxW = PAGE_W - MARGIN - valueX;
    const words = value.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, 10.5) > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    if (lines.length === 0) lines.push("-");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        y -= 15;
        ensureSpace(15);
      }
      page.drawText(lines[i], {
        x: valueX,
        y,
        size: 10.5,
        font,
        color: INK,
      });
    }
    y -= 22;
  };

  // --- 임차인 (Lessee) ---
  sectionTitle("임차인 (Lessee)");
  row("성명 / Name", dash(lease.tenant_name));
  row("계급 / Rank", dash(lease.tenant_rank));
  row("부대 / Unit", dash(lease.tenant_unit));
  row("연락처 / Phone", dash(lease.tenant_phone));
  row("이메일 / Email", dash(lease.tenant_email));
  y -= 6;

  // --- 임대인 (Lessor) ---
  sectionTitle("임대인 (Lessor)");
  row("성명 / Name", dash(lease.landlord_name));
  row("연락처 / Phone", dash(lease.landlord_phone));
  row("이메일 / Email", dash(lease.landlord_email));
  y -= 6;

  // --- 임대 목적물 (Property) ---
  sectionTitle("임대 목적물 (Property)");
  row("주소 / Address", dash(lease.property_address));
  row("전용면적 / Size", lease.size_pyeong ? `${lease.size_pyeong}평` : "-");
  y -= 6;

  // --- 계약 조건 (Terms) ---
  sectionTitle("계약 조건 (Terms)");
  row("시작일 / Begin", fmtDate(startDate));
  row("종료일 / Expire", fmtDate(endDate));
  row("계약 기간 / Term", `${termMonths}개월`);
  row("월 임대료 / Monthly Rent", fmtKRW(lease.monthly_rent_krw));
  row("보증금 / Deposit", fmtKRW(lease.deposit_krw));
  y -= 18;

  // --- signatures ---
  ensureSpace(80);
  hr();
  y -= 28;
  const colW = (PAGE_W - MARGIN * 2 - 24) / 2;
  const sigLineY = y;
  page.drawLine({
    start: { x: MARGIN, y: sigLineY },
    end: { x: MARGIN + colW, y: sigLineY },
    thickness: 1,
    color: LINE,
  });
  page.drawLine({
    start: { x: MARGIN + colW + 24, y: sigLineY },
    end: { x: PAGE_W - MARGIN, y: sigLineY },
    thickness: 1,
    color: LINE,
  });
  y -= 14;
  text("임차인 서명 / Lessee", MARGIN, 9, MUTED);
  page.drawText("임대인 서명 / Lessor", {
    x: MARGIN + colW + 24,
    y,
    size: 9,
    font,
    color: MUTED,
  });

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="lease-${numId}.pdf"`,
    },
  });
}
