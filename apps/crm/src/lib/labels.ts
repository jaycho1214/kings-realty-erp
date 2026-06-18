/**
 * Shared Korean enum→label maps used across detail/list pages.
 *
 * Only maps that are genuinely identical wherever they appear live here. Maps
 * whose labels are context-specific (e.g. a generic `statusMap` that means
 * different things for payments vs. properties vs. service requests, or the
 * richer `{ label, variant }` payment-type map used on the payments pages) stay
 * local to their page on purpose.
 */

/** 성별 */
export const sexMap: Record<string, string> = { M: "남성", F: "여성" };

/** 군 (US military branch) */
export const branchMap: Record<string, string> = {
  army: "Army",
  air_force: "Air Force",
  navy: "Navy",
  marines: "Marines",
  space_force: "Space Force",
  coast_guard: "Coast Guard",
};

/** 계약 상태 */
export const leaseStatusMap: Record<string, string> = {
  draft: "작성중",
  active: "유효",
  renewed: "갱신",
  expired: "만료",
  terminated: "해지",
  pending: "대기",
};

/** 수납 상태 */
export const paymentStatusMap: Record<string, string> = {
  paid: "납부완료",
  pending: "미납",
  overdue: "연체",
};

/** 수납 항목 유형 (label only) */
export const paymentTypeMap: Record<string, string> = {
  rent: "월세",
  utility: "공과금",
  management: "관리비",
  parking: "주차",
  deposit: "보증금",
  prepayment: "선불금",
  service: "AS비",
};

/** 결제 수단 */
export const methodMap: Record<string, string> = {
  cash: "현금",
  card: "카드",
  transfer: "계좌이체",
};

/**
 * Tender currency label. "MIXED" (USD + KRW hybrid payment) renders as 혼합;
 * "USD"/"KRW" (and anything else) pass through unchanged.
 */
export function currencyPaidLabel(currency: string | null | undefined): string {
  if (currency === "MIXED") return "혼합";
  return currency ?? "-";
}
