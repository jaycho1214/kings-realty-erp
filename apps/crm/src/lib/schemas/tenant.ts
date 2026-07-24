/**
 * 세입자 (tenant) forms.
 *
 * `name`/`phone` were previously written straight to the DB with only the
 * browser's `required` guarding them — a direct action invocation could insert a
 * blank tenant. They are required here, matching what the form already claims.
 */
import { z } from "zod";
import * as f from "./fields";

export const tenantSchema = z.object({
  name: f.text("이름을 입력해주세요."),
  phone: f.text("전화번호를 입력해주세요."),
  email: f.optionalText(),
  sex: f.optionalText(),
  birth: f.optionalYmd("생년월일을 올바르게 입력해주세요."),
  branch: f.optionalText(),
  rank: f.optionalText(),
  unit: f.optionalText(),
  deros: f.optionalYmd("DEROS를 올바르게 입력해주세요."),
  military_id: f.optionalText(),
  dependent_status: f.optionalText(),
  dependent_count: f.optionalCount("부양가족 수를 올바르게 입력해주세요."),
  base_location_id: f.id("기지를 선택해주세요."),
});

export const familyMemberSchema = z.object({
  name: f.text("이름을 입력해주세요."),
  relationship: f.text("관계를 선택해주세요."),
  sex: f.optionalText(),
  birth: f.optionalYmd("생년월일을 올바르게 입력해주세요."),
  phone: f.optionalText(),
  notes: f.optionalText(),
});

export const petSchema = z.object({
  name: f.text("이름을 입력해주세요."),
  species: f.text("종류를 선택해주세요."),
  breed: f.optionalText(),
  size: f.optionalText(),
  notes: f.optionalText(),
});

/** 원장 manual entry. USD requires a rate, which is a cross-field rule. */
export const ledgerEntrySchema = z
  .object({
    direction: f.enumWithDefault(
      ["receipt", "disbursement"] as const,
      "receipt",
    ),
    entry_date: f.date("날짜를 올바르게 입력해주세요."),
    category: f.optionalText(),
    currency: f.enumWithDefault(["KRW", "USD"] as const, "KRW"),
    amount: f.positiveAmount("금액을 올바르게 입력해주세요."),
    exchange_rate: f.optionalText(),
    denomination: f.optionalCount("권종을 올바르게 입력해주세요."),
    exchange_vendor_id: f.optionalId(),
    description: f.optionalText(),
  })
  .superRefine((v, ctx) => {
    if (v.currency !== "USD") return;
    const rate = Number(v.exchange_rate);
    if (!v.exchange_rate || !Number.isFinite(rate) || rate <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["exchange_rate"],
        message: "환율을 올바르게 입력해주세요.",
      });
    }
  });

export const chargeSchema = z.object({
  type: f.optionalText(),
  recurrence: f.enumWithDefault(["one_time", "monthly"] as const, "one_time"),
  amount: f.positiveAmount("금액을 올바르게 입력해주세요."),
  currency: f.enumWithDefault(["KRW", "USD"] as const, "KRW"),
  billing_month: f.optionalMonth("청구 월을 올바르게 입력해주세요."),
  due_date: f.optionalYmd("납부 기한을 올바르게 입력해주세요."),
  memo: f.optionalText(),
});

/** 수납(연결) — settle one outstanding charge. */
export const settleChargeSchema = z.object({
  amount: f.positiveAmount("금액을 올바르게 입력해주세요."),
  payment_method: f.enumWithDefault(
    ["cash", "card", "transfer"] as const,
    "cash",
  ),
  payment_date: f.optionalYmd("납부일을 올바르게 입력해주세요."),
});

/**
 * 정기 청구 정의. A blank amount is meaningful — it marks the charge 변동
 * (entered per month) — so it maps to null rather than being rejected.
 */
export const recurringChargeSchema = z.object({
  label: f.text("항목 이름을 입력해주세요."),
  type: f.optionalText(),
  currency: f.enumWithDefault(["KRW", "USD"] as const, "KRW"),
  due_day: z.preprocess((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 31 ? Math.floor(n) : 10;
  }, z.number().int().min(1).max(31)),
  amount: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.union([z.null(), z.coerce.number().nonnegative()], {
      error: "금액을 올바르게 입력해주세요.",
    }),
  ),
  start_month: f.optionalMonth("시작 월을 올바르게 입력해주세요."),
  end_month: f.optionalMonth("종료 월을 올바르게 입력해주세요."),
});

export const baseLocationSchema = z.object({
  name: f.text("기지 이름을 입력해주세요."),
  name_ko: f.optionalText(),
});

export const inspectionDraftSchema = z.object({
  type: f.enumWithDefault(["move_in", "move_out"] as const, "move_in"),
  inspected_at: f.optionalDate("점검일을 올바르게 입력해주세요."),
});

export const tenantStatusSchema = z.object({
  status: f.strictEnum(
    ["active", "inactive"] as const,
    "올바르지 않은 상태입니다.",
  ),
  moved_out_on: f.optionalYmd("올바르지 않은 날짜입니다."),
});
