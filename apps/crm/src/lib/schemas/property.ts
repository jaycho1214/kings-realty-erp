/**
 * 매물 (property), 임대인 (landlord) and 비품 (appliance) forms.
 *
 * The address rule is the notable one: a new property must carry BOTH the
 * 지번 and 도로명 forms, which only a Postcodify-selected address has. A typed
 * but unselected address has neither, so requiring `address_jibeon` is what
 * keeps stored addresses normalised.
 */
import { z } from "zod";
import * as f from "./fields";

const ADDRESS_MESSAGE =
  "주소를 검색하여 선택해주세요. (지번·도로명 주소가 함께 저장됩니다)";
const MONEY_MESSAGE = "임대료와 보증금을 숫자로 입력해주세요.";

export const propertySchema = z.object({
  address: f.text(ADDRESS_MESSAGE),
  address_jibeon: f.text(ADDRESS_MESSAGE),
  address_detail: f.optionalText(),
  address_en: f.optionalText(),
  property_type: f.optionalText(),
  rooms: f.optionalCount("방 개수를 올바르게 입력해주세요."),
  bathrooms: f.optionalCount("욕실 개수를 올바르게 입력해주세요."),
  size_pyeong: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.union([z.null(), z.coerce.number().nonnegative()], {
      error: "평수를 올바르게 입력해주세요.",
    }),
  ),
  monthly_rent_krw: f.amountOrZero(MONEY_MESSAGE),
  deposit_krw: f.amountOrZero(MONEY_MESSAGE),
  status: f.enumWithDefault(
    ["vacant", "occupied", "move_out", "unavailable"] as const,
    "vacant",
  ),
  permission_status: f.enumWithDefault(
    ["pending", "approved", "rejected"] as const,
    "pending",
  ),
  landlord_id: f.id("임대인을 선택해주세요."),
  notes: f.optionalText(),
  management_phone: f.optionalText(),
  front_door_password: f.optionalText(),
  unit_password: f.optionalText(),
  moveout_date: f.optionalYmd("퇴거일을 올바르게 입력해주세요."),
});

export const landlordSchema = z.object({
  name: f.text("이름을 입력해주세요."),
  phone: f.text("전화번호를 입력해주세요."),
  email: f.optionalText(),
  address: f.optionalText(),
  business_type: f.optionalText(),
  sex: f.optionalText(),
  birth: f.optionalYmd("생년월일을 올바르게 입력해주세요."),
  bank_name: f.optionalText(),
  bank_account: f.optionalText(),
  account_holder: f.optionalText(),
  notes: f.optionalText(),
  // Only read when the caller may see sensitive data; the action re-checks.
  rrn: f.optionalText(),
});

export const landlordSettlementSchema = z.object({
  amount: f.positiveAmount("금액을 올바르게 입력해주세요."),
  settled_date: f.date("날짜를 올바르게 입력해주세요."),
  memo: f.optionalText(),
});

export const applianceSchema = z.object({
  property_id: f.id("매물을 선택해주세요."),
  name: f.text("비품명을 입력해주세요."),
  owner: f.enumWithDefault(
    ["landlord", "office", "tenant"] as const,
    "landlord",
  ),
  status: f.enumWithDefault(["normal", "repair", "broken"] as const, "normal"),
  brand: f.optionalText(),
  model_number: f.optionalText(),
  as_contact: f.optionalText(),
  notes: f.optionalText(),
});

export const applianceServiceRequestSchema = z.object({
  title: f.text("제목을 입력해주세요."),
  description: f.optionalText(),
  category: f.optionalText(),
});
