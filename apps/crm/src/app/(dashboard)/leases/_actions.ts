"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireUser,
  requireAdmin,
  requireSensitiveAccess,
  requirePermission,
  canViewSensitive,
} from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { seoulDateString } from "@/lib/date";
import { encryptRrn } from "@/lib/rrn";
import { parseLeaseIntake } from "@/lib/lease-intake";

/** Parse the contract-specific (임대인측·realty fee·갱신) fields shared by
 *  create/update. Empty numeric fields become null. */
function parseContractTerms(formData: FormData) {
  const num = (key: string): string | null => {
    const v = (formData.get(key) as string)?.trim();
    return v ? v : null;
  };
  const realtyFee = num("realty_fee");
  return {
    landlord_rent_krw: num("landlord_rent_krw"),
    landlord_deposit_krw: num("landlord_deposit_krw"),
    realty_fee: realtyFee,
    realty_fee_currency: realtyFee
      ? (formData.get("realty_fee_currency") as string) || "KRW"
      : null,
    auto_renew: formData.get("auto_renew") === "1",
  };
}

export async function createLease(formData: FormData) {
  const session = await requirePermission("lease", "create");

  const db = getDb();

  const property_id = Number(formData.get("property_id") as string);
  const tenant_id = Number(formData.get("tenant_id") as string);
  const start_date = new Date(formData.get("start_date") as string);
  const end_date = new Date(formData.get("end_date") as string);
  const monthly_rent_krw = formData.get("monthly_rent_krw") as string;
  const deposit_krw = formData.get("deposit_krw") as string;
  const status = (formData.get("status") as string) || "active";
  const notes = (formData.get("notes") as string) || null;
  const contract = parseContractTerms(formData);

  if (!Number.isInteger(property_id) || property_id <= 0) {
    throw new Error("매물을 선택해주세요.");
  }
  if (!Number.isInteger(tenant_id) || tenant_id <= 0) {
    throw new Error("세입자를 선택해주세요.");
  }
  if (Number.isNaN(start_date.getTime()) || Number.isNaN(end_date.getTime())) {
    throw new Error("계약 시작일과 종료일을 올바르게 입력해주세요.");
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("lease")
      .values({
        property_id,
        tenant_id,
        start_date,
        end_date,
        monthly_rent_krw,
        deposit_krw,
        status,
        notes,
        ...contract,
        created_by: Number(session.user.id),
      })
      .execute();

    await trx
      .updateTable("property")
      .set({ status: "occupied", updated_at: new Date() })
      .where("id", "=", property_id)
      .execute();

    await trx
      .updateTable("tenant")
      .set({ status: "active", updated_at: new Date() })
      .where("id", "=", tenant_id)
      .execute();
  });

  revalidatePath("/leases");
  revalidatePath(`/tenants/${tenant_id}`);
  // The lease flips the property to 점유중 and the tenant to 활성 — refresh both the
  // property list and that property's detail so they don't show stale status.
  revalidatePath("/properties");
  revalidatePath(`/properties/${property_id}`);
  // Tenant-centric: return to the tenant the lease belongs to.
  redirect(`/tenants/${tenant_id}`);
}

/**
 * 계약서 일괄 등록: 임대인(+공동 임대인) · 매물 · 임차인 · 계약을 한 트랜잭션으로
 * 생성한다. 각 섹션은 기존 레코드 재사용 또는 신규 생성 중 하나다. 신규 매물일
 * 때만 임대인을 생성/선택하며, 기존 매물이면 매물의 임대인을 그대로 쓴다.
 */
