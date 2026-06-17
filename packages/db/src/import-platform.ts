/**
 * Import legacy platform data (Customers.xlsx + Sales.xlsx) into the current schema.
 *
 * Usage:
 *   tsx src/import-platform.ts                 # dry run (parses + prints report, writes NOTHING)
 *   tsx src/import-platform.ts --write         # load into the database (single transaction)
 *   CUSTOMERS=/path SALES=/path tsx src/import-platform.ts --write
 *
 * Columns are read BY HEADER NAME (row 1 of each sheet), so column re-ordering in
 * the export is harmless. The export is now authoritative for rent/deposit/dates:
 *   Customers: 고객명 고객그룹 연락처 주소 메모 계급 부대 애완동물 월세 보증금
 *              계약시작 계약만료 가족연락처 주인/생년월일 주인연락처 추가금액 가족
 *   Sales:     판매일시 고객명 판매자 판매내역 합계금액 고객메모 추가금액 아파트공과금
 *              주인/생년월일 주인연락처 계약시작 계약만료 가족연락처
 *
 * Strategy: one property + one lease per customer, sourced from Customers
 * (월세/보증금/계약시작/계약만료/주인 are authoritative — no longer derived). The
 * 2026 Sales history becomes split, labeled payments grouped by bundle. The
 * 추가금액 cell → recurring_charge rows; memos → DEROS / realty fee / co-landlords
 * / appliances (the per-house appliance registry).
 */
import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import XLSX from "xlsx";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { DB } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRITE = process.argv.includes("--write");
const TODAY = "2026-06-17";

const CUSTOMERS_PATH =
  process.env.CUSTOMERS || "/Users/jay/Downloads/Customers (1).xlsx";
const SALES_PATH = process.env.SALES || "/Users/jay/Downloads/Sales (1).xlsx";

