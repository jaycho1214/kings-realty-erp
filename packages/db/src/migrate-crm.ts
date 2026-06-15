import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { randomUUID } from "crypto";
import XLSX from "xlsx";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import type { DB } from "./types";

// ── Types ──────────────────────────────────────────────────────────────
interface DataRow {
  name: string;
  group: string;
  phone: string;
  address: string;
  memo: string;
  rank: string;
}

interface SalesRow {
  date: string;
  customer: string;
  seller: string;
  type: string;
  qty: number;
  amount: number;
  total: number;
  bank: number;
  owner_birth: string;
  owner_phone: string;
  contract_start: string;
  contract_end: string;
  family_phone: string;
  extra_amount: string;
  utility_bill: string;
  discount: string;
}

// ── Helpers ────────────────────────────────────────────────────────────
function clean(val: unknown): string {
  return String(val ?? "").trim();
}

function normalizePhone(phone: string): string {
  const p = clean(phone);
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("010")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return p;
}

/** Extract a Korean mobile phone number from text that may contain names */
function extractKoreanPhone(text: string): string {
  const m = text.match(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/);
  if (m) return normalizePhone(m[0]);
  const digits = text.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("010")) {
    return normalizePhone(digits);
  }
  return "";
}

function normalizeName(name: string): string {
  return clean(name).toLowerCase().replace(/\s+/g, " ");
}

function formatBirthDigits(digits: string): string {
  const yy = parseInt(digits.slice(0, 2));
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
  return `${year}-${mm}-${dd}`;
}

function parseOwnerName(ownerBirth: string): {
  name: string;
  birth: string | null;
} {
  const raw = clean(ownerBirth);
  if (!raw) return { name: "", birth: null };

  const birthMatch = raw.match(/(\d{6})(-\d)?/);
  if (birthMatch) {
    const birthStr = birthMatch[1];
    let name = raw.replace(/,?\s*\d{6}(-\d)?\s*/g, "").trim();
    if (!name) {
      name = raw.replace(/\d{6}(-\d)?\s*/, "").trim();
    }
    return { name: name || raw, birth: formatBirthDigits(birthStr) };
  }

  return { name: raw, birth: null };
}

// Common Korean single-char surnames for detecting concatenated names
const KOREAN_SURNAMES = new Set([
  "김",
  "이",
  "박",
  "최",
  "정",
  "강",
  "조",
  "윤",
  "장",
  "임",
  "한",
  "오",
  "서",
  "신",
  "권",
  "황",
  "안",
  "송",
  "전",
  "홍",
  "유",
  "고",
  "문",
  "양",
  "손",
  "배",
  "백",
  "허",
  "남",
  "심",
  "노",
  "하",
  "곽",
  "성",
  "차",
  "주",
  "우",
  "민",
  "류",
  "천",
  "방",
  "공",
  "현",
  "함",
  "변",
  "염",
  "석",
  "선",
  "설",
  "마",
  "길",
  "원",
  "진",
  "지",
  "표",
  "명",
  "기",
  "반",
  "도",
  "탁",
  "소",
  "피",
  "라",
]);

interface ParsedLandlordPerson {
  name: string;
  birth: string | null;
  role: string | null;
}