export async function createLeaseIntake(formData: FormData) {
  const session = await requirePermission("lease", "create");
  const canViewRrn = canViewSensitive(session.user.role);
  const plan = parseLeaseIntake(formData, { canViewRrn });

  // Permission for every entity this call will actually insert.
  if (plan.tenant.mode === "new") await requirePermission("tenant", "create");
  if (plan.property.mode === "new") {
    await requirePermission("property", "create");
    if (plan.landlord!.mode === "new") {
      await requirePermission("landlord", "create");
    }
  }

  const db = getDb();
  const userId = Number(session.user.id);
  let tenantId = 0;
  let propertyId = 0;

  await db.transaction().execute(async (trx) => {
    // 1. 임대인 (+ 공동 임대인) — only when creating a new property
    let landlordId = 0;
    if (plan.property.mode === "new") {
      const L = plan.landlord!;
      if (L.mode === "existing") {
        landlordId = L.landlordId;
      } else {
        const ins = await trx
          .insertInto("landlord")
          .values({
            name: L.name,
            phone: L.phone,
            email: L.email,
            address: L.address,
            rrn_encrypted: L.rrn ? encryptRrn(L.rrn) : null,
            created_by: userId,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        landlordId = ins.id;
        for (const c of L.coLessors) {
          await trx
            .insertInto("landlord_family_member")
            .values({
              landlord_id: landlordId,
              name: c.name,
              relationship: c.relationship,
              phone: c.phone,
              rrn_encrypted: c.rrn ? encryptRrn(c.rrn) : null,
            })
            .execute();
        }
      }
    }

    // 2. 매물
    if (plan.property.mode === "existing") {
      propertyId = plan.property.propertyId;
    } else {
      const P = plan.property;
      const ins = await trx
        .insertInto("property")
        .values({
          address: P.address,
          address_jibeon: P.addressJibeon,
          address_detail: P.addressDetail,
          address_en: P.addressEn,
          property_type: P.propertyType,
          size_pyeong: P.sizePyeong !== null ? String(P.sizePyeong) : null,
          monthly_rent_krw: plan.terms.monthlyRentKrw,
          deposit_krw: plan.terms.depositKrw,
          status: "occupied",
          landlord_id: landlordId,
          created_by: userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      propertyId = ins.id;
    }

    // 3. 임차인
    if (plan.tenant.mode === "existing") {
      tenantId = plan.tenant.tenantId;
    } else {
      const T = plan.tenant;
      const ins = await trx
        .insertInto("tenant")
        .values({
          name: T.name,
          phone: T.phone,
          rank: T.rank,
          military_id: T.militaryId,
          unit: T.unit,
          email: T.email,
          base_location_id: T.baseLocationId,
          status: "active",
          created_by: userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      tenantId = ins.id;
    }

    // 4. 계약 + status side-effects (same as createLease)
    await trx
      .insertInto("lease")
      .values({
        property_id: propertyId,
        tenant_id: tenantId,
        start_date: new Date(plan.terms.startDate),
        end_date: new Date(plan.terms.endDate),
        monthly_rent_krw: plan.terms.monthlyRentKrw,
        deposit_krw: plan.terms.depositKrw,
        status: "active",
        notes: plan.terms.notes,
        created_by: userId,
      })
      .execute();

    await trx
      .updateTable("property")
      .set({ status: "occupied", updated_at: new Date() })
      .where("id", "=", propertyId)
      .execute();
    await trx
      .updateTable("tenant")
      .set({ status: "active", updated_at: new Date() })
      .where("id", "=", tenantId)
      .execute();
  });

  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/tenants/${tenantId}`);
}

export async function updateLease(id: number, formData: FormData) {
  await requireAdmin();

  const db = getDb();

  const property_id = Number(formData.get("property_id") as string);
  const tenant_id = Number(formData.get("tenant_id") as string);
  const start_date = new Date(formData.get("start_date") as string);
  const end_date = new Date(formData.get("end_date") as string);
  const monthly_rent_krw = formData.get("monthly_rent_krw") as string;
  const deposit_krw = formData.get("deposit_krw") as string;
  const status = (formData.get("status") as string) || "active";
  const notes = (formData.get("notes") as string) || null;
  const contract = parseContractTerms(formData);

  if (!Number.isInteger(property_id) || property_id <= 0) {
    throw new Error("매물을 선택해주세요.");
  }
  if (!Number.isInteger(tenant_id) || tenant_id <= 0) {
    throw new Error("세입자를 선택해주세요.");
  }
  if (Number.isNaN(start_date.getTime()) || Number.isNaN(end_date.getTime())) {
    throw new Error("계약 시작일과 종료일을 올바르게 입력해주세요.");
  }

  await db
    .updateTable("lease")
    .set({
      property_id,
      tenant_id,
      start_date,
      end_date,
      monthly_rent_krw,
      deposit_krw,
      status,
      notes,
      ...contract,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();

  revalidatePath("/leases");
  revalidatePath(`/leases/${id}`);
  // An edit can reassign the tenant/property or change rent/dates, so the linked
  // tenant and property detail pages must refresh too.
  revalidatePath(`/tenants/${tenant_id}`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${property_id}`);
  redirect(`/leases/${id}`);
}

export async function deleteLease(id: number) {
  await requireAdmin();

  const db = getDb();

  const [payments, bills, services] = await Promise.all([
    db
      .selectFrom("payment")
      .select(({ fn }) => fn.countAll<number>().as("c"))
      .where("lease_id", "=", id)
      .executeTakeFirst(),
    db
      .selectFrom("utility_bill")
      .select(({ fn }) => fn.countAll<number>().as("c"))
      .where("lease_id", "=", id)
      .executeTakeFirst(),
    db
      .selectFrom("service_request")
      .select(({ fn }) => fn.countAll<number>().as("c"))
      .where("lease_id", "=", id)
      .executeTakeFirst(),
  ]);

  if (
    Number(payments?.c ?? 0) +
      Number(bills?.c ?? 0) +
      Number(services?.c ?? 0) >
    0
  ) {
    throw new Error(
      "납부 내역·공과금·서비스 요청이 연결된 계약은 삭제할 수 없습니다.",
    );
  }

  let freedPropertyId: number | undefined;
  await db.transaction().execute(async (trx) => {
    const lease = await trx
      .selectFrom("lease")
      .select(["property_id"])
      .where("id", "=", id)
      .executeTakeFirst();

    await trx.deleteFrom("lease").where("id", "=", id).execute();

    if (lease) {
      freedPropertyId = lease.property_id;
      await trx
        .updateTable("property")
        .set({ status: "vacant", updated_at: new Date() })
        .where("id", "=", lease.property_id)
        .execute();
    }
  });

  revalidatePath("/leases");
  // The freed property flips back to 공실 — refresh the property views too.
  revalidatePath("/properties");
  if (freedPropertyId) revalidatePath(`/properties/${freedPropertyId}`);
  redirect("/leases");
}

export async function addUtilityBill(leaseId: number, formData: FormData) {
  await requireUser();

  const db = getDb();

  const billing_month = new Date(formData.get("billing_month") as string);
  const utility_type_id = Number(formData.get("utility_type_id") as string);
  const amount_krw = formData.get("amount_krw") as string;
  const bearer = (formData.get("bearer") as string) || "tenant";
  const payee = (formData.get("payee") as string)?.trim() || null;
  const notes = (formData.get("notes") as string) || null;

  if (Number.isNaN(billing_month.getTime())) {
    throw new Error("청구 월을 올바르게 입력해주세요.");
  }
  if (!Number.isInteger(utility_type_id) || utility_type_id <= 0) {
    throw new Error("공과금 종류를 선택해주세요.");
  }
  if (!amount_krw || Number.isNaN(Number(amount_krw))) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }

  await db
    .insertInto("utility_bill")
    .values({
      lease_id: leaseId,
      billing_month,
      utility_type_id,
      amount_krw,
      bearer,
      payee,
      status: "pending",
      notes,
    })
    .execute();

  revalidatePath(`/leases/${leaseId}`);
}

export async function deleteUtilityBill(id: number, leaseId: number) {
  await requirePermission("accounting", "delete");

  const db = getDb();

  await db.deleteFrom("utility_bill").where("id", "=", id).execute();

  revalidatePath(`/leases/${leaseId}`);
}

// --- Deposit settlement (보증금 정산) ---

export async function saveDepositSettlement(
  leaseId: number,
  formData: FormData,
) {
  const session = await requireUser();
  const db = getDb();

  const existing = await db
    .selectFrom("deposit_settlement")
    .select(["status"])
    .where("lease_id", "=", leaseId)
    .executeTakeFirst();
  if (existing?.status === "confirmed") {
    throw new Error("확정된 정산은 수정할 수 없습니다.");
  }

  // The refund base must be the authoritative lease deposit, never the
  // client-supplied form value (which would let a caller inflate the refund).
  const lease = await db
    .selectFrom("lease")
    .select(["deposit_krw"])
    .where("id", "=", leaseId)
    .executeTakeFirst();
  if (!lease) throw new Error("계약 정보를 찾을 수 없습니다.");

  const deposit_amount = Number(lease.deposit_krw) || 0;
  let deductions: { amount: number; reason: string }[] = [];
  try {
    const parsed = JSON.parse((formData.get("deductions") as string) || "[]");
    if (Array.isArray(parsed)) deductions = parsed;
  } catch {
    deductions = [];
  }
  const deduction_total = deductions.reduce(
    (s, d) => s + (Number(d.amount) || 0),
    0,
  );
  const refund_amount = deposit_amount - deduction_total;
  const refund_method =
    (formData.get("refund_method") as string)?.trim() || null;
  const refunded_date = (formData.get("refunded_date") as string) || null;

  const row = {
    deposit_amount: String(deposit_amount),
    deductions: JSON.stringify(deductions),
    deduction_total: String(deduction_total),
    refund_amount: String(refund_amount),
    refund_method,
    refunded_date,
  };

  await db
    .insertInto("deposit_settlement")
    .values({
      lease_id: leaseId,
      ...row,
      status: "draft",
      created_by: Number(session.user.id),
    })
    .onConflict((oc) =>
      oc.column("lease_id").doUpdateSet({ ...row, updated_at: new Date() }),
    )
    .execute();

  revalidatePath(`/leases/${leaseId}`);
}

/** Confirm a settlement. Admin/accounting only. Writes the refund to the
 *  tenant's ledger as a disbursement and records an audit entry. */
export async function confirmDepositSettlement(leaseId: number) {
  const session = await requireSensitiveAccess();
  const db = getDb();

  const settlement = await db
    .selectFrom("deposit_settlement")
    .innerJoin("lease", "lease.id", "deposit_settlement.lease_id")
    .select([
      "deposit_settlement.refund_amount",
      "deposit_settlement.status",
      "deposit_settlement.refunded_date",
      "lease.tenant_id",
    ])
    .where("deposit_settlement.lease_id", "=", leaseId)
    .executeTakeFirst();
  if (!settlement) throw new Error("정산 내역이 없습니다.");
  if (settlement.status === "confirmed") return;

  const refund = Number(settlement.refund_amount);

  let confirmed = false;
  await db.transaction().execute(async (trx) => {
    // Guard the transition on the live status (not just the earlier read) so two
    // concurrent confirms can't both post the refund: only the txn that actually
    // flips →confirmed (numUpdatedRows === 1) writes the ledger entry.
    const res = await trx
      .updateTable("deposit_settlement")
      .set({
        status: "confirmed",
        confirmed_by: Number(session.user.id),
        refunded_date: settlement.refunded_date ?? seoulDateString(),
        updated_at: new Date(),
      })
      .where("lease_id", "=", leaseId)
      .where("status", "!=", "confirmed")
      .executeTakeFirst();

    if (Number(res.numUpdatedRows) === 0) return; // another confirm already won
    confirmed = true;

    if (refund !== 0) {
      // refund > 0: company disburses the refund to the tenant.
      // refund < 0: deductions exceed the deposit — the tenant still owes the
      // shortfall, recorded as a receipt so the net liability isn't lost.
      const isRefund = refund > 0;
      await trx
        .insertInto("ledger_entry")
        .values({
          entry_type: isRefund ? "expense" : "income",
          direction: isRefund ? "disbursement" : "receipt",
          category: "deposit_refund",
          amount_krw: String(Math.abs(refund)),
          description: isRefund ? "보증금 환급" : "보증금 정산 차감 초과분",
          entry_date: seoulDateString(),
          tenant_id: settlement.tenant_id,
          lease_id: leaseId,
          currency: "KRW",
          recorded_by: Number(session.user.id),
        })
        .execute();
    }
  });

  if (confirmed) {
    await logAudit({
      actorId: Number(session.user.id),
      action: "deposit_settlement.confirm",
      entityType: "lease",
      entityId: leaseId,
      detail: { refund },
    });
  }

  revalidatePath(`/leases/${leaseId}`);
  revalidatePath(`/tenants/${settlement.tenant_id}`);
}

// --- Inspections (입주/퇴거 점검) ---

export async function addInspection(
  leaseId: number,
  propertyId: number,
  formData: FormData,
) {
  const session = await requireUser();
  const db = getDb();

  const type = formData.get("type") === "move_out" ? "move_out" : "move_in";
  const dateRaw = formData.get("inspected_at") as string;
  const inspected_at = dateRaw ? new Date(dateRaw) : new Date();
  const participants = (formData.get("participants") as string) || null;
  const checklist = (formData.get("checklist") as string) || null;
  const summary = (formData.get("summary") as string)?.trim() || null;

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("inspection")
      .values({
        lease_id: leaseId,
        property_id: propertyId,
        type,
        inspected_at,
        participants,
        checklist,
        summary,
        created_by: Number(session.user.id),
      })
      .execute();

    // Inspection completion drives the property status (§4.9).
    if (type === "move_in") {
      await trx
        .updateTable("property")
        .set({ status: "occupied", updated_at: new Date() })
        .where("id", "=", propertyId)
        .execute();
    } else {
      // Derive the move-out date from the actual inspection instant (Seoul
      // calendar day) so it's never null when inspected_at defaulted to now().
      const moveoutDate = seoulDateString(inspected_at);
      await trx
        .updateTable("property")
        .set({
          status: "move_out",
          moveout_date: moveoutDate,
          updated_at: new Date(),
        })
        .where("id", "=", propertyId)
        .execute();
    }
  });

  revalidatePath(`/leases/${leaseId}`);
  // The inspection drives property status (점유중 / 퇴거 + 퇴거일) — refresh the
  // property views so the change is visible outside the lease page.
  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
}

export async function deleteInspection(id: number, leaseId: number) {
  await requireUser();
  const db = getDb();
  await db.deleteFrom("inspection").where("id", "=", id).execute();
  revalidatePath(`/leases/${leaseId}`);
}

export async function markUtilityBillPaid(id: number, leaseId: number) {
  // Recording a disbursement to the utility company is an accounting fact —
  // gate it like deleteUtilityBill (accounting/admin), not any approved user.
  await requirePermission("accounting", "create");

  const db = getDb();

  await db
    .updateTable("utility_bill")
    .set({
      paid_to_company: true,
      paid_to_company_date: seoulDateString(),
      status: "paid",
      paid_date: seoulDateString(),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();

  revalidatePath(`/leases/${leaseId}`);
}