// ── generic helpers ──────────────────────────────────────────────────────
function clean(v: unknown): string {
  return String(v ?? "").trim();
}
function num(v: unknown): number {
  return Number(String(v ?? "").replace(/,/g, "")) || 0;
}
function normalizeName(name: string): string {
  return clean(name).toLowerCase().replace(/\s+/g, " ");
}
function normalizePhone(phone: string): string {
  const p = clean(phone);
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("010"))
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith("0"))
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return p; // leave malformed/US numbers as-is
}
function extractKoreanPhone(text: string): string {
  const m = clean(text).match(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/);
  if (m) return normalizePhone(m[0]);
  const digits = clean(text).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("010"))
    return normalizePhone(digits);
  return "";
}
function extractAllPhones(raw: string): string[] {
  const m = clean(raw).match(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g);
  return m ? m.map(normalizePhone) : [];
}
function formatBirthDigits(d: string): string {
  const yy = parseInt(d.slice(0, 2));
  const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
  return `${year}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}
/** From a "######-N" token return ISO birth + sex (1/3 → M, 2/4 → F). */
function extractBirthSex(text: string): {
  birth: string | null;
  sex: string | null;
} {
  const m = clean(text).match(/(\d{6})-?([1-4])\b/);
  if (m) {
    const mm = parseInt(m[1].slice(2, 4));
    const dd = parseInt(m[1].slice(4, 6));
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return {
        birth: formatBirthDigits(m[1]),
        sex: m[2] === "1" || m[2] === "3" ? "M" : "F",
      };
    }
  }
  const b = clean(text).match(/(\d{6})/);
  if (b) {
    const mm = parseInt(b[1].slice(2, 4));
    const dd = parseInt(b[1].slice(4, 6));
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
      return { birth: formatBirthDigits(b[1]), sex: null };
  }
  return { birth: null, sex: null };
}

// ── RRN encryption (mirrors apps/crm/src/lib/rrn.ts) ─────────────────────
function rrnKey(): Buffer {
  const secret = process.env.RRN_ENC_KEY || process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("RRN_ENC_KEY/BETTER_AUTH_SECRET not set");
  return crypto.createHash("sha256").update(secret).digest();
}
function encryptRrn(plain: string): string {
  const digits = (plain ?? "").replace(/\D/g, "");
  if (digits.length !== 13) return ""; // only true 13-digit RRNs
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", rrnKey(), iv);
  const enc = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

// ── rank / branch (from import-excel.ts) ─────────────────────────────────
function normalizeRank(rank: string): string | null {
  let r = clean(rank).toUpperCase();
  if (!r) return null;
  if (r.includes("/")) {
    const parts = r.split("/").map((p) => p.trim());
    for (const p of parts)
      if (/^(E-?\d|O-?\d|CW\d|WO\d|W\d|GS\d)/.test(p))
        return p.replace("-", "");
    r = parts[0];
  }
  if (/^(E-?\d)\s+(E-?\d)$/.test(r)) r = r.split(/\s+/)[0]; // "E5 E5"
  r = r.replace(/^E-(\d)/, "E$1"); // "E-6" → "E6"
  if (r === "오산군인") return null;
  return r || null;
}
function inferBranch(rank: string | null, memo: string): string | null {
  const m = (memo || "").toUpperCase();
  if (m.includes("NAVY")) return "navy";
  if (m.includes("AIR FORCE") || m.includes("USAF")) return "air_force";
  // civilians have no service branch
  if (!rank || /^(GS\d|CONTRACTOR)/.test(rank)) return null;
  return "army";
}
function inferDependentStatus(memo: string): string | null {
  const m = clean(memo);
  if (/싱글|혼자|single/i.test(m)) return "without";
  if (
    /신혼|부부|와이프|아내|wife|가족|자녀|아이|딸|아들|동반|dependent/i.test(m)
  )
    return "with";
  return null;
}

// ── address (from import-excel.ts) ───────────────────────────────────────
function parseAddressParts(full: string): {
  address: string;
  detail: string | null;
} {
  if (!full) return { address: "", detail: null };
  const addr = clean(full).replace(/\s+/g, " ");
  const paren = addr.match(/^(.+?\))\s+(.+)$/);
  if (paren) return { address: paren[1].trim(), detail: paren[2].trim() };
  const floor = addr.match(/^(.+?)\s+(\d+층.*)$/);
  if (floor) return { address: floor[1].trim(), detail: floor[2].trim() };
  const ho = addr.match(/^(.+?)\s+(\d+[-]?\d*호.*)$/);
  if (ho) return { address: ho[1].trim(), detail: ho[2].trim() };
  return { address: addr, detail: null };
}
function detectPropertyType(address: string): string {
  const a = address;
  if (a.includes("빌라")) return "villa";
  if (a.includes("오피스텔")) return "officetel";
  if (
    /아파트|아프트|푸르지오|자이|호반써밋|우미린|레빌|힐스테이트|헤리티지|래미안|풍림|더힐|센터레빌|위례|판교원마을|THE SHARP|샤프/.test(
      a,
    )
  )
    return "apartment";
  if (/\d+층$/.test(a.trim()) || /\d+호/.test(a)) return "house";
  return "house";
}

// ── memo extractors (from migrate-crm.ts) ────────────────────────────────
function parseDeros(memo: string): string | null {
  const m = clean(memo);
  if (!m) return null;
  let x: RegExpMatchArray | null;
  if (
    (x = m.match(
      /[Dd디][EeIi이][Rr로][Oo][Ss스]\s*(\d{4})년\s*(\d{1,2})월?\s*(\d{1,2})?일?/,
    ))
  )
    return `${x[1]}-${x[2].padStart(2, "0")}-${x[3] ? x[3].padStart(2, "0") : "01"}`;
  if (
    (x = m.match(
      /[Dd디][EeIi이][Rr로][Oo][Ss스]\s*(\d{4})\.(\d{1,2})(?:\.(\d{1,2}))?/,
    ))
  )
    return `${x[1]}-${x[2].padStart(2, "0")}-${x[3] ? x[3].padStart(2, "0") : "01"}`;
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
  if (
    (x = m.match(
      /[Dd][IiEe][Rr][Oo][Ss]\s*(\d{4})\s+([A-Za-z]+)\s*(\d{1,2})?/i,
    )) &&
    months[x[2].toLowerCase()]
  )
    return `${x[1]}-${months[x[2].toLowerCase()]}-${x[3] ? x[3].padStart(2, "0") : "01"}`;
  if (
    (x = m.match(/[Dd][IiEe][Rr][Oo][Ss]\s+([A-Za-z]+)\s*(\d{4})/i)) &&
    months[x[1].toLowerCase()]
  )
    return `${x[2]}-${months[x[1].toLowerCase()]}-01`;
  if (
    (x = m.match(
      /[Dd디][EeIi이][Rr로][Oo][Ss스]\s*(?:확인)?(\d{2})년\s*(\d{1,2})월?/,
    ))
  ) {
    const yy = parseInt(x[1]);
    const year = yy >= 0 && yy <= 30 ? 2000 + yy : 1900 + yy;
    return `${year}-${x[2].padStart(2, "0")}-01`;
  }
  return null;
}
function parseDeposit(memo: string): number {
  const m = clean(memo).match(/보증금\s*[:\s]*([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, "")) : 0;
}
function parseManagementPhone(memo: string): string | null {
  const m = clean(memo).match(
    /관리(?:실|사무소|사무실)\s*[:\s]*(\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4})/,
  );
  return m ? m[1].replace(/\s/g, "") : null;
}
/**
 * Appliance registry rows from the free-text memo/추가금액: recognised appliance
 * words + who owns each (집주인/킹스/세입자, scanned in a window around the word)
 * + brand. Belongs to the property; monthly money is handled by recurring_charge.
 */
interface ApplianceModel {
  name: string;
  owner: string;
  brand: string | null;
  notes: string | null;
}
function parseAppliances(memo: string, extra: string): ApplianceModel[] {
  const text = `${clean(memo)} ${clean(extra)}`.replace(/\s+/g, " ");
  if (!text) return [];
  const ITEMS: { name: string; pat: RegExp }[] = [
    { name: "정수기", pat: /정수기/ },
    { name: "인터넷", pat: /인터넷|와이파이|wifi/i },
    { name: "세탁기", pat: /세탁기/ },
    { name: "건조기", pat: /건조기/ },
    { name: "냉장고", pat: /냉장고/ },
    { name: "에어컨", pat: /에어컨/ },
    { name: "보일러", pat: /보일러/ },
    { name: "TV", pat: /\bTV\b|티비|텔레비전/i },
    { name: "침대", pat: /침대/ },
    { name: "식기세척기", pat: /식기세척기/ },
    { name: "전자레인지", pat: /전자렌지|전자레인지|전렌지/ },
  ];
  // locate each appliance mention; each item "owns" the text up to the NEXT item
  // (so "인터넷 집주인소유 정수기킹스소유" → 인터넷=집주인, 정수기=킹스).
  const found: { name: string; idx: number }[] = [];
  const seen = new Set<string>();
  for (const it of ITEMS) {
    const m = it.pat.exec(text);
    if (!m) continue;
    if (it.name === "정수기" && /정수기[^.]{0,6}(안씀|안함|뺄|제외)/.test(text))
      continue;
    if (seen.has(it.name)) continue;
    seen.add(it.name);
    found.push({ name: it.name, idx: m.index });
  }
  if (!found.length) return [];
  found.sort((a, b) => a.idx - b.idx);
  const sentenceOwner = (): string => {
    if (/킹스|우리것|제공/.test(text)) return "office";
    if (/세입자소유|본인설치|세입자/.test(text)) return "tenant";
    return "landlord";
  };
  const out: ApplianceModel[] = [];
  for (let i = 0; i < found.length; i++) {
    const start = found[i].idx;
    const end =
      i + 1 < found.length
        ? found[i + 1].idx
        : Math.min(text.length, start + 18);
    const scope = text.slice(start, end);
    let owner: string;
    if (/킹스|우리것|우리\s|제공|줄리스|외국인관리소/.test(scope))
      owner = "office";
    else if (/세입자|본인/.test(scope)) owner = "tenant";
    else if (/집주인|임대인|명의/.test(scope)) owner = "landlord";
    else owner = sentenceOwner();
    const bwin = text.slice(Math.max(0, start - 4), end);
    const bm =
      bwin.match(/\b(?:LG|SK)\b/) ||
      bwin.match(/삼성|코웨이|린나이|경동|대성셀틱|대성|위니아|캐리어/);
    out.push({
      name: found[i].name,
      owner,
      brand: bm ? bm[0] : null,
      notes: null,
    });
  }
  return out;
}

/**
 * recurring_charge rows from the 추가금액 cell — the items bundled into / collected
 * alongside rent (관리비/인터넷/정수기/수도/전기). "…포함" (already inside the rent)
 * → active=false informational; "받기/추가/별도" → active=true (bills monthly);
 * ambiguous → active=false so it never double-bills something already in rent.
 */
interface RecurringModel {
  label: string;
  type: string;
  amount: number | null;
  active: boolean;
  memo: string | null;
}
function parseRecurringCharges(extra: string): RecurringModel[] {
  const src = clean(extra);
  if (!src) return [];
  const amounts = parseUtilityAmounts(src);
  const LABELS: Record<string, { label: string; type: string }> = {
    아파트공과금: { label: "관리비", type: "management" },
    인터넷: { label: "인터넷", type: "utility" },
    정수기: { label: "정수기", type: "custom" },
    수도: { label: "수도요금", type: "utility" },
    전기: { label: "전기요금", type: "utility" },
  };
  const included = /포함/.test(src);
  const collected = /받기|받아|추가|별도/.test(src);
  const out: RecurringModel[] = [];
  for (const [key, amt] of Object.entries(amounts)) {
    const meta = LABELS[key];
    if (!meta || !(amt > 0)) continue;
    // "관리비10" / "인정10" shorthand means 10만(₩100,000); no real recurring fee is < ₩1,000.
    const amount = amt < 1000 ? amt * 10000 : amt;
    out.push({
      label: meta.label,
      type: meta.type,
      amount,
      active: collected && !included,
      memo:
        `레거시 추가금액: ${src}`.slice(0, 200) +
        (included ? " · 월세 포함" : ""),
    });
  }
  return out;
}

function parsePets(memo: string): number {
  const m = clean(memo).match(/개\s*(한|두|세|네|다섯)\s*마리/);
  const map: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5 };
  return m ? map[m[1]] || 0 : 0;
}
/** Pets from the dedicated 애완동물 column ("개한마리" / "개 1" / "고양이 1마리"). */
function parsePetsColumn(pet: string): number {
  const p = clean(pet);
  if (!p) return 0;
  const numM = p.match(/(\d+)\s*마리?/);
  if (numM) return parseInt(numM[1]);
  const kor = p.match(/(한|두|세|네|다섯)\s*마리/);
  const map: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5 };
  if (kor) return map[kor[1]] || 1;
  if (/개|강아지|고양이|dog|cat|반려/i.test(p)) return 1;
  return 0;
}

// ── landlord owner-field parsing (from migrate-crm.ts, trimmed) ───────────
const KOREAN_SURNAMES = new Set(
  "김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우민류천방공현함변염석선설마길원진지표명기반도탁소피라".split(
    "",
  ),
);
interface Person {
  name: string;
  birth: string | null;
  sex: string | null;
  role: string | null;
}
/** Drop stray leading digit runs left over from messy owner cells: "71022정형근" → "정형근". */
function cleanPersonName(n: string): string {
  return clean(n)
    .replace(/^\d{1,5}\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}
/** Mask birth/sex-front tokens (######-N) before storing free text. */
function maskRrn(text: string): string {
  return clean(text)
    .replace(/\d{6}-?[1-4]\b/g, "[생년월일]")
    .replace(/\d{6}\b/g, "[생년월일]");
}
function trySplitKoreanNames(t: string): string[] | null {
  if (t.length >= 5 && t.length <= 7) {
    if (KOREAN_SURNAMES.has(t[3])) return [t.slice(0, 3), t.slice(3)];
    if (t.length >= 4 && KOREAN_SURNAMES.has(t[2]))
      return [t.slice(0, 2), t.slice(2)];
  }
  return null;
}
function parseLandlordPeople(ownerRaw: string): Person[] {
  const raw = clean(ownerRaw);
  if (!raw) return [];
  // role-annotated: "이재범 이재진(관리)손동하(진와이프)" / company reps "드로잉컴퍼니(이준희)"
  const rolePat = /([가-힣]+)\(([^)]+)\)/g;
  const roles: { name: string; role: string }[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rolePat.exec(raw)) !== null)
    roles.push({
      name: rm[1],
      role: /와이프|wife|배우자|부인/i.test(rm[2]) ? "배우자(Spouse)" : rm[2],
    });
  if (roles.length) {
    const lead = raw.match(/^([가-힣]+)[\s(]/);
    const isCompany =
      /컴퍼니|주식회사|회사|그룹|홈$/.test(roles[0].name) ||
      /컴퍼니|주식회사|회사|그룹|홈/.test(lead?.[1] || "");
    if (isCompany) {
      const bs = extractBirthSex(raw);
      return [
        {
          name: raw.replace(/\d{6}-?\d?/g, "").trim(),
          birth: bs.birth,
          sex: bs.sex,
          role: null,
        },
      ];
    }
    const people: Person[] = [];
    if (lead && !roles.some((r) => r.name === lead[1])) {
      const bs = extractBirthSex(raw);
      people.push({ name: lead[1], birth: bs.birth, sex: bs.sex, role: null });
    }
    for (const r of roles)
      people.push({ name: r.name, birth: null, sex: null, role: r.role });
    return people;
  }
  // interleaved two people: "최승식660813오정선660827"
  const inter = raw.match(
    /^([가-힣]+)(\d{6})(?:-?[1-4])?([가-힣]+)(\d{6})(?:-?[1-4])?$/,
  );
  if (inter)
    return [
      {
        name: inter[1],
        ...extractBirthSex(
          inter[2] + (raw.match(new RegExp(inter[2] + "-?([1-4])"))?.[0] || ""),
        ),
        role: null,
      },
      {
        name: inter[3],
        ...extractBirthSex(
          inter[4] + (raw.match(new RegExp(inter[4] + "-?([1-4])"))?.[0] || ""),
        ),
        role: null,
      },
    ];
  // company (no rep)
  if (/주식회사|컴퍼니|\(주\)|그룹|홈주식/.test(raw)) {
    const bs = extractBirthSex(raw);
    return [
      {
        name: raw.replace(/\d{6}-?\d?/g, "").trim() || raw,
        birth: bs.birth,
        sex: bs.sex,
        role: null,
      },
    ];
  }
  // strip births, collect names
  const births: { birth: string; sex: string | null }[] = [];
  let stripped = raw.replace(/(\d{6})-?([1-4])?/g, (_, d, s) => {
    const mm = parseInt(d.slice(2, 4)),
      dd = parseInt(d.slice(4, 6));
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
      births.push({
        birth: formatBirthDigits(d),
        sex: s === "1" || s === "3" ? "M" : s === "2" || s === "4" ? "F" : null,
      });
    return " ";
  });
  stripped = stripped
    .replace(/[님씨,]/g, " ")
    .replace(/\d{6,}/g, "")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/[a-zA-Z]/.test(stripped) && !/[가-힣]/.test(stripped))
    return [
      {
        name: stripped || raw,
        birth: births[0]?.birth || null,
        sex: births[0]?.sex || null,
        role: null,
      },
    ];
  let parts = stripped
    .split(/\s+/)
    .filter((p) => /[가-힣]/.test(p) && p.length >= 2);
  if (
    parts.length === 1 &&
    /^[가-힣]+$/.test(parts[0]) &&
    parts[0].length >= 5
  ) {
    const split = trySplitKoreanNames(parts[0]);
    if (split) parts = split;
  }
  if (!parts.length)
    return [
      {
        name: stripped || raw,
        birth: births[0]?.birth || null,
        sex: births[0]?.sex || null,
        role: null,
      },
    ];
  return parts.map((name, i) => ({
    name,
    birth: births[i]?.birth || null,
    sex: births[i]?.sex || null,
    role: i === 0 ? null : "가족",
  }));
}
function parseFamilyPhone(raw: string): {
  name: string;
  relationship: string;
  phone: string;
} {
  const fp = clean(raw);
  if (!fp) return { name: "가족", relationship: "가족", phone: "" };
  const relationship = /와이프|wife/i.test(fp) ? "배우자(Spouse)" : "가족";
  let phone = extractKoreanPhone(fp);
  if (!phone) {
    const us = fp.match(/\+?1[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}/);
    if (us) phone = us[0].replace(/\s/g, "");
  }
  let name = fp
    .replace(/\+?1[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}/, "")
    .replace(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/, "")
    .replace(/와이프|wife/gi, "")
    .replace(/[()씨님,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^\d+$/.test(name) || !name) name = "가족";
  return { name, relationship, phone };
}

// ── payment item categorization / allocation ─────────────────────────────
function categorize(item: string): { type: string; utility: string | null } {
  const t = clean(item);
  if (/가스|gas/i.test(t)) return { type: "utility", utility: "가스" };
  if (/전기|elec/i.test(t)) return { type: "utility", utility: "전기" };
  if (/수도|water/i.test(t)) return { type: "utility", utility: "수도" };
  if (/인터넷/.test(t)) return { type: "utility", utility: "인터넷" };
  if (/아파트공과금|집주인관리공과금|관리비/.test(t))
    return { type: "utility", utility: "아파트공과금" };
  if (/\d{4}년\s*\d{1,2}월/.test(t)) return { type: "rent", utility: null };
  if (/보증금/.test(t)) return { type: "deposit", utility: null };
  if (/선불금/.test(t)) return { type: "rent", utility: null }; // prepaid rent
  return { type: "service", utility: null }; // REALTY FEE / 훅업 / 기타 / etc.
}
/** Specific 납부내역 label for a line item (전기요금/선불금/중개수수료…); null = use the type label (월세/보증금). */
function labelFor(
  item: string,
  type: string,
  utility: string | null,
): string | null {
  const t = clean(item);
  if (utility) {
    const map: Record<string, string> = {
      전기: "전기요금",
      수도: "수도요금",
      가스: "가스요금",
      인터넷: "인터넷",
      아파트공과금: "아파트공과금",
    };
    return map[utility] ?? utility;
  }
  if (/선불금/.test(t)) return "선불금";
  if (/realty\s*fee/i.test(t)) return "중개수수료";
  if (/훅업|hook/i.test(t)) return "훅업";
  if (/주차/.test(t)) return "주차";
  if (type === "service") return t || "기타";
  return null; // rent month / 보증금 → keep the type label
}
/** Canonical utility key a line item belongs to (broader than categorize: matches 정수기 too). */
function itemUtilityKey(item: string): string | null {
  const t = clean(item);
  if (/가스|gas/i.test(t)) return "가스";
  if (/전기|elec/i.test(t)) return "전기";
  if (/수도|water/i.test(t)) return "수도";
  if (/인터넷|정수기/.test(t)) return /인터넷/.test(t) ? "인터넷" : "정수기"; // "인터넷/정수기" → 인터넷
  if (/아파트공과금|집주인관리공과금|관리비/.test(t)) return "아파트공과금";
  return null;
}
/** Parse a Korean amount token: comma-thousands plus 만/천 units. "180000"→180000, "5만"→50000, "10만5천"→105000. */
function parseKrwAmount(raw: string): number | null {
  const s = clean(raw).replace(/,/g, "");
  if (!s) return null;
  const unit = s.match(/^(\d+(?:\.\d+)?)\s*만(?:\s*(\d+(?:\.\d+)?)\s*천)?/);
  if (unit)
    return Math.round(
      parseFloat(unit[1]) * 10000 + (unit[2] ? parseFloat(unit[2]) * 1000 : 0),
    );
  const cheon = s.match(/^(\d+(?:\.\d+)?)\s*천/);
  if (cheon) return Math.round(parseFloat(cheon[1]) * 1000);
  const plain = s.match(/^\d+/);
  return plain ? parseInt(plain[0]) : null;
}
/**
 * Pull EXPLICIT per-utility amounts out of the 추가금액 cell / tenant memo.
 * Handles "label number", "number(label)", "number label", slash-lists, comma-thousands and 만/천 units.
 * "인,정 10만원" (internet+purifier) is split half/half. Returns a key→amount map (인터넷/전기/수도/가스/아파트공과금/정수기).
 */
function parseUtilityAmounts(...sources: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (key: string, amt: number) => {
    if (amt > 0) out[key] = (out[key] || 0) + amt;
  };
  const LABELS: { key: string; pat: string }[] = [
    { key: "인터넷", pat: "인터넷|인" },
    { key: "정수기", pat: "정수기|정" },
    { key: "전기", pat: "전기|전" },
    { key: "수도", pat: "수도세|수도" },
    { key: "가스", pat: "가스" },
    { key: "아파트공과금", pat: "아파트공과금|관리비|관" },
  ];
  const AMT = String.raw`(\d[\d,]*(?:\.\d+)?\s*만(?:\s*\d+(?:\.\d+)?\s*천)?원?|\d[\d,]*(?:\.\d+)?\s*천원?|\d[\d,]*)`;
  // combined "인,정" / "인터넷,정수기" / "인/정" → split a single amount half/half between internet + purifier
  const combo = new RegExp(
    String.raw`(?:인터넷|인)\s*[,/]\s*(?:정수기|정)\s*${AMT}`,
  );
  for (const src of sources) {
    let text = clean(src);
    if (!text) continue;
    const cm = text.match(combo);
    if (cm) {
      const amt = parseKrwAmount(cm[1]);
      if (amt && amt > 0) {
        add("인터넷", Math.round(amt / 2));
        add("정수기", amt - Math.round(amt / 2));
      }
      text = text.replace(cm[0], " "); // consume so standalone label scan can't re-count this amount
    }
    for (const { key, pat } of LABELS) {
      // "label number" and "label(...)number" (e.g. "수도 15,000", "관 180000", "인터넷56650")
      const fwd = new RegExp(String.raw`(?:${pat})\s*${AMT}`, "g");
      let m: RegExpExecArray | null;
      while ((m = fwd.exec(text)) !== null) {
        const a = parseKrwAmount(m[1]);
        if (a) add(key, a);
      }
      // "number(label)" e.g. "56650(인터넷)" / "23000(인터넷)"
      const back = new RegExp(String.raw`${AMT}\s*\(\s*(?:${pat})\s*\)`, "g");
      while ((m = back.exec(text)) !== null) {
        const a = parseKrwAmount(m[1]);
        if (a) add(key, a);
      }
    }
  }
  return out;
}
/**
 * Allocate a row total across line items, preserving the total exactly.
 * Order: (a) REALTY FEE→150, (b) each rent month→monthlyRent, (c) explicit per-utility amounts
 * from extras/memo onto matching line items, (d) remainder split EVENLY across still-unassigned
 * non-rent items (last absorbs rounding). Guard: if rent/realty would drive the remainder negative
 * (partial/move-in rows), fall back to the old plain even-split for the whole row.
 */
function allocate(
  items: string[],
  total: number,
  monthlyRent: number,
  extras?: Record<string, number>,
): number[] {
  const n = items.length;
  const out = new Array(n).fill(0);
  const done = new Array(n).fill(false);
  const isRent = (s: string) => /\d{4}년\s*\d{1,2}월/.test(s);
  let rem = total;
  // (a) REALTY FEE → 150
  for (let i = 0; i < n; i++)
    if (/realty\s*fee/i.test(items[i]) && rem >= 150) {
      out[i] = 150;
      done[i] = true;
      rem -= 150;
    }
  // (b) each rent month → monthlyRent — guard against a negative remainder (partial/move-in row)
  if (monthlyRent > 0) {
    const rentIdx = items
      .map((it, i) => (!done[i] && isRent(it) ? i : -1))
      .filter((i) => i >= 0);
    if (rentIdx.length && rem - rentIdx.length * monthlyRent < 0)
      return allocateEven(items, total);
    for (const i of rentIdx) {
      out[i] = monthlyRent;
      done[i] = true;
      rem -= monthlyRent;
    }
  }
  // (c) explicit per-utility amounts onto matching, still-unassigned line items (skip if it would go negative)
  if (extras) {
    const claimed: Record<string, boolean> = {};
    for (let i = 0; i < n; i++) {
      if (done[i] || isRent(items[i])) continue;
      const key = itemUtilityKey(items[i]);
      if (!key || claimed[key]) continue;
      const amt = extras[key];
      if (amt != null && amt > 0 && rem - amt >= 0) {
        out[i] = amt;
        done[i] = true;
        rem -= amt;
        claimed[key] = true;
      }
    }
  }
  // (d) remainder split EVENLY across remaining (still-unassigned) items, last absorbs rounding
  const left = [];
  for (let i = 0; i < n; i++) if (!done[i]) left.push(i);
  if (left.length) {
    const per = Math.round(rem / left.length);
    left.forEach(
      (i, k) =>
        (out[i] = k === left.length - 1 ? rem - per * (left.length - 1) : per),
    );
  } else if (rem !== 0 && n) out[n - 1] += rem;
  return out;
}
/** Old behaviour: REALTY FEE→150, rent→monthlyRent dropped, everything else split evenly. Used as the guard fallback. */
function allocateEven(items: string[], total: number): number[] {
  const n = items.length;
  const out = new Array(n).fill(0);
  const done = new Array(n).fill(false);
  let rem = total;
  for (let i = 0; i < n; i++)
    if (/realty\s*fee/i.test(items[i]) && rem >= 150) {
      out[i] = 150;
      done[i] = true;
      rem -= 150;
    }
  const left = [];
  for (let i = 0; i < n; i++) if (!done[i]) left.push(i);
  if (left.length) {
    const per = Math.round(rem / left.length);
    left.forEach(
      (i, k) =>
        (out[i] = k === left.length - 1 ? rem - per * (left.length - 1) : per),
    );
  } else if (rem !== 0 && n) out[n - 1] += rem;
  return out;
}
function billingMonthOf(item: string, fallbackDate: string): string {
  const m = clean(item).match(/(\d{4})년\s*(\d{1,2})월/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  const d = clean(fallbackDate).slice(0, 10);
  return d ? `${d.slice(0, 7)}-01` : `${TODAY.slice(0, 7)}-01`;
}

// ── load workbooks ───────────────────────────────────────────────────────
/** Load a sheet keyed by its REAL header row (row 1; row 0 is a title banner). */
function loadSheet(file: string): Record<string, string>[] {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
  });
  const head = (aoa[1] || []).map((h) => clean(h));
  return aoa
    .slice(2)
    .filter((r) => r.some((c) => clean(c) !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      head.forEach((h, i) => {
        if (h) o[h] = clean(r[i]);
      });
      return o;
    });
}
/** First non-empty value among the given header aliases. */
function pick(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) if (clean(row[n])) return clean(row[n]);
  return "";
}

interface CustomerRow {
  name: string;
  group: string;
  phone: string;
  address: string;
  memo: string;
  rank: string;
  unit: string;
  pet: string;
  rent: number;
  deposit: number;
  start: string;
  end: string;
  familyPhone: string;
  owner: string;
  ownerPhone: string;
  extra: string;
  familyText: string;
}
interface SalesRow {
  date: string;
  customer: string;
  seller: string;
  items: string;
  total: number;
  owner: string;
  ownerPhone: string;
  start: string;
  end: string;
  familyPhone: string;
  extra: string;
  apt: string;
  memo: string;
}

async function main() {
  const customers: CustomerRow[] = loadSheet(CUSTOMERS_PATH)
    .filter((r) => pick(r, "고객명"))
    .map((r) => ({
      name: pick(r, "고객명"),
      group: pick(r, "고객그룹"),
      phone: pick(r, "연락처"),
      address: pick(r, "주소"),
      memo: pick(r, "메모"),
      rank: pick(r, "계급"),
      unit: pick(r, "부대"),
      pet: pick(r, "애완동물"),
      rent: num(pick(r, "월세")),
      deposit: num(pick(r, "보증금")),
      start: pick(r, "계약시작"),
      end: pick(r, "계약만료"),
      familyPhone: pick(r, "가족연락처"),
      owner: pick(r, "주인/생년월일", "주인"),
      ownerPhone: pick(r, "주인연락처"),
      extra: pick(r, "추가금액"),
      familyText: pick(r, "가족"),
    }));
  const sales: SalesRow[] = loadSheet(SALES_PATH)
    .filter((r) => pick(r, "판매일시") && pick(r, "고객명"))
    .map((r) => ({
      date: pick(r, "판매일시"),
      customer: pick(r, "고객명"),
      seller: pick(r, "판매자"),
      items: pick(r, "판매내역"),
      total: num(pick(r, "합계금액", "결제금액")),
      owner: pick(r, "주인/생년월일", "주인"),
      ownerPhone: pick(r, "주인연락처"),
      start: pick(r, "계약시작"),
      end: pick(r, "계약만료"),
      familyPhone: pick(r, "가족연락처"),
      extra: pick(r, "추가금액"),
      apt: pick(r, "아파트공과금"),
      memo: pick(r, "고객메모"),
    }));

  // dedup identical sales rows (same customer/date/amount/items)
  const seenSale = new Set<string>();
  const dedupSales = sales.filter((s) => {
    const k = `${normalizeName(s.customer)}|${s.date.slice(0, 10)}|${s.total}|${s.items
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .sort()
      .join(",")}`;
    if (seenSale.has(k)) return false;
    seenSale.add(k);
    return true;
  });
  const dupCount = sales.length - dedupSales.length;

  const salesByCustomer = new Map<string, SalesRow[]>();
  for (const s of dedupSales) {
    const k = normalizeName(s.customer);
    if (!salesByCustomer.has(k)) salesByCustomer.set(k, []);
    salesByCustomer.get(k)!.push(s);
  }

  // ── build landlords (dedup by primary name+phone, then by phone) ───────
  const landlords = new Map<
    string,
    {
      name: string;
      phone: string;
      birth: string | null;
      sex: string | null;
      business_type: string;
      rrn_encrypted: string;
      notes: string | null;
      family: Person[];
      phones: string[];
    }
  >();
  const landlordByPhone = new Map<string, string>(); // phone → landlord key
  function landlordKeyFor(
    ownerRaw: string,
    ownerPhoneRaw: string,
  ): string | null {
    const owner = clean(ownerRaw);
    if (!owner) return null;
    const people = parseLandlordPeople(owner)
      .map((p) => ({ ...p, name: cleanPersonName(p.name) }))
      .filter((p) => p.name);
    if (!people.length || /^\d+$/.test(people[0].name)) return null;
    const phones = extractAllPhones(ownerPhoneRaw);
    const primaryPhone = phones[0] || "";
    if (primaryPhone && landlordByPhone.has(primaryPhone))
      return landlordByPhone.get(primaryPhone)!;
    const key = `${normalizeName(people[0].name)}|${primaryPhone}`;
    if (!landlords.has(key)) {
      const isBiz =
        /주식회사|컴퍼니|\(주\)|그룹|홈주식|어패럴|하우징|홀딩스|아파트|건설/.test(
          owner,
        );
      const full = owner.match(/\d{6}-?\d{7}/);
      landlords.set(key, {
        name: people[0].name,
        phone: primaryPhone || "미등록",
        birth: people[0].birth,
        sex: people[0].sex,
        business_type: isBiz ? "사업자" : "개인",
        rrn_encrypted: full ? encryptRrn(full[0]) : "",
        notes: `원본: ${maskRrn(owner)}${clean(ownerPhoneRaw) ? ` / ${clean(ownerPhoneRaw)}` : ""}`,
        family: people.slice(1),
        phones,
      });
      if (primaryPhone) landlordByPhone.set(primaryPhone, key);
    }
    return key;
  }

  // ── build tenants (Customers.xlsx + any sales-only customers) ──────────
  interface TenantModel {
    key: string;
    name: string;
    phone: string;
    rank: string | null;
    status: string;
    branch: string | null;
    deros: string | null;
    dependent_status: string | null;
    notes: string | null;
    pets: number;
    family: { name: string; relationship: string; phone: string }[];
    // property/lease
    address: string;
    address_detail: string | null;
    property_type: string;
    property_status: string;
    monthly_rent: number;
    deposit: number;
    management_phone: string | null;
    unit: string | null;
    appliances: ApplianceModel[];
    recurring: RecurringModel[];
    landlordKey: string | null;
    lease_start: string | null;
    lease_end: string | null;
    lease_status: string;
    realty_fee: number | null;
    realty_fee_currency: string | null;
    lease_notes: string | null;
    fromSalesOnly: boolean;
  }
  const tenants = new Map<string, TenantModel>();

  for (const c of customers) {
    if (!clean(c.name)) continue;
    const key = normalizeName(c.name);
    if (tenants.has(key)) continue; // dup customer name (COLON Luis CARMELO) → keep first
    const moveout =
      c.group.toUpperCase().includes("MOVE OUT") ||
      /move\s*out|이사\s*나?감|퇴거/i.test(c.memo);
    const rank = normalizeRank(c.rank);
    const memo = c.memo;
    const tSales = salesByCustomer.get(key) || [];
    // owner/dates/rent/deposit are authoritative from Customers; fall back to Sales/memo.
    const ownerSale = tSales.find((s) => clean(s.owner));
    const ownerRaw = c.owner || ownerSale?.owner || "";
    const ownerPhoneRaw = c.ownerPhone || ownerSale?.ownerPhone || "";
    const rentOnly = tSales.find((s) => {
      const it = s.items.split(",").map((x) => x.trim());
      return it.length === 1 && /\d{4}년\s*\d{1,2}월/.test(it[0]);
    });
    const rentAny = tSales.find((s) => /\d{4}년\s*\d{1,2}월/.test(s.items));
    const monthly =
      c.rent || (rentOnly ? rentOnly.total : rentAny ? rentAny.total : 0);
    const deposit = c.deposit || parseDeposit(memo);
    const lease_start =
      c.start || clean(tSales.find((s) => clean(s.start))?.start ?? "") || null;
    const lease_end =
      c.end || clean(tSales.find((s) => clean(s.end))?.end ?? "") || null;
    const { address, detail } = parseAddressParts(c.address);
    const realtyFee =
      /realty\s*fee|리얼티\s*피|리얼티피/i.test(memo) ||
      tSales.some(
        (s) => /realty\s*fee/i.test(s.items) || /realty\s*fee/i.test(s.memo),
      );
    const noteParts: string[] = [];
    if (c.group && !moveout) noteParts.push(`지역: ${c.group}`);
    if (memo) noteParts.push(memo);

    let lease_status = "active";
    if (moveout) lease_status = "terminated";
    else if (lease_end && lease_end.slice(0, 10) < TODAY)
      lease_status = "expired";

    tenants.set(key, {
      key,
      name: c.name,
      phone: normalizePhone(c.phone),
      rank,
      status: moveout ? "inactive" : "active",
      branch: inferBranch(rank, memo),
      deros: parseDeros(memo),
      dependent_status: inferDependentStatus(`${memo} ${c.familyText}`),
      notes: noteParts.join(" | ") || null,
      pets: parsePetsColumn(c.pet) || parsePets(memo),
      family: [],
      unit: c.unit || null,
      address: address || c.address || "주소 미등록",
      address_detail: detail,
      property_type: detectPropertyType(c.address),
      property_status: moveout ? "vacant" : "occupied",
      monthly_rent: monthly,
      deposit,
      management_phone: parseManagementPhone(memo),
      appliances: parseAppliances(
        memo,
        [c.extra, ...tSales.map((s) => s.extra)].join(" "),
      ),
      recurring: parseRecurringCharges(c.extra),
      landlordKey: landlordKeyFor(ownerRaw, ownerPhoneRaw),
      lease_start,
      lease_end,
      lease_status,
      realty_fee: realtyFee ? 150 : null,
      realty_fee_currency: realtyFee ? "USD" : null,
      lease_notes: null,
      fromSalesOnly: false,
    });
  }

  // sales-only customers (in Sales, not in Customers) → minimal tenant
  for (const [key, tSales] of salesByCustomer) {
    if (tenants.has(key)) continue;
    const contractSale =
      tSales.find((s) => clean(s.start) && clean(s.end)) ||
      tSales.find((s) => clean(s.end)) ||
      tSales[0];
    const rentAny = tSales.find((s) => /\d{4}년\s*\d{1,2}월/.test(s.items));
    tenants.set(key, {
      key,
      name: contractSale.customer,
      phone: "",
      rank: null,
      status: "active",
      branch: null,
      deros: null,
      dependent_status: null,
      notes: "판매내역에만 존재 (Customers.xlsx 없음)",
      pets: 0,
      family: [],
      unit: null,
      address: "주소 미등록",
      address_detail: null,
      property_type: "house",
      property_status: "occupied",
      monthly_rent: rentAny ? rentAny.total : 0,
      deposit: 0,
      management_phone: null,
      appliances: [],
      recurring: [],
      landlordKey: landlordKeyFor(contractSale.owner, contractSale.ownerPhone),
      lease_start:
        clean(contractSale.start) ||
        (contractSale.date ? contractSale.date.slice(0, 10) : null),
      lease_end: clean(contractSale.end) || null,
      lease_status: "active",
      realty_fee: null,
      realty_fee_currency: null,
      lease_notes: "계약 정보 불완전",
      fromSalesOnly: true,
    });
  }

  // tenant family members from Sales 가족연락처
  const famSeen = new Set<string>();
  for (const s of dedupSales) {
    if (!clean(s.familyPhone)) continue;
    const t = tenants.get(normalizeName(s.customer));
    if (!t) continue;
    const fam = parseFamilyPhone(s.familyPhone);
    if (!fam.phone) continue;
    const dk = `${t.key}|${fam.phone}`;
    if (famSeen.has(dk)) continue;
    famSeen.add(dk);
    t.family.push(fam);
  }

  // default lease dates for tenants missing them
  for (const t of tenants.values()) {
    if (!t.lease_start) t.lease_start = "2026-01-01";
    if (!t.lease_end) t.lease_end = "2027-01-01";
  }

  // ── build payments ─────────────────────────────────────────────────────
  interface PaymentModel {
    tenantKey: string;
    payment_type: string;
    label: string | null;
    billing_month: string;
    amount_krw: number;
    payment_date: string;
    status: string;
    notes: string | null;
    bundle_id: string | null;
    utility: string | null;
  }
  // tenant memo lookup (for explicit per-utility amount parsing during allocation)
  const memoByTenant = new Map<string, string>();
  for (const c of customers) {
    const k = normalizeName(c.name);
    if (clean(c.name) && !memoByTenant.has(k)) memoByTenant.set(k, c.memo);
  }
  const payments: PaymentModel[] = [];
  let multiItemRows = 0;
  for (const s of dedupSales) {
    if (s.total <= 0) continue;
    const t = tenants.get(normalizeName(s.customer));
    if (!t) continue;
    const items = s.items
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!items.length) continue;
    if (items.length > 1) multiItemRows++;
    const extras = parseUtilityAmounts(s.extra, memoByTenant.get(t.key) || "");
    const amounts = allocate(items, s.total, t.monthly_rent, extras);
    const bundle = items.length > 1 ? randomUUID() : null;
    const noteParts: string[] = [];
    if (clean(s.extra)) noteParts.push(`추가: ${clean(s.extra)}`);
    if (clean(s.apt)) noteParts.push(`아파트공과금: ${clean(s.apt)}`);
    if (clean(s.seller)) noteParts.push(`판매자: ${clean(s.seller)}`);
    // 선불금 proration detail (e.g. "선불금 4,320,000(10월 7일치+3,525,000)") from the memo
    const prepayMatch = `${s.memo} ${memoByTenant.get(t.key) || ""}`.match(
      /선불금[^()]*\([^)]*\)/,
    );
    const prepayNote = prepayMatch
      ? prepayMatch[0].replace(/\s+/g, " ").trim()
      : null;
    items.forEach((item, i) => {
      const { type, utility } = categorize(item);
      const prepay = /선불금/.test(item) && prepayNote ? prepayNote : "";
      const note = [
        `항목: ${item}`,
        /realty\s*fee/i.test(item) ? "(REALTY FEE $150)" : "",
        prepay,
        ...noteParts,
      ]
        .filter(Boolean)
        .join(" | ");
      payments.push({
        tenantKey: t.key,
        payment_type: type,
        label: labelFor(item, type, utility),
        billing_month: billingMonthOf(item, s.date),
        amount_krw: amounts[i],
        payment_date: s.date.slice(0, 10),
        status: "paid",
        notes: note || null,
        bundle_id: bundle,
        utility,
      });
    });
  }

  // ── report ─────────────────────────────────────────────────────────────
  const tenantList = [...tenants.values()];
  const totalFamily = tenantList.reduce((a, t) => a + t.family.length, 0);
  const totalPets = tenantList.reduce((a, t) => a + t.pets, 0);
  const totalAppliances = tenantList.reduce(
    (a, t) => a + t.appliances.length,
    0,
  );
  const totalRecurring = tenantList.reduce((a, t) => a + t.recurring.length, 0);
  const activeRecurring = tenantList.reduce(
    (a, t) => a + t.recurring.filter((r) => r.active).length,
    0,
  );
  const landlordFamily = [...landlords.values()].reduce(
    (a, l) => a + l.family.length,
    0,
  );
  const utilBills = payments.filter((p) => p.utility).length;
  const paymentKrw = payments.reduce((a, p) => a + p.amount_krw, 0);

  console.log(
    `\n${"=".repeat(64)}\n  KINGS REALTY DATA IMPORT — ${WRITE ? "WRITE" : "DRY RUN (no writes)"}\n${"=".repeat(64)}`,
  );
  console.log(`Sources:`);
  console.log(`  Customers: ${CUSTOMERS_PATH}  (${customers.length} rows)`);
  console.log(
    `  Sales:     ${SALES_PATH}  (${sales.length} rows, ${dupCount} dup removed → ${dedupSales.length})`,
  );
  console.log(`\nPlanned inserts:`);
  console.log(
    `  landlords ............ ${landlords.size}  (+ ${landlordFamily} family, 1 placeholder)`,
  );
  console.log(
    `  tenants .............. ${tenants.size}  (${tenantList.filter((t) => t.status === "inactive").length} inactive, ${tenantList.filter((t) => t.fromSalesOnly).length} sales-only)`,
  );
  console.log(`  tenant family ........ ${totalFamily}`);
  console.log(`  tenant pets .......... ${totalPets}`);
  console.log(
    `  properties ........... ${tenants.size}  (+ ${totalAppliances} appliances)`,
  );
  console.log(
    `  leases ............... ${tenants.size}  (${tenantList.filter((t) => t.lease_status === "active").length} active, ${tenantList.filter((t) => t.lease_status === "expired").length} expired, ${tenantList.filter((t) => t.lease_status === "terminated").length} terminated)`,
  );
  console.log(
    `  payments ............. ${payments.length}  (₩${paymentKrw.toLocaleString()} total, ${multiItemRows} bundled rows)`,
  );
  console.log(`  utility_bills ........ ${utilBills}`);
  console.log(
    `  recurring_charge ..... ${totalRecurring}  (${activeRecurring} active / ${totalRecurring - activeRecurring} 월세포함·확인)`,
  );
  console.log(`\nDerived signals:`);
  console.log(
    `  DEROS parsed ......... ${tenantList.filter((t) => t.deros).length}`,
  );
  console.log(
    `  unit (부대) .......... ${tenantList.filter((t) => t.unit).length}`,
  );
  console.log(
    `  dependent status ..... ${tenantList.filter((t) => t.dependent_status).length}`,
  );
  console.log(
    `  realty fee on lease .. ${tenantList.filter((t) => t.realty_fee).length}`,
  );
  console.log(
    `  mgmt phone ........... ${tenantList.filter((t) => t.management_phone).length}`,
  );
  console.log(
    `  landlord birth/sex ... ${[...landlords.values()].filter((l) => l.birth).length} birth, ${[...landlords.values()].filter((l) => l.sex).length} sex`,
  );
  console.log(
    `  landlord rrn_enc ..... ${[...landlords.values()].filter((l) => l.rrn_encrypted).length} (full 13-digit RRNs only)`,
  );

  // anomalies
  const noAddr = tenantList.filter((t) => t.address === "주소 미등록");
  const badPhone = tenantList.filter(
    (t) => t.phone && !/^010-\d{4}-\d{4}$/.test(t.phone),
  );
  const noLandlord = tenantList.filter((t) => !t.landlordKey);
  console.log(`\nAnomalies (handled, FYI):`);
  console.log(
    `  tenants w/o address ......... ${noAddr.length}  ${noAddr
      .slice(0, 6)
      .map((t) => t.name)
      .join(", ")}`,
  );
  console.log(
    `  tenants w/ non-010 phone .... ${badPhone.length}  ${badPhone
      .slice(0, 6)
      .map((t) => `${t.name}:${t.phone}`)
      .join(", ")}`,
  );
  console.log(`  tenants → placeholder LL .... ${noLandlord.length}`);

  console.log(`\nSample mapped tenants:`);
  for (const t of tenantList.slice(0, 4))
    console.log(
      `  • ${t.name} | ${t.rank ?? "-"}/${t.branch ?? "-"} | ${t.status} | rent ₩${t.monthly_rent.toLocaleString()} dep ₩${t.deposit.toLocaleString()} | ${t.address}${t.address_detail ? " / " + t.address_detail : ""} | LL=${t.landlordKey ?? "placeholder"} | deros=${t.deros ?? "-"} | pets=${t.pets} fam=${t.family.length} appl=${t.appliances.length} rec=${t.recurring.length}`,
    );
  console.log(`Sample landlords:`);
  for (const l of [...landlords.values()].slice(0, 5))
    console.log(
      `  • ${l.name} | ${l.phone} | ${l.business_type} | birth=${l.birth ?? "-"} sex=${l.sex ?? "-"} | family=${l.family.map((f) => f.name).join(",") || "-"}`,
    );

  if (process.env.DEBUG) {
    console.log(`\nAppliances (first 20):`);
    for (const t of tenantList.filter((t) => t.appliances.length).slice(0, 20))
      console.log(
        `  • ${t.name}: ${t.appliances.map((a) => `${a.name}[${a.owner}${a.brand ? "·" + a.brand : ""}]`).join(", ")}`,
      );
    console.log(`\nRecurring charges (first 25):`);
    for (const t of tenantList.filter((t) => t.recurring.length).slice(0, 25))
      console.log(
        `  • ${t.name}: ${t.recurring.map((r) => `${r.label} ₩${r.amount?.toLocaleString()} ${r.active ? "ACTIVE" : "포함"}`).join(", ")}`,
      );
  }

  if (!WRITE) {
    console.log(
      `\n${"=".repeat(64)}\nDRY RUN complete — nothing written. Re-run with --write to load.\n${"=".repeat(64)}`,
    );
    return;
  }

  // ── WRITE (single transaction) ─────────────────────────────────────────
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: url }),
    }),
  });
  try {
    const admin = await db
      .selectFrom("user")
      .select("id")
      .where("role", "=", "admin")
      .executeTakeFirstOrThrow();
    const adminId = admin.id;

    // ensure 아파트공과금 utility type
    const utRows = await db.selectFrom("utility_type").selectAll().execute();
    const utMap = new Map(utRows.map((u) => [u.name, u.id]));
    for (const name of ["아파트공과금"]) {
      if (!utMap.has(name)) {
        const r = await db
          .insertInto("utility_type")
          .values({ name })
          .returning("id")
          .executeTakeFirstOrThrow();
        utMap.set(name, r.id);
      }
    }
    const baseLoc = (
      await db
        .selectFrom("base_location")
        .select("id")
        .orderBy("id")
        .executeTakeFirstOrThrow()
    ).id;

    await db.transaction().execute(async (tx) => {
      // clear any prior import (children before parents so FKs don't block)
      for (const t of [
        "utility_bill",
        "ledger_entry",
        "charge_item",
        "recurring_charge",
        "payment",
        "appliance",
        "lease",
        "property",
        "tenant_family_member",
        "tenant_pet",
        "tenant_note",
        "tenant",
        "landlord_family_member",
        "landlord",
      ] as const)
        await tx.deleteFrom(t).execute();

      // landlords
      const landlordId = new Map<string, number>();
      for (const [key, l] of landlords) {
        const r = await tx
          .insertInto("landlord")
          .values({
            name: l.name,
            phone: l.phone,
            birth: l.birth,
            sex: l.sex,
            business_type: l.business_type,
            rrn_encrypted: l.rrn_encrypted || null,
            notes: l.notes,
            created_by: adminId,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        landlordId.set(key, r.id);
        for (let i = 0; i < l.family.length; i++) {
          const f = l.family[i];
          if (!f.name || /^\d+$/.test(f.name)) continue;
          await tx
            .insertInto("landlord_family_member")
            .values({
              landlord_id: r.id,
              name: f.name,
              relationship: f.role || "가족",
              phone: l.phones[i + 1] || null,
              birth: f.birth,
              sex: f.sex,
            })
            .execute();
        }
      }
      const placeholder = (
        await tx
          .insertInto("landlord")
          .values({
            name: "미등록 집주인",
            phone: "미등록",
            notes: "판매내역에 임대인 정보가 없는 매물용",
            created_by: adminId,
          })
          .returning("id")
          .executeTakeFirstOrThrow()
      ).id;

      // tenants → property → lease → family/pets, payments
      for (const t of tenants.values()) {
        const tid = (
          await tx
            .insertInto("tenant")
            .values({
              name: t.name,
              phone: t.phone || "미등록",
              rank: t.rank,
              unit: t.unit,
              status: t.status,
              branch: t.branch,
              deros: t.deros,
              dependent_status: t.dependent_status,
              base_location_id: baseLoc,
              notes: t.notes,
              created_by: adminId,
              ...(t.status === "inactive" ? { archived_at: TODAY } : {}),
            })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;

        for (const rc of t.recurring)
          await tx
            .insertInto("recurring_charge")
            .values({
              tenant_id: tid,
              label: rc.label,
              type: rc.type,
              amount: rc.amount != null ? String(rc.amount) : null,
              active: rc.active,
              memo: rc.memo,
              created_by: adminId,
            })
            .execute();

        for (const f of t.family)
          await tx
            .insertInto("tenant_family_member")
            .values({
              tenant_id: tid,
              name: f.name,
              relationship: f.relationship,
              phone: f.phone || null,
            })
            .execute();
        for (let i = 0; i < t.pets; i++)
          await tx
            .insertInto("tenant_pet")
            .values({ tenant_id: tid, name: `반려견 ${i + 1}`, species: "dog" })
            .execute();

        const llId = t.landlordKey
          ? (landlordId.get(t.landlordKey) ?? placeholder)
          : placeholder;
        const pid = (
          await tx
            .insertInto("property")
            .values({
              landlord_id: llId,
              address: t.address,
              address_detail: t.address_detail,
              property_type: t.property_type,
              monthly_rent_krw: String(t.monthly_rent),
              deposit_krw: String(t.deposit),
              status: t.property_status,
              permission_status: "approved",
              management_phone: t.management_phone,
              created_by: adminId,
            })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;
        for (const a of t.appliances)
          await tx
            .insertInto("appliance")
            .values({
              property_id: pid,
              name: a.name,
              owner: a.owner,
              brand: a.brand,
              notes: a.notes,
            })
            .execute();

        const lid = (
          await tx
            .insertInto("lease")
            .values({
              property_id: pid,
              tenant_id: tid,
              start_date: t.lease_start!,
              end_date: t.lease_end!,
              monthly_rent_krw: String(t.monthly_rent),
              deposit_krw: String(t.deposit),
              status: t.lease_status,
              realty_fee: t.realty_fee != null ? String(t.realty_fee) : null,
              realty_fee_currency: t.realty_fee_currency,
              notes: t.lease_notes,
              created_by: adminId,
            })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id;

        for (const p of payments.filter((x) => x.tenantKey === t.key)) {
          const payId = (
            await tx
              .insertInto("payment")
              .values({
                lease_id: lid,
                payment_type: p.payment_type,
                label: p.label,
                billing_month: p.billing_month,
                amount_krw: String(p.amount_krw),
                currency_paid: "KRW",
                amount_paid: String(p.amount_krw),
                payment_method: "cash",
                payment_date: p.payment_date,
                status: p.status,
                received_by: adminId,
                notes: p.notes,
                bundle_id: p.bundle_id,
              })
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id;
          if (p.utility) {
            const utId = utMap.get(p.utility);
            if (utId)
              await tx
                .insertInto("utility_bill")
                .values({
                  lease_id: lid,
                  utility_type_id: utId,
                  billing_month: p.billing_month,
                  amount_krw: String(p.amount_krw),
                  status: "paid",
                  paid_to_company: false,
                  payment_id: payId,
                })
                .execute();
          }
        }
      }
    });

    console.log(
      `\n${"=".repeat(64)}\n✓ WRITE complete — committed in one transaction.\n${"=".repeat(64)}`,
    );
    for (const tName of [
      "landlord",
      "tenant",
      "property",
      "lease",
      "payment",
      "utility_bill",
      "recurring_charge",
      "appliance",
      "tenant_family_member",
      "tenant_pet",
      "landlord_family_member",
    ]) {
      const r = await db
        .selectFrom(tName as keyof DB)
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .executeTakeFirstOrThrow();
      console.log(`  ${tName.padEnd(24)} ${r.n}`);
    }
    await db.destroy();
  } catch (err) {
    await db.destroy();
    throw err;
  }
}

main().catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
