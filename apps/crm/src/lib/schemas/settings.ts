/**
 * 설정 (settings) forms — utility types, service categories, exchange vendors,
 * bill presets — plus the 환율 entry form and the 할 일 dialog.
 *
 * These are small forms, but the field names are easy to get wrong: the vendor
 * form submits `default_rate` (not a "base" rate) and the 환율 form submits
 * `date`. form-names.test.ts is what keeps those honest.
 */
import { z } from "zod";
import * as f from "./fields";

export const utilityTypeSchema = z.object({
  name: f.text("유형 이름을 입력해주세요."),
});

export const serviceCategorySchema = z.object({
  value: f.text("카테고리 값과 이름을 입력해주세요."),
  label: f.text("카테고리 값과 이름을 입력해주세요."),
});

/** Renaming an existing category only edits the label; `value` is the key. */
export const serviceCategoryLabelSchema = z.object({
  label: f.text("카테고리 이름을 입력해주세요."),
});

export const exchangeVendorSchema = z.object({
  name: f.text("환전업체 이름을 입력해주세요."),
  denominations: f.optionalText(),
  /** Blank is allowed (no house rate); a present value must be > 0. */
  default_rate: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.union([z.null(), z.coerce.number().positive()], {
      error: "기준 환율을 올바르게 입력해주세요.",
    }),
  ),
  phone: f.optionalText(),
  memo: f.optionalText(),
});

/**
 * bill_preset — the shared payment/charge type catalog. `is_variable` marks a
 * preset whose amount is entered per month, so it forces default_amount to null
 * regardless of what the (then-hidden) amount input still held.
 */
export const billPresetSchema = z
  .object({
    label: f.text("이름을 입력해주세요."),
    type: f.optionalText(),
    is_variable: f.checkbox(),
    default_due_day: z.preprocess((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 && n <= 31 ? Math.floor(n) : 10;
    }, z.number().int().min(1).max(31)),
    default_amount: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? null : v),
      z.union([z.null(), z.coerce.number().nonnegative()], {
        error: "금액을 올바르게 입력해주세요.",
      }),
    ),
    default_currency: f.enumWithDefault(["KRW", "USD"] as const, "KRW"),
    variant: f.textWithDefault("outline"),
  })
  .transform((v) => ({
    ...v,
    type: v.type ?? v.label,
    default_amount: v.is_variable ? null : v.default_amount,
  }));

/** The 환율 form posts one `rate_<denom>` per denomination; the action loops
 *  over those itself, so only the shared date is schema-checked here. */
export const exchangeRateSchema = z.object({
  date: f.ymd("날짜를 입력해주세요."),
});

/** 점검 항목 그룹 (section). */
export const inspectionSectionSchema = z.object({
  label_ko: f.text("필수 항목을 입력해주세요."),
  label_en: f.optionalText(),
  repeatable: f.checkbox(),
});

/** 점검 항목 (item) — a section's row, optionally under a subgroup. */
export const inspectionItemSchema = inspectionSectionSchema.extend({
  subgroup_ko: f.optionalText(),
  subgroup_en: f.optionalText(),
});

export const createUserSchema = z.object({
  name: f.text("필수 항목을 입력해주세요."),
  email: f.text("필수 항목을 입력해주세요."),
  password: f.text("필수 항목을 입력해주세요."),
});

/**
 * 일정 (calendar event). `is_all_day` is unusual: the dialog posts the string
 * "false" to mean a timed event, so absence means all-day — the inverse of a
 * normal checkbox.
 */
export const calendarEventSchema = z.object({
  title: f.text("제목과 날짜는 필수입니다."),
  date: f.ymd("제목과 날짜는 필수입니다."),
  end_date: f.optionalYmd("종료일을 올바르게 입력해주세요."),
  description: f.optionalText(),
  category: f.textWithDefault("general"),
  color: f.textWithDefault("primary"),
  urgency: f.textWithDefault("normal"),
  location: f.optionalText(),
  property_id: f.optionalId(),
  tenant_id: f.optionalId(),
  is_all_day: z.preprocess((v) => v !== "false", z.boolean()),
  start_time: f.optionalText(),
  end_time: f.optionalText(),
  attendees: f.optionalText(),
});

export const realtyFeeDefaultSchema = z.object({
  currency: f.enumWithDefault(["KRW", "USD"] as const, "KRW"),
  amount: f.amountOrZero("금액을 올바르게 입력해주세요."),
});
