/**
 * 새 고객 one-page intake.
 *
 * The old ERP's mental model: one flat form, fill what you know. Name + phone
 * make a tenant; an address escalates to the full landlord→property→lease chain
 * with sensible defaults for anything left blank.
 *
 * The address is the switch, so the cross-field rules (a new property needs an
 * owner; contract fields without an address would be silently dropped) live in
 * `superRefine` rather than on individual fields. The schema is a factory
 * because the contract dates default off "today" in Seoul — passing it in keeps
 * this module pure and unit-testable.
 */
import { z } from "zod";
import * as f from "./fields";
import { addMonths } from "../date";

export function customerIntakeSchema(opts: { today: string }) {
  return (
    z
      .object({
        // --- 고객 ---
        name: f.text("이름을 입력해주세요."),
        phone: f.text("전화번호를 입력해주세요."),
        rank: f.optionalText(),
        unit: f.optionalText(),
        base_location_id: f.id("기지를 선택해주세요."),

        // --- 주거 (all optional; the address is what escalates) ---
        address: f.optionalText(),
        address_jibeon: f.optionalText(),
        address_en: f.optionalText(),
        address_detail: f.optionalText(),
        landlord_id: f.optionalId(),
        landlord_name: f.optionalText(),
        landlord_phone: f.optionalText(),
        monthly_rent_krw: f.amountOrZero(
          "월세를 0 이상의 숫자로 입력해주세요.",
        ),
        deposit_krw: f.amountOrZero("보증금을 0 이상의 숫자로 입력해주세요."),
        start_date: f.optionalYmd("계약 시작일을 올바르게 입력해주세요."),
        end_date: f.optionalYmd("계약 종료일을 올바르게 입력해주세요."),

        memo: f.optionalText(),
      })
      // Fill the contract term before the cross-field rules run, so the date
      // comparison sees the same values the action will persist.
      .transform((v) => {
        if (!v.address) return { ...v, startDate: null, endDate: null };
        const startDate = v.start_date || opts.today;
        return {
          ...v,
          startDate,
          endDate: v.end_date || addMonths(startDate, 12),
        };
      })
      .superRefine((v, ctx) => {
        if (v.address) {
          // property.landlord_id is NOT NULL — a new property needs an owner.
          if (!v.landlord_id && !v.landlord_name) {
            ctx.addIssue({
              code: "custom",
              path: ["landlord_name"],
              message:
                "집주인 이름을 입력해주세요. (주소를 입력할 때 필요합니다)",
            });
          }
          if (v.endDate && v.startDate && v.endDate <= v.startDate) {
            ctx.addIssue({
              code: "custom",
              path: ["end_date"],
              message: "계약 종료일은 시작일 이후여야 합니다.",
            });
          }
          return;
        }
        // Contract fields without an address would be silently lost — refuse.
        if (
          v.monthly_rent_krw > 0 ||
          v.deposit_krw > 0 ||
          v.landlord_name ||
          v.landlord_id
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["address"],
            message: "계약 정보를 입력하려면 주소를 입력해주세요.",
          });
        }
      })
  );
}

type CustomerIntakeInput = z.infer<ReturnType<typeof customerIntakeSchema>>;

export interface CustomerIntakePlan {
  tenant: {
    name: string;
    phone: string;
    rank: string | null;
    unit: string | null;
    baseLocationId: number;
  };
  /** null when no 주소 entered → bare tenant only. */
  housing: {
    address: string;
    addressJibeon: string | null;
    addressEn: string | null;
    addressDetail: string | null;
    landlord:
      | { mode: "existing"; landlordId: number }
      | { mode: "new"; name: string; phone: string | null };
    monthlyRentKrw: string;
    depositKrw: string;
    startDate: string;
    endDate: string;
  } | null;
  memo: string | null;
}

export function normalizePhone(s: string): string {
  return s.replace(/\D/g, "");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Pure mapping from validated input to the plan the action executes. */
export function toIntakePlan(v: CustomerIntakeInput): CustomerIntakePlan {
  return {
    tenant: {
      name: v.name,
      phone: v.phone,
      rank: v.rank,
      unit: v.unit,
      baseLocationId: v.base_location_id,
    },
    housing:
      v.address && v.startDate && v.endDate
        ? {
            address: v.address,
            addressJibeon: v.address_jibeon,
            addressEn: v.address_en,
            addressDetail: v.address_detail,
            landlord: v.landlord_id
              ? { mode: "existing", landlordId: v.landlord_id }
              : {
                  mode: "new",
                  name: v.landlord_name ?? "",
                  phone: v.landlord_phone,
                },
            monthlyRentKrw: String(v.monthly_rent_krw),
            depositKrw: String(v.deposit_krw),
            startDate: v.startDate,
            endDate: v.endDate,
          }
        : null,
    memo: v.memo,
  };
}