/** Parse owner_birth field into primary landlord + family members */
function parseLandlordPeople(
  ownerBirth: string,
  ownerPhone: string,
): ParsedLandlordPerson[] {
  let raw = clean(ownerBirth);
  if (!raw) return [];

  // Pattern: "이재범 이재진(관리)손동하(진와이프)" — names with role annotations
  const rolePattern = /([가-힣]+)\(([^)]+)\)/g;
  const roleMatches: { name: string; role: string }[] = [];
  let roleMatch: RegExpExecArray | null;
  while ((roleMatch = rolePattern.exec(raw)) !== null) {
    const role = roleMatch[2];
    roleMatches.push({
      name: roleMatch[1],
      role: /와이프|wife|배우자|부인/i.test(role) ? "배우자(Spouse)" : role,
    });
  }
  if (roleMatches.length > 0) {
    // Get the leading name (before first parenthetical)
    const leadName = raw.match(/^([가-힣]+)\s/);
    const people: ParsedLandlordPerson[] = [];
    if (leadName && !roleMatches.some((r) => r.name === leadName[1])) {
      people.push({ name: leadName[1], birth: null, role: null });
    }
    for (const rm of roleMatches) {
      people.push({ name: rm.name, birth: null, role: rm.role });
    }
    return people.length > 0 ? people : [];
  }

  // Pattern: Two names interleaved with births: "최승식660813오정선660827", "남궁선600421유성희660124"
  const interleavedMatch = raw.match(
    /^([가-힣]+)(\d{6})(?:-\d)?([가-힣]+)(\d{6})(?:-\d)?$/,
  );
  if (interleavedMatch) {
    return [
      {
        name: interleavedMatch[1],
        birth: formatBirthDigits(interleavedMatch[2]),
        role: null,
      },
      {
        name: interleavedMatch[3],
        birth: formatBirthDigits(interleavedMatch[4]),
        role: null,
      },
    ];
  }

  // Pattern: Two names then two births: "안병문 진정임 590515-1 610819-2"
  const namesThenBirths = raw.match(
    /^([가-힣]+)\s+([가-힣]+)\s+(\d{6})(?:-\d)?\s+(\d{6})(?:-\d)?$/,
  );
  if (namesThenBirths) {
    return [
      {
        name: namesThenBirths[1],
        birth: formatBirthDigits(namesThenBirths[3]),
        role: null,
      },
      {
        name: namesThenBirths[2],
        birth: formatBirthDigits(namesThenBirths[4]),
        role: null,
      },
    ];
  }

  // Pattern: One name two births: "함종규 770910  800610" → first person + unknown spouse
  const oneName2Births = raw.match(
    /^([가-힣]+)\s+(\d{6})(?:-\d)?\s+(\d{6})(?:-\d)?$/,
  );
  if (oneName2Births) {
    return [
      {
        name: oneName2Births[1],
        birth: formatBirthDigits(oneName2Births[2]),
        role: null,
      },
      // Second birth has no name — extract from phone field if available
      ...extractNameFromPhone(ownerPhone).map((n) => ({
        name: n,
        birth: formatBirthDigits(oneName2Births[3]),
        role: "가족" as string | null,
      })),
    ];
  }

  // Pattern: "코발추크빅토리아(이영수)" — name with person in parens
  // But NOT company names like "드로잉컴퍼니(이준희)" — parens person is the representative
  const parenWithPerson = raw.match(
    /^([가-힣A-Za-z]+)\(([가-힣]+)\)(?:\d{6})?(?:-\d)?$/,
  );
  if (parenWithPerson) {
    const mainName = parenWithPerson[1];
    const parenName = parenWithPerson[2];
    const birth1 = raw.match(/(\d{6})/);
    // If main name is a company, keep as single entry with representative as note
    if (/컴퍼니|주식회사|회사|홈$/.test(mainName)) {
      return [
        {
          name: `${mainName}(${parenName})`,
          birth: birth1 ? formatBirthDigits(birth1[1]) : null,
          role: null,
        },
      ];
    }
    return [
      {
        name: mainName,
        birth: birth1 ? formatBirthDigits(birth1[1]) : null,
        role: null,
      },
      { name: parenName, birth: null, role: "가족" },
    ];
  }

  // Strip all birth dates and collect them
  const births: string[] = [];
  let stripped = raw
    .replace(/,?\s*(\d{6})(?:-\d)?\s*/g, (_, b) => {
      births.push(formatBirthDigits(b));
      return " ";
    })
    .trim();

  // Clean up trailing dashes, phone digits embedded in name
  stripped = stripped
    .replace(/[\-]+$/, "")
    .replace(/\d{10,}/, "")
    .trim();

  if (!stripped) {
    // Name was only a birth date — try to extract from phone field
    const phoneNames = extractNameFromPhone(ownerPhone);
    if (phoneNames.length > 0) {
      return [{ name: phoneNames[0], birth: births[0] || null, role: null }];
    }
    return [{ name: raw, birth: births[0] || null, role: null }];
  }

  // Company names — don't split: "(주)", "주식회사", "컴퍼니"
  if (/주식회사|컴퍼니|\(주\)|^주\s/.test(stripped)) {
    return [{ name: stripped, birth: births[0] || null, role: null }];
  }

  // Check if the name contains any Latin characters → western name, don't split
  if (/[a-zA-Z]/.test(stripped)) {
    return [{ name: stripped, birth: births[0] || null, role: null }];
  }

  // From here, Korean-only names — split by comma or space
  const parts = stripped
    .split(/[,\s]+/)
    .filter((p) => p.length > 0 && /[가-힣]/.test(p));

  // If we got exactly one part and it's long Korean-only, try splitting concatenated names
  if (
    parts.length === 1 &&
    /^[가-힣]+$/.test(parts[0]) &&
    parts[0].length >= 5
  ) {
    const split = trySplitKoreanNames(parts[0]);
    if (split) {
      return split.map((name, i) => ({
        name,
        birth: births[i] || null,
        role: i === 0 ? null : "가족",
      }));
    }
  }

  // Build results
  if (parts.length <= 1) {
    return [
      { name: parts[0] || stripped, birth: births[0] || null, role: null },
    ];
  }

  // Multiple Korean parts → first is primary, rest are family
  return parts.map((name, i) => ({
    name,
    birth: births[i] || null,
    role: i === 0 ? null : "가족",
  }));
}

/** Try to split concatenated Korean names like "이은섭박영미" */
function trySplitKoreanNames(text: string): string[] | null {
  // Try split at position 3 (most common: 1-char surname + 2-char given)
  if (text.length >= 5 && text.length <= 7) {
    const second = text[3];
    if (KOREAN_SURNAMES.has(second)) {
      return [text.slice(0, 3), text.slice(3)];
    }
    // Try split at position 2 (2-char given name or 2-char surname)
    const second2 = text[2];
    if (KOREAN_SURNAMES.has(second2) && text.length >= 4) {
      return [text.slice(0, 2), text.slice(2)];
    }
  }
  return null;
}

/** Extract Korean names embedded in phone field like "01089433916고남희" */
function extractNameFromPhone(phoneRaw: string): string[] {
  const raw = clean(phoneRaw);
  if (!raw) return [];
  const names: string[] = [];
  // "01089433916고남희" or "01071808838 이영수"
  const matches = raw.match(/[가-힣]{2,4}/g);
  if (matches) {
    for (const m of matches) {
      names.push(m);
    }
  }
  return names;
}

/** Extract all phone numbers from owner_phone field */
function extractAllPhones(phoneRaw: string): string[] {
  const raw = clean(phoneRaw);
  if (!raw) return [];
  const phones: string[] = [];
  const matches = raw.match(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g);
  if (matches) {
    for (const m of matches) {
      phones.push(normalizePhone(m));
    }
  }
  return phones;
}

