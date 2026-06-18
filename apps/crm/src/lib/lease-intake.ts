/**
 * Pure parser for the 계약서 일괄 등록 dialog. Turns the dialog's FormData into a
 * normalized plan the createLeaseIntake server action can execute. No DB, no
 * crypto, no `@/` imports — kept pure so it is unit-testable with `node --test`.
 *
 * RRN values are passed through RAW here (never encrypted) and only when
 * opts.canViewRrn is true; the server action encrypts them with encryptRrn.
 */

export interface CoLessorInput {
  name: string;
  relationship: string;
  phone: string | null;
  rrn: string | null;
}

export type LandlordPlan =
  | { mode: "existing"; landlordId: number }
  | {
      mode: "new";
      name: string;
      phone: string;
      email: string | null;
      address: string | null;
      rrn: string | null;
      coLessors: CoLessorInput[];
    };

export type PropertyPlan =
  | { mode: "existing"; propertyId: number }
  | {
      mode: "new";
      address: string;
      addressJibeon: string | null;
      addressDetail: string | null;
      addressEn: string | null;
      sizePyeong: number | null;
      propertyType: string;
    };

export type TenantPlan =
  | { mode: "existing"; tenantId: number }
  | {
      mode: "new";
      name: string;
      phone: string;
      rank: string | null;
      militaryId: string | null;
      unit: string | null;
      email: string | null;
      baseLocationId: number;
    };

export interface LeaseTermsPlan {
  startDate: string;
  endDate: string;
  monthlyRentKrw: string;
  depositKrw: string;
  notes: string | null;
}

export interface LeaseIntakePlan {
  /** null when property.mode === "existing" (landlord comes from the property). */
  landlord: LandlordPlan | null;
  property: PropertyPlan;
  tenant: TenantPlan;
  terms: LeaseTermsPlan;
}

const PROPERTY_TYPES = new Set(["apartment", "house", "officetel", "villa"]);

export function parseLeaseIntake(
  formData: FormData,
  opts: { canViewRrn: boolean },
): LeaseIntakePlan {
  const str = (k: string): string => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const strOrNull = (k: string): string | null => str(k) || null;
  const posInt = (k: string): number => {
    const n = Number(str(k));
    return Number.isInteger(n) && n > 0 ? n : 0;
  };

  // --- Property (parsed first; decides whether a landlord plan is needed) ---
  // Mode is inferred, not declared: a picked suggestion sends *_id (→ existing);
  // free text sends only the name/address (→ new).
  let property: PropertyPlan;
  const propertyId = posInt("property_id");
  if (propertyId) {
    property = { mode: "existing", propertyId };
  } else {
    const address = str("property_address");
    if (!address) throw new Error("임대물건 주소를 검색하여 선택해주세요.");
    // A Postcodify selection always carries 지번; its absence means a typed-but-
    // unselected address, which we refuse so every new property is normalized.
    const addressJibeon = strOrNull("property_address_jibeon");
    if (!addressJibeon) {
      throw new Error(
        "주소를 검색하여 선택해주세요. (지번·도로명 주소가 함께 저장됩니다)",
      );
    }
    const sizeRaw = str("property_size_pyeong");
    const sizePyeong = sizeRaw ? Number(sizeRaw) : null;
    if (sizePyeong !== null && !Number.isFinite(sizePyeong)) {
      throw new Error("평수를 숫자로 입력해주세요.");
    }
    const propertyType = str("property_type") || "apartment";
    if (!PROPERTY_TYPES.has(propertyType)) {
      throw new Error("매물 종류를 선택해주세요.");
    }
    property = {
      mode: "new",
      address,
      addressJibeon,
      addressDetail: strOrNull("property_address_detail"),
      addressEn: strOrNull("property_address_en"),
      sizePyeong,
      propertyType,
    };
  }

  // --- Landlord (only when creating a new property) ---
  let landlord: LandlordPlan | null = null;
  if (property.mode === "new") {
    const landlordId = posInt("landlord_id");
    if (landlordId) {
      landlord = { mode: "existing", landlordId };
    } else {
      const name = str("landlord_name");
      const phone = str("landlord_phone");
      if (!name) throw new Error("임대인 성명을 입력해주세요.");
      if (!phone) throw new Error("임대인 핸드폰을 입력해주세요.");
      const coLessors: CoLessorInput[] = [];
      for (let i = 0; ; i++) {
        const raw = formData.get(`lessor[${i}].name`);
        if (raw === null) break; // no more rows
        const cn = typeof raw === "string" ? raw.trim() : "";
        if (!cn) continue; // blank row → skip but keep scanning
        coLessors.push({
          name: cn,
          relationship: strOrNull(`lessor[${i}].relationship`) ?? "other",
          phone: strOrNull(`lessor[${i}].phone`),
          rrn: opts.canViewRrn ? strOrNull(`lessor[${i}].rrn`) : null,
        });
      }
      landlord = {
        mode: "new",
        name,
        phone,
        email: strOrNull("landlord_email"),
        address: strOrNull("landlord_address"),
        rrn: opts.canViewRrn ? strOrNull("landlord_rrn") : null,
        coLessors,
      };
    }
  }

  // --- Tenant ---
  let tenant: TenantPlan;
  const tenantId = posInt("tenant_id");
  if (tenantId) {
    tenant = { mode: "existing", tenantId };
  } else {
    const name = str("tenant_name");
    const phone = str("tenant_phone");
    if (!name) throw new Error("세입자 성명을 입력해주세요.");
    if (!phone) throw new Error("세입자 핸드폰을 입력해주세요.");
    const baseLocationId = posInt("base_location_id");
    if (!baseLocationId) throw new Error("기지를 선택해주세요.");
    tenant = {
      mode: "new",
      name,
      phone,
      rank: strOrNull("tenant_rank"),
      militaryId: strOrNull("tenant_military_id"),
      unit: strOrNull("tenant_unit"),
      email: strOrNull("tenant_email"),
      baseLocationId,
    };
  }

  // --- Terms ---
  const startDate = str("start_date");
  const endDate = str("end_date");
  if (!startDate || Number.isNaN(new Date(startDate).getTime())) {
    throw new Error("계약 시작일을 올바르게 입력해주세요.");
  }
  if (!endDate || Number.isNaN(new Date(endDate).getTime())) {
    throw new Error("계약 종료일을 올바르게 입력해주세요.");
  }
  const monthlyRentKrw = str("monthly_rent_krw");
  const depositKrw = str("deposit_krw");
  // Reject blank, non-numeric, and out-of-range values: rent must be > 0 (a 0 or
  // negative monthly rent is never valid and would seed a bogus recurring charge),
  // deposit must be >= 0. `Number.isFinite` alone wrongly accepts "0"/"-5000".
  const rentNum = Number(monthlyRentKrw);
  if (!monthlyRentKrw || !Number.isFinite(rentNum) || rentNum <= 0) {
    throw new Error("월세를 0보다 큰 숫자로 입력해주세요.");
  }
  const depositNum = Number(depositKrw);
  if (!depositKrw || !Number.isFinite(depositNum) || depositNum < 0) {
    throw new Error("보증금을 0 이상의 숫자로 입력해주세요.");
  }

  return {
    landlord,
    property,
    tenant,
    terms: {
      startDate,
      endDate,
      monthlyRentKrw,
      depositKrw,
      notes: strOrNull("notes"),
    },
  };
}
