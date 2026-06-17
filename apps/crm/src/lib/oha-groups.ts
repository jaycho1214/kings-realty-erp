/**
 * OHA(해외주택수당) 기준표 그룹 정의 + 계급→그룹 매핑.
 *
 * 실제 OHA Rates 시트는 계급을 그룹으로 묶고(E1~E4 / E5~O4 / W5,O5 / O6~O10),
 * 공과금(Utility)·MIHA(1회성) 정액 항목이 따로 있다. 이 파일은 DB 의존성이 없는
 * 순수 모듈이라 서버/클라이언트 양쪽에서 import 할 수 있다(금액 조회는 lib/oha.ts).
 */

export type OhaGroupCode =
  | "E1-E4"
  | "E5-O4"
  | "W5-O5"
  | "O6-O10"
  | "UTILITY"
  | "MIHA";

export type OhaGroupKind = "housing" | "utility" | "miha";

export interface OhaGroupConfig {
  code: OhaGroupCode;
  kind: OhaGroupKind;
  /** Compact label for non-highlighted rows. */
  shortLabel: string;
  /** Full 계급 detail shown on the tenant's own/highlighted row. */
  detailLabel: string;
  /** One-time charge (MIHA) — renders a 1회성 tag. */
  oneTime: boolean;
  /** Display order. */
  sort: number;
}

export const OHA_GROUPS: OhaGroupConfig[] = [
  {
    code: "E1-E4",
    kind: "housing",
    shortLabel: "E1~E4",
    detailLabel: "E1~E4",
    oneTime: false,
    sort: 1,
  },
  {
    code: "E5-O4",
    kind: "housing",
    shortLabel: "E5~O4",
    detailLabel: "E5~E9, W1~W4, O1E~O3E, O1~O4",
    oneTime: false,
    sort: 2,
  },
  {
    code: "W5-O5",
    kind: "housing",
    shortLabel: "W5/O5",
    detailLabel: "W5, O5",
    oneTime: false,
    sort: 3,
  },
  {
    code: "O6-O10",
    kind: "housing",
    shortLabel: "O6~O10",
    detailLabel: "O6~O10",
    oneTime: false,
    sort: 4,
  },
  {
    code: "UTILITY",
    kind: "utility",
    shortLabel: "공과금",
    detailLabel: "공과금 (Utility)",
    oneTime: false,
    sort: 5,
  },
  {
    code: "MIHA",
    kind: "miha",
    shortLabel: "MIHA",
    detailLabel: "MIHA",
    oneTime: true,
    sort: 6,
  },
];

/**
 * Map a stored rank ("E-5", "O-3", "W-2") to its OHA housing group code.
 * Returns null for blank/unknown ranks. Utility/MIHA are never a rank's group.
 */
export function rankToGroupCode(
  rank: string | null | undefined,
): OhaGroupCode | null {
  if (!rank) return null;
  const m = /^([EWO])-?(\d+)/i.exec(rank.trim());
  if (!m) return null;
  const branch = m[1].toUpperCase();
  const num = Number(m[2]);
  if (!Number.isFinite(num)) return null;

  if (branch === "E") {
    if (num >= 1 && num <= 4) return "E1-E4";
    if (num >= 5 && num <= 9) return "E5-O4";
    return null;
  }
  if (branch === "W") {
    if (num >= 1 && num <= 4) return "E5-O4";
    if (num === 5) return "W5-O5";
    return null;
  }
  // branch === "O"
  if (num >= 1 && num <= 4) return "E5-O4";
  if (num === 5) return "W5-O5";
  if (num >= 6) return "O6-O10"; // O-6..O-11
  return null;
}