/** Parse DEROS date from memo text */
function parseDeros(memo: string): string | null {
  const m = clean(memo);
  if (!m) return null;

  // "DEROS2026년12월29일" or "DEROS 2027년1월" or "Deros2027.02"
  const korMatch = m.match(
    /[Dd][EeIi][Rr][Oo][Ss]\s*(\d{4})년\s*(\d{1,2})월?\s*(\d{1,2})?일?/,
  );
  if (korMatch) {
    return `${korMatch[1]}-${korMatch[2].padStart(2, "0")}-${korMatch[3] ? korMatch[3].padStart(2, "0") : "01"}`;
  }

  // "Deros2027.02" or "디로스2028.02.28"
  const dotMatch = m.match(
    /[Dd디][EeIi이][Rr로][Oo][Ss스]\s*(\d{4})\.(\d{1,2})(?:\.(\d{1,2}))?/,
  );
  if (dotMatch) {
    return `${dotMatch[1]}-${dotMatch[2].padStart(2, "0")}-${dotMatch[3] ? dotMatch[3].padStart(2, "0") : "01"}`;
  }

  // "DEROS 2026 April 4" or "Diros sep 2024"
  const months: Record<string, string> = {
    january: "01",
    jan: "01",
    february: "02",
    feb: "02",
    march: "03",
    mar: "03",
    april: "04",
    apr: "04",
    may: "05",
    june: "06",
    jun: "06",
    july: "07",
    jul: "07",
    august: "08",
    aug: "08",
    september: "09",
    sep: "09",
    october: "10",
    oct: "10",
    november: "11",
    nov: "11",
    december: "12",
    dec: "12",
  };
  const engMatch = m.match(
    /[Dd][IiEe][Rr][Oo][Ss]\s*(\d{4})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{1,2})?/i,
  );
  if (engMatch) {
    const mo = months[engMatch[2].toLowerCase()] || "01";
    return `${engMatch[1]}-${mo}-${engMatch[3] ? engMatch[3].padStart(2, "0") : "01"}`;
  }
  // Reversed: "Diros sep 2024"
  const engMatch2 = m.match(
    /[Dd][IiEe][Rr][Oo][Ss]\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})/i,
  );
  if (engMatch2) {
    const mo = months[engMatch2[1].toLowerCase()] || "01";
    return `${engMatch2[2]}-${mo}-01`;
  }

  // "DEROS 확인26년3월" → 2026-03
  const shortMatch = m.match(
    /[Dd디][EeIi이][Rr로][Oo][Ss스]\s*(?:확인)?(\d{2})년\s*(\d{1,2})월?/,
  );
  if (shortMatch) {
    const yy = parseInt(shortMatch[1]);
    const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${year}-${shortMatch[2].padStart(2, "0")}-01`;
  }

  // "DEROS2027년1월" pattern (Korean year-month after DEROS keyword)
  const derosYear = m.match(/DEROS\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})?일?/i);
  if (derosYear) {
    return `${derosYear[1]}-${derosYear[2].padStart(2, "0")}-${derosYear[3] ? derosYear[3].padStart(2, "0") : "01"}`;
  }

  return null;
}

/** Extract deposit amount from memo */
function parseDeposit(memo: string): number {
  const match = memo.match(/보증금\s*[:\s]*([\d,]+)/);
  if (match) return parseInt(match[1].replace(/,/g, ""));
  return 0;
}

/** Parse family phone field to extract name, relationship, and phone */
function parseFamilyPhone(raw: string): {
  name: string;
  relationship: string;
  phone: string;
} {
  const fp = clean(raw);
  if (!fp) return { name: "가족", relationship: "가족", phone: "" };

  const isSpouse = /와이프|wife/i.test(fp);
  const relationship = isSpouse ? "배우자(Spouse)" : "가족";

  // Extract Korean phone number
  const phone = extractKoreanPhone(fp);
  if (!phone) {
    // Try US phone number
    const usMatch = fp.match(/\+?1[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}/);
    if (usMatch) {
      const nameText = fp
        .replace(usMatch[0], "")
        .replace(/와이프|wife/gi, "")
        .replace(/[()]/g, "")
        .trim();
      return {
        name: nameText || "가족",
        relationship,
        phone: usMatch[0].replace(/\s/g, ""),
      };
    }
    return { name: "가족", relationship: "가족", phone: fp };
  }

  // Remove the phone digits and Korean phone-related chars to get the name
  let nameText = fp
    .replace(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/, "")
    .replace(/와이프|wife/gi, "")
    .replace(/[()씨,\s]+/g, " ")
    .trim();

  // If nameText is just digits (leftover), clear it
  if (/^\d+$/.test(nameText)) nameText = "";

  return { name: nameText || "가족", relationship, phone };
}

/** Extract management office phone from memo */
function parseManagementPhone(memo: string): string | null {
  const m = clean(memo);
  // "관리실031-7585506", "관리실: 031-706-1600", "관리사무소031-752-2203", "관리실 : 02-449-9075"
  const match = m.match(
    /관리(?:실|사무소|사무실)\s*[:\s]*(\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4})/,
  );
  if (match) return match[1].replace(/\s/g, "");
  // "관리실 : 031-706-1600"
  const match2 = m.match(
    /관리(?:실|사무소|사무실)\s*[:\s]*(0\d{1,2}-\d{3,4}-\d{4})/,
  );
  if (match2) return match2[1];
  return null;
}

/** Extract equipment info from memo and extra_amount fields */
function parseEquipment(
  memo: string,
  extraAmount: string,
): { name: string; paidBy: string; cost: number }[] {
  const items: { name: string; paidBy: string; cost: number }[] = [];
  const combined = `${clean(memo)} ${clean(extraAmount)}`;

  // "정수기킹스소유" or "정수기 우리것"  → office owns purifier
  if (/정수기\s*(?:킹스|우리)\s*(?:소유|것|꺼)/.test(combined)) {
    items.push({ name: "정수기", paidBy: "office", cost: 0 });
  } else if (/정수기\s*(?:세입자|본인)/.test(combined)) {
    items.push({ name: "정수기", paidBy: "tenant", cost: 0 });
  } else if (/정수기\s*(?:집주인|임대인)/.test(combined)) {
    items.push({ name: "정수기", paidBy: "landlord", cost: 0 });
  } else if (/정수기/.test(combined) && /안씀|안함|뺄/.test(combined)) {
    // skip — not using purifier
  } else if (/정수기/.test(combined)) {
    // generic mention — extract cost if possible
    const costMatch = combined.match(/정수기\s*(?:값?)?\s*(\d[\d,]*)\s*원?/);
    const cost = costMatch ? parseInt(costMatch[1].replace(/,/g, "")) : 0;
    items.push({ name: "정수기", paidBy: "office", cost });
  }

  // "인터넷 집주인소유" or "인터넷 집주인"
  if (/인터넷\s*(?:집주인|임대인)\s*(?:소유)?/.test(combined)) {
    items.push({ name: "인터넷", paidBy: "landlord", cost: 0 });
  } else if (/인터넷\s*(?:본인|세입자)\s*(?:설치)?/.test(combined)) {
    items.push({ name: "인터넷", paidBy: "tenant", cost: 0 });
  } else if (/인터넷/.test(combined) && /안함/.test(combined)) {
    // skip
  } else if (/인터넷\s*(\d[\d,]*)\s*(?:원)?/.test(combined)) {
    const costMatch = combined.match(/인터넷\s*(\d[\d,]*)\s*(?:원)?/);
    const cost = costMatch ? parseInt(costMatch[1].replace(/,/g, "")) : 0;
    items.push({ name: "인터넷", paidBy: "office", cost });
  }

  // "인,정" or "인정" pattern with cost — internet + purifier bundled
  if (items.length === 0) {
    const bundleMatch = combined.match(
      /인[,\s]*정\s*(?:수기)?\s*(\d[\d,]*)\s*(?:원)?/,
    );
    if (bundleMatch) {
      const totalCost = parseInt(bundleMatch[1].replace(/,/g, ""));
      const half = Math.round(totalCost / 2);
      items.push({ name: "인터넷", paidBy: "office", cost: half });
      items.push({ name: "정수기", paidBy: "office", cost: totalCost - half });
    }
  }

  return items;
}

/** Extract 선불금 amount from memo */
function parsePrepaid(memo: string): number {
  const m = clean(memo);
  const match = m.match(/선불금\s*[:\s]*([\d,]+)/);
  if (match) return parseInt(match[1].replace(/,/g, ""));
  return 0;
}

function categorizePaymentType(type: string): {
  paymentType: string;
  utilityName: string | null;
} {
  const t = clean(type).toLowerCase();
  if (t.includes("가스") || t.includes("gas"))
    return { paymentType: "utility", utilityName: "가스" };
  if (t.includes("전기") || t.includes("elec"))
    return { paymentType: "utility", utilityName: "전기" };
  if (t.includes("수도") || t.includes("water"))
    return { paymentType: "utility", utilityName: "수도" };
  if (t.includes("인터넷"))
    return { paymentType: "utility", utilityName: "인터넷" };
  if (t.includes("아파트공과금") || t.includes("집주인관리공과금"))
    return { paymentType: "utility", utilityName: "아파트공과금" };
  if (t.match(/\d{4}년\d{1,2}월/))
    return { paymentType: "rent", utilityName: null };
  if (t.includes("티켓") || t.includes("ticket"))
    return { paymentType: "service", utilityName: null };
  if (t.includes("과속") || t.includes("speeding"))
    return { paymentType: "service", utilityName: null };
  if (t.includes("주차위반") || t.includes("parking"))
    return { paymentType: "service", utilityName: null };
  if (t.includes("훅업") || t.includes("hookup"))
    return { paymentType: "service", utilityName: null };
  return { paymentType: "service", utilityName: null };
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const { Pool } = pg;
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: url }) }),
  });

  // ── Read Excel files ───────────────────────────────────────────────
  const dataPath = path.resolve(
    __dirname,
    "../../../apps/crm/examples/DATA.xlsx",
  );
  const salesPath = path.resolve(
    __dirname,
    "../../../apps/crm/examples/SALES.xlsx",
  );

  const wb1 = XLSX.readFile(dataPath);
  const ws1 = wb1.Sheets[wb1.SheetNames[0]];
  const dataRows: DataRow[] = XLSX.utils.sheet_to_json(ws1, {
    header: ["name", "group", "phone", "address", "memo", "rank"],
    range: 2,
  });

  const wb2 = XLSX.readFile(salesPath);
  const ws2 = wb2.Sheets[wb2.SheetNames[0]];
  const salesRows: SalesRow[] = XLSX.utils.sheet_to_json(ws2, {
    header: [
      "date",
      "customer",
      "seller",
      "type",
      "qty",
      "amount",
      "total",
      "bank",
      "owner_birth",
      "owner_phone",
      "contract_start",
      "contract_end",
      "family_phone",
      "extra_amount",
      "utility_bill",
      "discount",
    ],
    range: 2,
  });
  // Remove totals row
  salesRows.pop();

  // ── Deduplicate SALES rows (same customer, same date, same amount, same items) ──
  const seenSalesKeys = new Set<string>();
  const dedupedSalesRows: SalesRow[] = [];
  let duplicatesRemoved = 0;
  for (const sale of salesRows) {
    const sortedType = clean(sale.type)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .sort()
      .join(",");
    const key = `${normalizeName(sale.customer)}|${clean(sale.date).slice(0, 10)}|${sale.amount}|${sortedType}`;
    if (seenSalesKeys.has(key)) {
      duplicatesRemoved++;
      console.log(
        `  Skipped duplicate: ${clean(sale.customer)} | ${clean(sale.date)} | ${sale.amount}`,
      );
      continue;
    }
    seenSalesKeys.add(key);
    dedupedSalesRows.push(sale);
  }

  console.log(`Loaded ${dataRows.length} customers from DATA.xlsx`);
  console.log(
    `Loaded ${dedupedSalesRows.length} sales from SALES.xlsx (removed ${duplicatesRemoved} duplicates)`,
  );

  // ── Step 1: Get existing base locations ────────────────────────────
  const existingLocations = await db
    .selectFrom("base_location")
    .selectAll()
    .execute();
  const locationMap = new Map<string, number>();
  for (const loc of existingLocations) {
    locationMap.set(loc.name.toLowerCase(), loc.id);
    if (loc.name_ko) locationMap.set(loc.name_ko.toLowerCase(), loc.id);
  }

  let defaultLocationId = existingLocations[0]?.id;
  if (!defaultLocationId) {
    console.error("No base locations found. Run migrations first.");
    process.exit(1);
  }
  console.log(
    `Default base location: ${existingLocations[0]?.name} (${defaultLocationId})`,
  );

  // ── Step 2: Get existing utility types ─────────────────────────────
  const utilityTypes = await db
    .selectFrom("utility_type")
    .selectAll()
    .execute();
  const utilityTypeMap = new Map<string, number>();
  for (const ut of utilityTypes) {
    utilityTypeMap.set(ut.name, ut.id);
  }

  if (!utilityTypeMap.has("아파트공과금")) {
    const result = await db
      .insertInto("utility_type")
      .values({ name: "아파트공과금" })
      .returning("id")
      .executeTakeFirstOrThrow();
    utilityTypeMap.set("아파트공과금", result.id);
    console.log("Created utility type: 아파트공과금");
  }

  // ── Step 3: Get admin user for received_by ─────────────────────────
  const adminUser = await db
    .selectFrom("user")
    .select("id")
    .where("role", "=", "admin")
    .executeTakeFirst();

  if (!adminUser) {
    console.error("No admin user found. Run seed first.");
    process.exit(1);
  }
  const adminId = adminUser.id;
  console.log(`Admin user ID: ${adminId}`);

  // ── Step 3b: Clean up previous migration data ────────────────────
  console.log("\n--- Cleaning Previous Migration Data ---");
  await db.deleteFrom("utility_bill").execute();
  await db.deleteFrom("ledger_entry").execute();
  await db.deleteFrom("payment").execute();
  await db.deleteFrom("property_equipment").execute();
  await db.deleteFrom("document").execute();
  await db.deleteFrom("service_request").execute();
  await db.deleteFrom("lease").execute();
  await db.deleteFrom("property").execute();
  await db.deleteFrom("tenant_family_member").execute();
  await db.deleteFrom("tenant_pet").execute();
  await db.deleteFrom("tenant_note").execute();
  await db.deleteFrom("tenant").execute();
  await db.deleteFrom("landlord_family_member").execute();
  await db.deleteFrom("landlord").execute();
  console.log("Cleaned all previous migration data");

  // ── Step 4: Build lookup from SALES data ───────────────────────────
  const salesByCustomer = new Map<string, SalesRow[]>();
  for (const sale of dedupedSalesRows) {
    const key = normalizeName(sale.customer);
    if (!salesByCustomer.has(key)) salesByCustomer.set(key, []);
    salesByCustomer.get(key)!.push(sale);
  }

  // ── Step 5: Create landlords with family member splitting ──────────
  console.log("\n--- Creating Landlords ---");
  const landlordMap = new Map<string, number>(); // ownerKey → landlord ID
  // Also map by primary phone for dedup
  const landlordByPhone = new Map<string, number>(); // phone → landlord ID

  // Collect all unique owner entries
  const seenOwnerKeys = new Set<string>();
  const ownerEntries: { ownerBirth: string; ownerPhone: string }[] = [];
  for (const sale of dedupedSalesRows) {
    const ob = clean(sale.owner_birth);
    if (!ob) continue;
    const phone = normalizePhone(String(sale.owner_phone || ""));
    const key = `${ob.toLowerCase()}|${phone}`;
    if (seenOwnerKeys.has(key)) continue;
    seenOwnerKeys.add(key);
    ownerEntries.push({
      ownerBirth: ob,
      ownerPhone: String(sale.owner_phone || ""),
    });
  }

  let landlordCount = 0;
  let landlordFamilyCount = 0;

  for (const entry of ownerEntries) {
    const people = parseLandlordPeople(entry.ownerBirth, entry.ownerPhone);
    if (people.length === 0) continue;

    const phones = extractAllPhones(entry.ownerPhone);
    const primaryPhone = phones[0] ? normalizePhone(phones[0]) : "";
    const primary = people[0];

    if (!primary.name || /^\d+(-\d)?$/.test(primary.name)) continue;

    // Dedup: skip if same primary phone already created a landlord
    if (primaryPhone && landlordByPhone.has(primaryPhone)) {
      // Map the old ownerKey too
      const existingId = landlordByPhone.get(primaryPhone)!;
      const oldKey = `${parseOwnerName(entry.ownerBirth).name.toLowerCase()}|${primaryPhone}`;
      landlordMap.set(oldKey, existingId);
      // Also map with primary parsed name
      landlordMap.set(
        `${primary.name.toLowerCase()}|${primaryPhone}`,
        existingId,
      );
      continue;
    }

    const result = await db
      .insertInto("landlord")
      .values({
        name: primary.name,
        phone: primaryPhone || "미등록",
        birth: primary.birth || null,
        notes: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const landlordId = result.id;
    landlordCount++;

    // Map by multiple keys for lookup
    const oldKey = `${parseOwnerName(entry.ownerBirth).name.toLowerCase()}|${primaryPhone}`;
    landlordMap.set(oldKey, landlordId);
    landlordMap.set(
      `${primary.name.toLowerCase()}|${primaryPhone}`,
      landlordId,
    );
    if (primaryPhone) landlordByPhone.set(primaryPhone, landlordId);

    // Create family members for remaining people
    for (let i = 1; i < people.length; i++) {
      const person = people[i];
      if (!person.name || /^\d+$/.test(person.name)) continue;
      const memberPhone = phones[i] ? normalizePhone(phones[i]) : "";
      await db
        .insertInto("landlord_family_member")
        .values({
          landlord_id: landlordId,
          name: person.name,
          relationship: person.role || "가족",
          phone: memberPhone || null,
          birth: person.birth ? new Date(person.birth) : null,
        })
        .execute();
      landlordFamilyCount++;
      console.log(
        `  Family: ${primary.name} → ${person.name} (${person.role || "가족"})`,
      );
    }
  }
  console.log(
    `Created ${landlordCount} landlords, ${landlordFamilyCount} landlord family members`,
  );

  // ownerKey function for property creation lookup
  function ownerKey(sale: SalesRow): string {
    const { name } = parseOwnerName(sale.owner_birth);
    const phone = normalizePhone(String(sale.owner_phone || ""));
    return `${name.toLowerCase()}|${phone}`;
  }

  // Create a single placeholder landlord for tenants with no landlord info
  const placeholderLandlord = await db
    .insertInto("landlord")
    .values({
      name: "미등록 집주인",
      phone: "미등록",
      notes: "데이터 없는 고객용 플레이스홀더",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const placeholderLandlordId = placeholderLandlord.id;

  // ── Step 6: Create tenants from DATA.xlsx ──────────────────────────
  console.log("\n--- Creating Tenants ---");
  const tenantMap = new Map<string, number>();
  const dataRowMap = new Map<string, DataRow>();

  let tenantCount = 0;
  for (const row of dataRows) {
    const name = clean(row.name);
    if (!name) continue;

    const phone = clean(row.phone) || "미등록";
    const rank = clean(row.rank) || null;
    const group = clean(row.group);
    const memo = clean(row.memo);
    const isInactive = group.toUpperCase().includes("MOVE OUT");

    // Extract DEROS from memo
    const deros = parseDeros(memo);

    // Build notes from memo and group
    const noteParts: string[] = [];
    if (group && !isInactive) noteParts.push(`지역: ${group}`);
    if (memo) noteParts.push(memo);

    const result = await db
      .insertInto("tenant")
      .values({
        name,
        phone,
        rank: rank?.toUpperCase() || null,
        status: isInactive ? "inactive" : "active",
        base_location_id: defaultLocationId,
        deros: deros ? new Date(deros) : null,
        notes: noteParts.join(" | ") || null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const key = normalizeName(name);
    tenantMap.set(key, result.id);
    dataRowMap.set(key, row);
    tenantCount++;

    if (deros) console.log(`  DEROS: ${name} → ${deros}`);
  }
  console.log(`Created ${tenantCount} tenants`);

  // ── Step 7: Create family members from SALES family_phone ──────────
  console.log("\n--- Creating Family Members ---");
  let familyCount = 0;
  const processedFamilyPhones = new Set<string>();

  for (const sale of dedupedSalesRows) {
    const familyPhoneRaw = clean(String(sale.family_phone || ""));
    if (!familyPhoneRaw) continue;

    const tenantKey = normalizeName(sale.customer);
    const tenantId = tenantMap.get(tenantKey);
    if (!tenantId) continue;

    const {
      name: familyName,
      relationship,
      phone: familyPhone,
    } = parseFamilyPhone(familyPhoneRaw);
    if (!familyPhone) continue;

    const dedupKey = `${tenantId}|${familyPhone}`;
    if (processedFamilyPhones.has(dedupKey)) continue;
    processedFamilyPhones.add(dedupKey);

    await db
      .insertInto("tenant_family_member")
      .values({
        tenant_id: tenantId,
        name: familyName,
        relationship,
        phone: familyPhone,
        notes:
          familyPhoneRaw !== familyPhone ? `원본: ${familyPhoneRaw}` : null,
      })
      .execute();
    familyCount++;
    console.log(
      `  ${clean(sale.customer)} → ${familyName} (${relationship}) ${familyPhone}`,
    );
  }
  console.log(`Created ${familyCount} family members`);

  // ── Step 7b: Create pets from DATA memo ────────────────────────────
  console.log("\n--- Creating Pets ---");
  let petCount = 0;
  for (const row of dataRows) {
    const name = clean(row.name);
    const memo = clean(row.memo);
    if (!name || !memo) continue;

    const tenantId = tenantMap.get(normalizeName(name));
    if (!tenantId) continue;

    // "개두마리" → 2 dogs
    const dogCountMatch = memo.match(/개\s*(두|세|네|다섯|한)\s*마리/);
    if (dogCountMatch) {
      const countMap: Record<string, number> = {
        한: 1,
        두: 2,
        세: 3,
        네: 4,
        다섯: 5,
      };
      const count = countMap[dogCountMatch[1]] || 1;
      for (let i = 0; i < count; i++) {
        await db
          .insertInto("tenant_pet")
          .values({ tenant_id: tenantId, name: `Dog ${i + 1}`, species: "dog" })
          .execute();
        petCount++;
      }
      console.log(`  ${name} → ${count} dog(s)`);
    }
  }
  console.log(`Created ${petCount} pets`);

  // ── Step 8: Create properties + leases from SALES ──────────────────
  console.log("\n--- Creating Properties & Leases (from SALES) ---");
  let propertyCount = 0;
  let leaseCount = 0;
  const tenantLeaseMap = new Map<number, number>();
  const today = new Date("2026-03-13");

  for (const [customerKey, sales] of salesByCustomer) {
    const tenantId = tenantMap.get(customerKey);
    if (!tenantId) continue;
    if (tenantLeaseMap.has(tenantId)) continue;

    // Get contract info — prefer entry with both dates
    let saleWithContract = sales.find(
      (s) => clean(s.contract_start) && clean(s.contract_end),
    );

    // Fallback: entry with only contract_end (e.g., JARAUD)
    if (!saleWithContract) {
      const saleWithEnd = sales.find((s) => clean(s.contract_end));
      if (saleWithEnd) {
        saleWithContract = { ...saleWithEnd };
        // Use earliest payment date as approximate start
        const paymentDate = clean(saleWithEnd.date);
        if (paymentDate) {
          saleWithContract.contract_start = paymentDate.slice(0, 10);
        }
        console.log(
          `  ⚠ ${customerKey}: missing contract_start, using payment date as fallback`,
        );
      }
    }

    if (!saleWithContract) continue;

    // Address from DATA
    const dataRow = dataRowMap.get(customerKey);
    const address = clean(dataRow?.address || "") || "주소 미등록";

    // Landlord lookup — try by name+phone key, then by phone alone
    const ob = clean(saleWithContract.owner_birth);
    let landlordId: number | undefined;
    if (ob) {
      const lKey = ownerKey(saleWithContract);
      landlordId = landlordMap.get(lKey);
      if (!landlordId) {
        // Fallback: try by phone
        const phone = normalizePhone(
          String(saleWithContract.owner_phone || ""),
        );
        if (phone) landlordId = landlordByPhone.get(phone);
      }
    }
    if (!landlordId) landlordId = placeholderLandlordId;

    // Monthly rent — prefer a sale with ONLY rent (single item) for accuracy
    const rentOnlySale = sales.find((s) => {
      const items = clean(s.type)
        .split(",")
        .map((t) => t.trim());
      return items.length === 1 && /\d{4}년\d{1,2}월/.test(items[0]);
    });
    const rentAnySale = sales.find((s) => {
      const items = clean(s.type)
        .split(",")
        .map((t) => t.trim());
      return items.some((item) => /\d{4}년\d{1,2}월/.test(item));
    });
    const monthlyRent = rentOnlySale
      ? String(rentOnlySale.amount)
      : rentAnySale
        ? String(rentAnySale.amount)
        : "0";

    // Deposit from memo
    const memo = clean(dataRow?.memo || "");
    const deposit = parseDeposit(memo);

    // Collect extra_amount info for property notes
    const extras = new Set<string>();
    for (const s of sales) {
      const ea = clean(s.extra_amount);
      if (ea) extras.add(ea);
    }

    // Management phone from memo
    const managementPhone = parseManagementPhone(memo);

    const propertyResult = await db
      .insertInto("property")
      .values({
        landlord_id: landlordId,
        address,
        property_type: "apartment",
        monthly_rent_krw: monthlyRent,
        deposit_krw: String(deposit),
        status: "occupied",
        permission_status: "approved",
        management_phone: managementPhone,
        notes: extras.size > 0 ? `추가비용: ${[...extras].join(" / ")}` : null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    propertyCount++;

    // Create equipment from memo + extra_amount
    const allExtras = [...extras].join(" ");
    const equipmentItems = parseEquipment(memo, allExtras);
    for (const eq of equipmentItems) {
      await db
        .insertInto("property_equipment")
        .values({
          property_id: propertyResult.id,
          name: eq.name,
          paid_by: eq.paidBy,
          monthly_cost_krw: eq.cost,
        })
        .execute();
    }
    if (equipmentItems.length > 0) {
      console.log(
        `  Equipment for ${customerKey}: ${equipmentItems.map((e) => `${e.name}(${e.paidBy})`).join(", ")}`,
      );
    }

    // Lease with correct status
    const contractStart = clean(saleWithContract.contract_start);
    const contractEnd = clean(saleWithContract.contract_end);
    const endDate = new Date(contractEnd);
    const leaseStatus = endDate < today ? "expired" : "active";

    const leaseResult = await db
      .insertInto("lease")
      .values({
        property_id: propertyResult.id,
        tenant_id: tenantId,
        start_date: new Date(contractStart),
        end_date: endDate,
        monthly_rent_krw: monthlyRent,
        deposit_krw: String(deposit),
        status: leaseStatus,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    tenantLeaseMap.set(tenantId, leaseResult.id);
    leaseCount++;

    if (leaseStatus === "expired") {
      console.log(`  Expired: ${customerKey} (ended ${contractEnd})`);
    }
  }
  console.log(`Created ${propertyCount} properties, ${leaseCount} leases`);

  // ── Step 8b: Create properties + leases for tenants WITHOUT sales ──
  console.log(
    "\n--- Creating Properties & Leases (from DATA only — no sales) ---",
  );
  let noSalesPropertyCount = 0;
  let noSalesLeaseCount = 0;

  for (const row of dataRows) {
    const name = clean(row.name);
    if (!name) continue;

    const tenantKey = normalizeName(name);
    const tenantId = tenantMap.get(tenantKey);
    if (!tenantId) continue;
    if (tenantLeaseMap.has(tenantId)) continue; // already has a lease from SALES

    const address = clean(row.address);
    if (!address) continue;

    const group = clean(row.group);
    const memo = clean(row.memo);
    const isInactive = group.toUpperCase().includes("MOVE OUT");
    const deposit = parseDeposit(memo);

    const managementPhone = parseManagementPhone(memo);

    const propertyResult = await db
      .insertInto("property")
      .values({
        landlord_id: placeholderLandlordId,
        address,
        property_type: "apartment",
        monthly_rent_krw: "0",
        deposit_krw: String(deposit),
        status: isInactive ? "vacant" : "occupied",
        permission_status: "approved",
        management_phone: managementPhone,
        notes: memo ? `DATA 메모: ${memo}` : null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    noSalesPropertyCount++;

    // Equipment from memo
    const equipmentItems = parseEquipment(memo, "");
    for (const eq of equipmentItems) {
      await db
        .insertInto("property_equipment")
        .values({
          property_id: propertyResult.id,
          name: eq.name,
          paid_by: eq.paidBy,
          monthly_cost_krw: eq.cost,
        })
        .execute();
    }

    // Placeholder lease dates — no contract info available
    const leaseResult = await db
      .insertInto("lease")
      .values({
        property_id: propertyResult.id,
        tenant_id: tenantId,
        start_date: new Date("2026-01-01"),
        end_date: new Date("2027-01-01"),
        monthly_rent_krw: "0",
        deposit_krw: String(deposit),
        status: isInactive ? "expired" : "active",
        notes: "계약 정보 없음 — 판매내역에 없는 고객 (날짜는 임시값)",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    tenantLeaseMap.set(tenantId, leaseResult.id);
    noSalesLeaseCount++;
    console.log(`  ${name}: ${address}`);
  }
  console.log(
    `Created ${noSalesPropertyCount} properties, ${noSalesLeaseCount} leases (no sales)`,
  );

  // ── Step 9: Create payments from SALES ─────────────────────────────
  console.log("\n--- Creating Payments ---");
  let paymentCount = 0;
  let utilityBillCount = 0;

  for (const sale of dedupedSalesRows) {
    const tenantKey = normalizeName(sale.customer);
    const tenantId = tenantMap.get(tenantKey);
    if (!tenantId) continue;

    const leaseId = tenantLeaseMap.get(tenantId);
    if (!leaseId) continue;

    const paymentDate = clean(sale.date);
    if (!paymentDate) continue;

    const totalAmount = Number(sale.amount) || 0;
    if (totalAmount <= 0) continue;

    const items = clean(sale.type)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (items.length === 0) continue;

    // Build notes
    const noteParts: string[] = [];
    if (clean(sale.extra_amount))
      noteParts.push(`추가: ${clean(sale.extra_amount)}`);
    if (clean(sale.discount)) noteParts.push(`할인: ${clean(sale.discount)}`);
    if (clean(sale.seller)) noteParts.push(`판매자: ${clean(sale.seller)}`);
    const notes = noteParts.join(" | ") || null;

    const perItemAmount = Math.round(totalAmount / items.length);

    // Generate bundle_id when multiple items paid at once
    const bundleId = items.length > 1 ? randomUUID() : null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { paymentType, utilityName } = categorizePaymentType(item);
      const itemAmount =
        i === items.length - 1
          ? totalAmount - perItemAmount * (items.length - 1)
          : perItemAmount;

      let billingMonth: Date;
      const monthMatch = item.match(/(\d{4})년(\d{1,2})월/);
      if (monthMatch) {
        billingMonth = new Date(
          `${monthMatch[1]}-${monthMatch[2].padStart(2, "0")}-01`,
        );
      } else {
        const pd = new Date(paymentDate);
        billingMonth = new Date(
          `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}-01`,
        );
      }

      await db
        .insertInto("payment")
        .values({
          lease_id: leaseId,
          payment_type: paymentType,
          billing_month: billingMonth,
          amount_krw: String(itemAmount),
          currency_paid: "KRW",
          amount_paid: String(itemAmount),
          payment_method: "cash",
          payment_date: new Date(paymentDate),
          status: "paid",
          received_by: adminId,
          notes,
          bundle_id: bundleId,
        })
        .execute();
      paymentCount++;

      if (paymentType === "utility" && utilityName) {
        const utilityTypeId = utilityTypeMap.get(utilityName);
        if (utilityTypeId) {
          await db
            .insertInto("utility_bill")
            .values({
              lease_id: leaseId,
              utility_type_id: utilityTypeId,
              billing_month: billingMonth,
              amount_krw: String(itemAmount),
              paid_to_company: false,
            })
            .execute();
          utilityBillCount++;
        }
      }
    }
  }
  console.log(`Created ${paymentCount} payments`);
  console.log(`Created ${utilityBillCount} utility bills`);

  // ── Step 10: Create 선불금 (prepaid) utility bills from DATA memos ──
  console.log("\n--- Creating Prepaid (선불금) Records ---");
  const prepaidTypeId = utilityTypeMap.get("선불금");
  let prepaidCount = 0;

  if (prepaidTypeId) {
    for (const row of dataRows) {
      const name = clean(row.name);
      const memo = clean(row.memo);
      if (!name || !memo) continue;

      const prepaidAmount = parsePrepaid(memo);
      if (prepaidAmount <= 0) continue;

      const tenantId = tenantMap.get(normalizeName(name));
      if (!tenantId) continue;

      const leaseId = tenantLeaseMap.get(tenantId);
      if (!leaseId) continue;

      await db
        .insertInto("utility_bill")
        .values({
          lease_id: leaseId,
          utility_type_id: prepaidTypeId,
          billing_month: new Date("2026-03-01"),
          amount_krw: String(prepaidAmount),
          paid_to_company: true,
          notes: `메모 원본: ${memo.slice(0, 200)}`,
        })
        .execute();
      prepaidCount++;
    }
  }
  console.log(`Created ${prepaidCount} prepaid records`);

  // ── Summary ────────────────────────────────────────────────────────
  console.log("\n=== Migration Complete ===");
  console.log(
    `Landlords:              ${landlordCount + 1} (incl. placeholder)`,
  );
  console.log(`Landlord Family:        ${landlordFamilyCount}`);
  console.log(`Tenants:                ${tenantCount}`);
  console.log(`Family Members:         ${familyCount}`);
  console.log(`Pets:                   ${petCount}`);
  console.log(`Properties (sales):     ${propertyCount}`);
  console.log(`Properties (data only): ${noSalesPropertyCount}`);
  console.log(`Leases (sales):         ${leaseCount}`);
  console.log(`Leases (data only):     ${noSalesLeaseCount}`);
  console.log(`Payments:               ${paymentCount}`);
  console.log(`Utility Bills:          ${utilityBillCount}`);
  console.log(`Duplicates removed:     ${duplicatesRemoved}`);

  await db.destroy();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
