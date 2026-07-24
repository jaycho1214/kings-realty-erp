/**
 * 계약 (lease), 공과금 (utility bill) and 수납 (payment) forms.
 *
 * The lease dates share one message because the form presents them as a pair —
 * the summary line stays the sentence staff already know, while the per-field
 * markers show which of the two is actually wrong.
 */
import { z } from "zod";
import * as f from "./fields";

const DATES_MESSAGE = "계약 시작일과 종료일을 올바르게 입력해주세요.";

export const leaseSchema = z
  .object({
    property_id: f.id("매물을 선택해주세요."),
    tenant_id: f.id("세입자를 선택해주세요."),
    start_date: f.date(DATES_MESSAGE),
    end_date: f.date(DATES_MESSAGE),
    monthly_rent_krw: f.amountOrZero("월세를 0 이상의 숫자로 입력해주세요."),
    deposit_krw: f.amountOrZero("보증금을 0 이상의 숫자로 입력해주세요."),
    status: f.enumWithDefault(
      ["active", "pending", "expired", "terminated"] as const,
      "active",
    ),
    notes: f.optionalText(),
  })
  .superRefine((v, ctx) => {
    if (v.end_date <= v.start_date) {
      ctx.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "계약 종료일은 시작일 이후여야 합니다.",
      });
    }
  });

export const utilityBillSchema = z.object({
  billing_month: f.date("청구 월을 올바르게 입력해주세요."),
  utility_type_id: f.id("공과금 종류를 선택해주세요."),
  amount_krw: f.amountOrZero("금액을 올바르게 입력해주세요."),
  bearer: f.enumWithDefault(
    ["tenant", "landlord", "office"] as const,
    "tenant",
  ),
  payee: f.optionalText(),
  notes: f.optionalText(),
});

export const depositSettlementSchema = z.object({
  // A JSON blob built by the client editor; shape-checked by the action.
  deductions: f.optionalText(),
  refund_method: f.optionalText(),
  refunded_date: f.optionalYmd("환급일을 올바르게 입력해주세요."),
});

export const paymentSchema = z.object({
  lease_id: f.id("계약을 선택해주세요."),
  payment_type: f.text("수납 유형을 선택해주세요."),
  exchange_rate_id: f.optionalId(),
  // <input type="month"> → "YYYY-MM"; the action appends "-01".
  billing_month: f.month("청구 월과 납부일을 올바르게 입력해주세요."),
  amount_krw: f.amountOrZero("금액을 올바르게 입력해주세요."),
  currency_paid: f.enumWithDefault(["KRW", "USD"] as const, "KRW"),
  amount_paid: f.amountOrZero("납부 금액을 올바르게 입력해주세요."),
  payment_method: f.enumWithDefault(
    ["cash", "card", "transfer"] as const,
    "transfer",
  ),
  payment_date: f.date("청구 월과 납부일을 올바르게 입력해주세요."),
  status: f.enumWithDefault(["pending", "paid", "overdue"] as const, "pending"),
  notes: f.optionalText(),
});

/**
 * The 수납 등록 collector's header. Its line items and per-denomination amounts
 * are indexed (`items[0].amount_krw`, `usd100_rate`), which a flat object schema
 * can't express — the action still loops over those itself.
 */
export const bulkPaymentHeaderSchema = z.object({
  lease_id: f.id("세입자를 선택해주세요."),
  billing_month: f.month("청구 월과 납부일을 올바르게 입력해주세요."),
  payment_method: f.enumWithDefault(
    ["cash", "card", "transfer"] as const,
    "cash",
  ),
  payment_date: f.date("청구 월과 납부일을 올바르게 입력해주세요."),
  notes: f.optionalText(),
});
