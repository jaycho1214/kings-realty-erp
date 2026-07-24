/**
 * Pure parser for the 새 고객 one-page intake. Turns FormData into a plan the
 * createCustomerIntake server action executes. No DB, no crypto; only relative
 * imports — unit-testable with `node --test`.
 *
 * The old ERP's mental model: one flat form, fill what you know. Name + phone
 * make a tenant; an address escalates to the full landlord→property→lease
 * chain with sensible defaults for anything left blank.
 */
import { addMonths } from "./date";
import { ValidationError } from "./validation-error";

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

export function parseCustomerIntake(
  formData: FormData,
  opts: { today: string },
): CustomerIntakePlan {
  const str = (k: string): string => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const strOrNull = (k: string): string | null => str(k) || null;
  const posInt = (k: string): number => {
    const n = Number(str(k));
    return Number.isInteger(n) && n > 0 ? n : 0;
  };

  // --- 고객 ---
  const name = str("name");
  const phone = str("phone");
  if (!name) throw new ValidationError("이름을 입력해주세요.");
  if (!phone) throw new ValidationError("전화번호를 입력해주세요.");
  const baseLocationId = posInt("base_location_id");
  if (!baseLocationId) throw new ValidationError("기지를 선택해주세요.");

  // --- 주거 (주소가 스위치) ---
  const address = str("address");
  let housing: CustomerIntakePlan["housing"] = null;
  if (address) {
    const landlordId = posInt("landlord_id");
    let landlord: NonNullable<CustomerIntakePlan["housing"]>["landlord"];
    if (landlordId) {
      landlord = { mode: "existing", landlordId };
    } else {
      const landlordName = str("landlord_name");
      // property.landlord_id is NOT NULL — a new property needs an owner.
      if (!landlordName) {
        throw new ValidationError(
          "집주인 이름을 입력해주세요. (주소를 입력할 때 필요합니다)",
        );
      }
      landlord = {
        mode: "new",
        name: landlordName,
        phone: strOrNull("landlord_phone"),
      };
    }

    const startDate = str("start_date") || opts.today;
    const endDate = str("end_date") || addMonths(startDate, 12);
    if (Number.isNaN(new Date(startDate).getTime())) {
      throw new ValidationError("계약 시작일을 올바르게 입력해주세요.");
    }
    if (Number.isNaN(new Date(endDate).getTime())) {
      throw new ValidationError("계약 종료일을 올바르게 입력해주세요.");
    }
    if (endDate <= startDate) {
      throw new ValidationError("계약 종료일은 시작일 이후여야 합니다.");
    }

    const monthlyRentKrw = str("monthly_rent_krw") || "0";
    const depositKrw = str("deposit_krw") || "0";
    const rentNum = Number(monthlyRentKrw);
    if (!Number.isFinite(rentNum) || rentNum < 0) {
      throw new ValidationError("월세를 0 이상의 숫자로 입력해주세요.");
    }
    const depositNum = Number(depositKrw);
    if (!Number.isFinite(depositNum) || depositNum < 0) {
      throw new ValidationError("보증금을 0 이상의 숫자로 입력해주세요.");
    }

    housing = {
      address,
      addressJibeon: strOrNull("address_jibeon"),
      addressEn: strOrNull("address_en"),
      addressDetail: strOrNull("address_detail"),
      landlord,
      monthlyRentKrw,
      depositKrw,
      startDate,
      endDate,
    };
  } else if (
    str("monthly_rent_krw") ||
    str("deposit_krw") ||
    str("landlord_name") ||
    posInt("landlord_id")
  ) {
    // Contract fields without an address would be silently lost — refuse.
    throw new ValidationError("계약 정보를 입력하려면 주소를 입력해주세요.");
  }

  return {
    tenant: {
      name,
      phone,
      rank: strOrNull("rank"),
      unit: strOrNull("unit"),
      baseLocationId,
    },
    housing,
    memo: strOrNull("memo"),
  };
}
