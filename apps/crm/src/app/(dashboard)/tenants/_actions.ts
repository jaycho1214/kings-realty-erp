"use server";

import { getDb } from "@kingsrealty/db";
import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireUser,
  requireAdmin,
  requireSensitiveAccess,
  requirePermission,
} from "@/lib/authz";
import { seoulYMD, seoulDateString, firstOfMonth } from "@/lib/date";
import {
  generateRecurringChargesForMonth,
  recomputeChargeStatus,
} from "@/lib/charges";
import { buildInspectionSnapshot } from "@/lib/inspection/snapshot";

export async function createTenant(formData: FormData) {
  const session = await requirePermission("tenant", "create");

  const db = getDb();

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = (formData.get("email") as string) || null;
  const sex = (formData.get("sex") as string) || null;
  const birth = (formData.get("birth") as string) || null;
  const branch = (formData.get("branch") as string) || null;
  const rank = (formData.get("rank") as string) || null;
  const unit = (formData.get("unit") as string) || null;
  const deros = (formData.get("deros") as string) || null;
  const military_id = (formData.get("military_id") as string)?.trim() || null;
  const dependent_status = (formData.get("dependent_status") as string) || null;
  const dependentCountRaw = (formData.get("dependent_count") as string)?.trim();
  const dependent_count = dependentCountRaw ? Number(dependentCountRaw) : null;
  const baseLocationId = formData.get("base_location_id") as string;
  const baseLocationIdNum = Number(baseLocationId);
  if (!Number.isInteger(baseLocationIdNum) || baseLocationIdNum <= 0) {
    throw new Error("기지를 선택해주세요.");
  }

  // Parse family members from indexed form data
  const familyMembers: {
    name: string;
    relationship: string;
    sex: string | null;
    phone: string | null;
    notes: string | null;
  }[] = [];
  for (let i = 0; ; i++) {
    const fName = formData.get(`family[${i}].name`) as string | null;
    if (fName === null) break;
    familyMembers.push({
      name: fName,
      relationship: formData.get(`family[${i}].relationship`) as string,
      sex: (formData.get(`family[${i}].sex`) as string) || null,
      phone: (formData.get(`family[${i}].phone`) as string) || null,
      notes: (formData.get(`family[${i}].notes`) as string) || null,
    });
  }

  // Parse pets from indexed form data
  const pets: {
    name: string;
    species: string;
    breed: string | null;
    size: string | null;
    notes: string | null;
  }[] = [];
  for (let i = 0; ; i++) {
    const pName = formData.get(`pet[${i}].name`) as string | null;
    if (pName === null) break;
    pets.push({
      name: pName,
      species: formData.get(`pet[${i}].species`) as string,
      breed: (formData.get(`pet[${i}].breed`) as string) || null,
      size: (formData.get(`pet[${i}].size`) as string) || null,
      notes: (formData.get(`pet[${i}].notes`) as string) || null,
    });
  }

  await db.transaction().execute(async (trx) => {
    const result = await trx
      .insertInto("tenant")
      .values({
        name,
        phone,
        email,
        sex,
        birth,
        branch,
        rank,
        unit,
        deros,
        military_id,
        dependent_status,
        dependent_count,
        base_location_id: baseLocationIdNum,
        created_by: Number(session.user.id),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const tenantId = result.id;

    // Insert family members
    for (const member of familyMembers) {
      await trx
        .insertInto("tenant_family_member")
        .values({ tenant_id: tenantId, ...member })
        .execute();
    }

    // Insert pets
    for (const pet of pets) {
      await trx
        .insertInto("tenant_pet")
        .values({ tenant_id: tenantId, ...pet })
        .execute();
    }
  });

  revalidatePath("/tenants");
  redirect("/tenants");
}

export async function updateTenant(id: number, formData: FormData) {
  await requirePermission("tenant", "update");

  const db = getDb();

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = (formData.get("email") as string) || null;
  const sex = (formData.get("sex") as string) || null;
  const birth = (formData.get("birth") as string) || null;
  const branch = (formData.get("branch") as string) || null;
  const rank = (formData.get("rank") as string) || null;
  const unit = (formData.get("unit") as string) || null;
  const deros = (formData.get("deros") as string) || null;
  const military_id = (formData.get("military_id") as string)?.trim() || null;
  const dependent_status = (formData.get("dependent_status") as string) || null;
  const dependentCountRaw = (formData.get("dependent_count") as string)?.trim();
  const dependent_count = dependentCountRaw ? Number(dependentCountRaw) : null;
  const baseLocationId = formData.get("base_location_id") as string;
  const baseLocationIdNum = Number(baseLocationId);
  if (!Number.isInteger(baseLocationIdNum) || baseLocationIdNum <= 0) {
    throw new Error("기지를 선택해주세요.");
  }

  await db
    .updateTable("tenant")
    .set({
      name,
      phone,
      email,
      sex,
      birth,
      branch,
      rank,
      unit,
      deros,
      military_id,
      dependent_status,
      dependent_count,
      base_location_id: Number(baseLocationId),
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();

  revalidatePath("/tenants");
  redirect(`/tenants/${id}`);
}

export async function deleteTenant(id: number) {
  await requirePermission("tenant", "delete");

  const db = getDb();

  // lease.tenant_id (RESTRICT) and ledger_entry.tenant_id (NO ACTION) block a
  // bare delete with an opaque FK error. Refuse with a clear message and never
  // silently drop financial history. No lease ⇒ no payments/bills/services/
  // inspections (all keyed by lease_id), so these two checks cover them.
  const [leases, ledger] = await Promise.all([
    db
      .selectFrom("lease")
      .select(({ fn }) => fn.countAll<number>().as("c"))
      .where("tenant_id", "=", id)
      .executeTakeFirst(),
    db
      .selectFrom("ledger_entry")
      .select(({ fn }) => fn.countAll<number>().as("c"))
      .where("tenant_id", "=", id)
      .executeTakeFirst(),
  ]);
  if (Number(leases?.c ?? 0) > 0 || Number(ledger?.c ?? 0) > 0) {
    throw new Error("계약·원장 내역이 있는 세입자는 삭제할 수 없습니다.");
  }

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("tenant_pet").where("tenant_id", "=", id).execute();
    await trx
      .deleteFrom("tenant_family_member")
      .where("tenant_id", "=", id)
      .execute();
    // calendar_event.tenant_id is a nullable FK with no cascade — detach any
    // reminders so they survive and don't block the delete. tenant_note and
    // charge_item cascade automatically.
    await trx
      .updateTable("calendar_event")
      .set({ tenant_id: null })
      .where("tenant_id", "=", id)
      .execute();
    await trx.deleteFrom("tenant").where("id", "=", id).execute();
  });

  revalidatePath("/tenants");
  redirect("/tenants");
}

export async function addFamilyMember(tenantId: number, formData: FormData) {
  await requirePermission("tenant", "update");

  const db = getDb();

  const name = formData.get("name") as string;
  const relationship = formData.get("relationship") as string;
  const sex = (formData.get("sex") as string) || null;
  const birth = (formData.get("birth") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  await db
    .insertInto("tenant_family_member")
    .values({
      tenant_id: tenantId,
      name,
      relationship,
      sex,
      birth,
      phone,
      notes,
    })
    .execute();

  revalidatePath(`/tenants/${tenantId}`);
}

export async function deleteFamilyMember(id: number, tenantId: number) {
  await requirePermission("tenant", "update");

  const db = getDb();

  await db.deleteFrom("tenant_family_member").where("id", "=", id).execute();

  revalidatePath(`/tenants/${tenantId}`);
}

export async function addPet(tenantId: number, formData: FormData) {
  await requirePermission("tenant", "update");

  const db = getDb();

  const name = formData.get("name") as string;
  const species = formData.get("species") as string;
  const breed = (formData.get("breed") as string) || null;
  const size = (formData.get("size") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  await db
    .insertInto("tenant_pet")
    .values({ tenant_id: tenantId, name, species, breed, size, notes })
    .execute();

  revalidatePath(`/tenants/${tenantId}`);
}

export async function deletePet(id: number, tenantId: number) {
  await requirePermission("tenant", "update");

  const db = getDb();

  await db.deleteFrom("tenant_pet").where("id", "=", id).execute();

  revalidatePath(`/tenants/${tenantId}`);
}

// --- Tenant Status ---

export async function updateTenantStatus(
  id: number,
  status: string,
  // Move-out date as a Seoul "YYYY-MM-DD" string; defaults to now. Ignored when
  // returning to active.
  movedOutOn?: string | null,
) {
  await requirePermission("tenant", "update");

  if (status !== "active" && status !== "inactive") {
    throw new Error("올바르지 않은 상태입니다.");
  }

  // Moving out archives the tenant (starts the 보관→휴지통 retention clock);
  // returning to active un-archives them. Anchor the picked calendar date to
  // noon Seoul so it reads as the same day whether the server formats in UTC
  // or KST.
  let archivedAt: Date | null = null;
  if (status === "inactive") {
    if (movedOutOn) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(movedOutOn)) {
        throw new Error("올바르지 않은 날짜입니다.");
      }
      archivedAt = new Date(`${movedOutOn}T12:00:00+09:00`);
      if (Number.isNaN(archivedAt.getTime())) {
        throw new Error("올바르지 않은 날짜입니다.");
      }
    } else {
      archivedAt = new Date();
    }
  }

  const db = getDb();

  await db
    .updateTable("tenant")
    .set({
      status,
      archived_at: archivedAt,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();

  revalidatePath(`/tenants/${id}`);
  revalidatePath("/tenants");
}

// --- Tenant lifecycle (soft-delete / purge) ---
//
// Moving a tenant out (updateTenantStatus → inactive) archives them, which is
// what starts the retention clock; there is no separate manual archive step.

/** Restore a soft-deleted tenant back to the active roster. */
export async function restoreTenant(id: number) {
  await requireAdmin();
  const db = getDb();
  await db
    .updateTable("tenant")
    .set({ archived_at: null, deleted_at: null, updated_at: new Date() })
    .where("id", "=", id)
    .execute();
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${id}`);
}

/** Permanently delete a tenant and personal dependents. Admin only. Blocked
 *  while leases exist (financial history must be detached first). */
export async function purgeTenant(id: number) {
  await requireAdmin();
  const db = getDb();

  const [leaseCount, ledgerCount] = await Promise.all([
    db
      .selectFrom("lease")
      .select(({ fn }) => fn.countAll<number>().as("c"))
      .where("tenant_id", "=", id)
      .executeTakeFirst(),
    db
      .selectFrom("ledger_entry")
      .select(({ fn }) => fn.countAll<number>().as("c"))
      .where("tenant_id", "=", id)
      .executeTakeFirst(),
  ]);
  if (Number(leaseCount?.c ?? 0) > 0 || Number(ledgerCount?.c ?? 0) > 0) {
    throw new Error(
      "계약·원장 내역이 있는 세입자는 영구삭제할 수 없습니다. 먼저 내역을 정리하세요.",
    );
  }

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("tenant_pet").where("tenant_id", "=", id).execute();
    await trx
      .deleteFrom("tenant_family_member")
      .where("tenant_id", "=", id)
      .execute();
    await trx.deleteFrom("tenant_note").where("tenant_id", "=", id).execute();
    // calendar_event.tenant_id is a nullable FK with no cascade — detach before
    // delete so reminders survive and don't raise an FK error.
    await trx
      .updateTable("calendar_event")
      .set({ tenant_id: null })
      .where("tenant_id", "=", id)
      .execute();
    await trx.deleteFrom("tenant").where("id", "=", id).execute();
  });
  revalidatePath("/tenants");
}

// --- Tenant Ledger (원장) — manual entries ---

/** Add a manual receipt/disbursement to a tenant's ledger. Admin/accounting. */
export async function addLedgerEntry(tenantId: number, formData: FormData) {
  const session = await requireSensitiveAccess();
  const db = getDb();

  const direction =
    formData.get("direction") === "disbursement" ? "disbursement" : "receipt";
  const entry_date = new Date(formData.get("entry_date") as string);
  const category = (formData.get("category") as string)?.trim() || "기타";
  const currency = formData.get("currency") === "USD" ? "USD" : "KRW";
  const amount = Number(formData.get("amount"));
  const rate = formData.get("exchange_rate")
    ? Number(formData.get("exchange_rate"))
    : null;
  const denomination = formData.get("denomination")
    ? Number(formData.get("denomination"))
    : null;
  const vendorRaw = formData.get("exchange_vendor_id") as string;
  const exchange_vendor_id = vendorRaw ? Number(vendorRaw) : null;
  const description =
    (formData.get("description") as string)?.trim() || category;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }
  if (Number.isNaN(entry_date.getTime())) {
    throw new Error("날짜를 올바르게 입력해주세요.");
  }
  if (
    currency === "USD" &&
    (rate == null || !Number.isFinite(rate) || rate <= 0)
  ) {
    throw new Error("환율을 올바르게 입력해주세요.");
  }

  const amount_krw =
    currency === "USD" && rate ? Math.round(amount * rate) : amount;

  const lease = await db
    .selectFrom("lease")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .orderBy("start_date", "desc")
    .executeTakeFirst();

  await db
    .insertInto("ledger_entry")
    .values({
      entry_type: direction === "receipt" ? "income" : "expense",
      direction,
      category,
      amount_krw: String(amount_krw),
      description,
      entry_date,
      tenant_id: tenantId,
      lease_id: lease?.id ?? null,
      currency,
      denomination,
      exchange_rate: rate != null ? String(rate) : null,
      exchange_vendor_id,
      recorded_by: Number(session.user.id),
    })
    .execute();

  revalidatePath(`/tenants/${tenantId}`);
}

/** Delete a manual ledger entry. Admin/accounting. */
export async function deleteLedgerEntry(id: number, tenantId: number) {
  await requireSensitiveAccess();
  const db = getDb();
  await db
    .deleteFrom("ledger_entry")
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
}

// --- Tenant Charges (청구) ---

const CHARGE_STATUSES = new Set([
  "unbilled",
  "billed",
  "paid",
  "partial",
  "overdue",
  "waived",
  "void",
]);

/** Add a manual charge (one-time or monthly) for a tenant. */
export async function addCharge(tenantId: number, formData: FormData) {
  const session = await requireUser();
  const db = getDb();

  const type = (formData.get("type") as string)?.trim() || "기타";
  const recurrence =
    formData.get("recurrence") === "monthly" ? "monthly" : "one_time";
  const amount = Number(formData.get("amount"));
  const currency = formData.get("currency") === "USD" ? "USD" : "KRW";
  const billingMonthRaw = (formData.get("billing_month") as string)?.trim();
  const dueRaw = (formData.get("due_date") as string)?.trim();
  const memo = (formData.get("memo") as string)?.trim() || null;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }

  const lease = await db
    .selectFrom("lease")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .orderBy("start_date", "desc")
    .executeTakeFirst();

  await db
    .insertInto("charge_item")
    .values({
      tenant_id: tenantId,
      lease_id: lease?.id ?? null,
      type,
      recurrence,
      billing_month: billingMonthRaw ? `${billingMonthRaw}-01` : null,
      amount: String(amount),
      currency,
      due_date: dueRaw || null,
      status: "billed",
      memo,
      created_by: Number(session.user.id),
    })
    .execute();

  revalidatePath(`/tenants/${tenantId}`);
}

export async function updateChargeStatus(
  id: number,
  tenantId: number,
  status: string,
) {
  await requireUser();
  if (!CHARGE_STATUSES.has(status))
    throw new Error("올바르지 않은 상태입니다.");
  const db = getDb();
  await db
    .updateTable("charge_item")
    .set({ status, updated_at: new Date() })
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
}

export async function deleteCharge(id: number, tenantId: number) {
  await requireUser();
  const db = getDb();
  await db
    .deleteFrom("charge_item")
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
}

/** Fill a variable placeholder's amount, flipping 미청구 → 청구됨/미납. */
export async function setChargeAmount(
  id: number,
  tenantId: number,
  amount: number,
) {
  await requireUser();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }
  const db = getDb();
  await db
    .updateTable("charge_item")
    .set({ amount: String(amount), updated_at: new Date() })
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .where("paid_by_payment_id", "is", null)
    .execute();
  await recomputeChargeStatus([id], seoulDateString());
  revalidatePath(`/tenants/${tenantId}`);
}

/**
 * 수납(연결): record a KRW payment for a single outstanding charge and link it,
 * settling the charge to 수납완료. Runs in a transaction that re-reads the charge
 * FOR UPDATE and no-ops if it's already linked — so a double-click can't create a
 * second orphan payment. 외화 charges are routed to /payments/new (FX handling).
 */
export async function settleCharge(
  chargeId: number,
  tenantId: number,
  formData: FormData,
) {
  const session = await requireUser();
  const amount = Number(formData.get("amount"));
  const method = (formData.get("payment_method") as string) || "cash";
  const date = (formData.get("payment_date") as string) || seoulDateString();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }

  const db = getDb();
  await db.transaction().execute(async (trx) => {
    const charge = await trx
      .selectFrom("charge_item")
      .select([
        "id",
        "lease_id",
        "type",
        "memo",
        "currency",
        "billing_month",
        "paid_by_payment_id",
      ])
      .where("id", "=", chargeId)
      .where("tenant_id", "=", tenantId)
      .forUpdate()
      .executeTakeFirst();
    if (!charge) throw new Error("청구 항목을 찾을 수 없습니다.");
    if (charge.paid_by_payment_id != null) return; // already settled — no-op
    if (!charge.lease_id) {
      throw new Error("계약이 연결되지 않은 청구는 수납할 수 없습니다.");
    }
    if (charge.currency !== "KRW") {
      throw new Error("외화 청구는 수납 등록 페이지에서 처리해주세요.");
    }

    // charge.billing_month is first-of-month; fall back to the payment date's
    // month for a one-time charge with no billing period.
    const billingMonth = charge.billing_month
      ? new Date(charge.billing_month).toISOString().slice(0, 10)
      : `${date.slice(0, 7)}-01`;

    const inserted = await trx
      .insertInto("payment")
      .values({
        lease_id: charge.lease_id,
        payment_type: charge.type,
        label: charge.memo ?? null,
        billing_month: billingMonth,
        amount_krw: String(amount),
        currency_paid: "KRW",
        amount_paid: String(amount),
        payment_method: method,
        payment_date: date,
        status: "paid",
        received_by: Number(session.user.id),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await trx
      .updateTable("charge_item")
      .set({
        paid_by_payment_id: inserted.id,
        status: "paid",
        updated_at: new Date(),
      })
      .where("id", "=", chargeId)
      .where("paid_by_payment_id", "is", null)
      .execute();
  });

  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/payments");
  revalidatePath("/");
}

/** 면제: forgive an outstanding charge — not collected, not revenue, drops out
 *  of 미납. Guarded so an already-settled charge is never overwritten. */
export async function waiveCharge(chargeId: number, tenantId: number) {
  await requireUser();
  const db = getDb();
  await db
    .updateTable("charge_item")
    .set({ status: "waived", updated_at: new Date() })
    .where("id", "=", chargeId)
    .where("tenant_id", "=", tenantId)
    .where("paid_by_payment_id", "is", null)
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/");
}

/** 정정(무효): mark a duplicate/erroneous charge void. Soft (a row, not a delete)
 *  so the recurring generator's (recurring_charge_id, billing_month) uniqueness
 *  keeps it from being recreated for that month. */
export async function voidCharge(chargeId: number, tenantId: number) {
  await requireUser();
  const db = getDb();
  await db
    .updateTable("charge_item")
    .set({ status: "void", updated_at: new Date() })
    .where("id", "=", chargeId)
    .where("tenant_id", "=", tenantId)
    .where("paid_by_payment_id", "is", null)
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/");
}

// --- Recurring charges (정기 청구 정의) ---

function parseRecurringForm(formData: FormData) {
  const label = (formData.get("label") as string)?.trim();
  if (!label) throw new Error("항목 이름을 입력해주세요.");
  const type = (formData.get("type") as string)?.trim() || "custom";
  const currency = formData.get("currency") === "USD" ? "USD" : "KRW";
  const dueDayRaw = Number(formData.get("due_day"));
  const due_day =
    Number.isFinite(dueDayRaw) && dueDayRaw >= 1 && dueDayRaw <= 31
      ? Math.floor(dueDayRaw)
      : 10;
  const amountRaw = (formData.get("amount") as string)?.trim();
  const amount = amountRaw ? Number(amountRaw) : null; // null = 변동(월마다 입력)
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error("금액을 올바르게 입력해주세요.");
  }
  const startRaw = (formData.get("start_month") as string)?.trim();
  const endRaw = (formData.get("end_month") as string)?.trim();
  return {
    label,
    type,
    currency,
    due_day,
    amount: amount == null ? null : String(amount),
    start_month: startRaw ? `${startRaw}-01` : null,
    end_month: endRaw ? `${endRaw}-01` : null,
  };
}

/** Add a recurring-bill definition for a tenant (optionally seeded from a preset). */
export async function addRecurringCharge(tenantId: number, formData: FormData) {
  const session = await requireUser();
  const db = getDb();
  const fields = parseRecurringForm(formData);
  await db
    .insertInto("recurring_charge")
    .values({
      tenant_id: tenantId,
      ...fields,
      created_by: Number(session.user.id),
    })
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
}

/** Update a definition. Amount changes apply to FUTURE generated charges only. */
export async function updateRecurringCharge(
  id: number,
  tenantId: number,
  formData: FormData,
) {
  await requireUser();
  const db = getDb();
  const fields = parseRecurringForm(formData);
  await db
    .updateTable("recurring_charge")
    .set({ ...fields, updated_at: new Date() })
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
}

export async function toggleRecurringChargeActive(
  id: number,
  tenantId: number,
  active: boolean,
) {
  await requireUser();
  const db = getDb();
  await db
    .updateTable("recurring_charge")
    .set({ active, updated_at: new Date() })
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
}

export async function deleteRecurringCharge(id: number, tenantId: number) {
  await requireUser();
  const db = getDb();
  // Already-generated charges keep their history (FK on delete set null).
  await db
    .deleteFrom("recurring_charge")
    .where("id", "=", id)
    .where("tenant_id", "=", tenantId)
    .execute();
  revalidatePath(`/tenants/${tenantId}`);
}

/** Materialize this month's recurring charges for one tenant (manual trigger). */
export async function generateTenantRecurringCharges(tenantId: number) {
  await requireUser();
  const { year, month } = seoulYMD();
  await generateRecurringChargesForMonth(firstOfMonth(year, month), tenantId);
  revalidatePath(`/tenants/${tenantId}`);
}

// --- Tenant Notes ---

export async function addTenantNote(tenantId: number, formData: FormData) {
  const session = await requirePermission("tenant", "update");

  const content = formData.get("content") as string;
  if (!content?.trim()) return;

  const db = getDb();

  await db
    .insertInto("tenant_note")
    .values({
      tenant_id: tenantId,
      content: content.trim(),
      created_by: Number(session.user.id),
    })
    .execute();

  revalidatePath(`/tenants/${tenantId}`);
}

export async function deleteTenantNote(id: number, tenantId: number) {
  await requirePermission("tenant", "update");

  const db = getDb();

  await db.deleteFrom("tenant_note").where("id", "=", id).execute();

  revalidatePath(`/tenants/${tenantId}`);
}

// --- Base Locations ---

export async function createBaseLocation(formData: FormData) {
  await requireAdmin();

  const name = formData.get("name") as string;
  const nameKo = (formData.get("name_ko") as string) || null;

  if (!name?.trim()) return;

  const db = getDb();

  const maxOrder = await db
    .selectFrom("base_location")
    .select(({ fn }) => fn.max("sort_order").as("max_order"))
    .executeTakeFirst();

  await db
    .insertInto("base_location")
    .values({
      name: name.trim(),
      name_ko: nameKo?.trim() || null,
      sort_order: ((maxOrder?.max_order as number) ?? 0) + 1,
    })
    .execute();

  revalidatePath("/tenants");
  revalidatePath("/settings");
}

export async function deleteBaseLocation(id: number) {
  await requireAdmin();

  const db = getDb();

  // Check if any tenants or family members reference this location
  const [tenantUsage, familyUsage] = await Promise.all([
    db
      .selectFrom("tenant")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("base_location_id", "=", id)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("tenant_family_member")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("base_location_id", "=", id)
      .executeTakeFirstOrThrow(),
  ]);

  if (Number(tenantUsage.count) + Number(familyUsage.count) > 0) return;

  await db.deleteFrom("base_location").where("id", "=", id).execute();

  revalidatePath("/tenants");
  revalidatePath("/settings");
}

// --- 입주/퇴거 점검 (Inspections) ---

export async function createInspectionDraft(
  tenantId: number,
  leaseId: number,
  propertyId: number,
  formData: FormData,
) {
  const session = await requireUser();
  const db = getDb();

  const type = formData.get("type") === "move_out" ? "move_out" : "move_in";
  const dateRaw = formData.get("inspected_at") as string | null;
  const inspected_at = dateRaw ? new Date(dateRaw) : new Date();

  const [sections, items, property] = await Promise.all([
    db
      .selectFrom("inspection_section")
      .select(["id", "key", "label_ko", "label_en", "repeatable", "sort_order"])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("inspection_item")
      .select([
        "id",
        "section_id",
        "subgroup_ko",
        "subgroup_en",
        "label_ko",
        "label_en",
        "sort_order",
      ])
      .orderBy("sort_order", "asc")
      .execute(),
    db
      .selectFrom("property")
      .select(["rooms", "bathrooms"])
      .where("id", "=", propertyId)
      .executeTakeFirst(),
  ]);

  const snapshot = buildInspectionSnapshot(sections, items, {
    rooms: property?.rooms ?? null,
    bathrooms: property?.bathrooms ?? null,
  });

  const inserted = await db
    .insertInto("inspection")
    .values({
      lease_id: leaseId,
      property_id: propertyId,
      type,
      inspected_at,
      status: "draft",
      checklist: JSON.stringify(snapshot),
      created_by: Number(session.user.id),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  revalidatePath(`/tenants/${tenantId}`);
  redirect(`/inspections/${inserted.id}`);
}

export async function saveInspection(
  id: number,
  tenantId: number,
  payload: { checklist: string; signature: string; summary: string | null },
) {
  await requireUser();
  const db = getDb();
  await db
    .updateTable("inspection")
    .set({
      checklist: payload.checklist,
      signature: payload.signature,
      summary: payload.summary,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath(`/inspections/${id}`);
  revalidatePath(`/tenants/${tenantId}`);
}

export async function finalizeInspection(id: number, tenantId: number) {
  await requireUser();
  const db = getDb();

  const insp = await db
    .selectFrom("inspection")
    .select(["type", "property_id", "inspected_at"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!insp) throw new Error("점검 기록을 찾을 수 없습니다.");

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("inspection")
      .set({ status: "finalized", updated_at: new Date() })
      .where("id", "=", id)
      .execute();

    if (insp.type === "move_in") {
      await trx
        .updateTable("property")
        .set({ status: "occupied", updated_at: new Date() })
        .where("id", "=", insp.property_id)
        .execute();
    } else {
      const moveoutDate = seoulDateString(
        insp.inspected_at instanceof Date
          ? insp.inspected_at
          : new Date(insp.inspected_at),
      );
      await trx
        .updateTable("property")
        .set({
          status: "move_out",
          moveout_date: moveoutDate,
          updated_at: new Date(),
        })
        .where("id", "=", insp.property_id)
        .execute();
    }
  });

  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath(`/inspections/${id}`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${insp.property_id}`);
}

async function deleteInspectionBlobs(
  db: ReturnType<typeof getDb>,
  inspectionId: number,
) {
  const docs = await db
    .selectFrom("document")
    .select(["id", "file_url"])
    .where("entity_type", "=", "inspection")
    .where("entity_id", "=", inspectionId)
    .execute();
  for (const d of docs) {
    try {
      await del(d.file_url);
    } catch (err) {
      console.error("inspection blob delete failed", d.id, err);
    }
  }
  if (docs.length > 0) {
    await db
      .deleteFrom("document")
      .where("entity_type", "=", "inspection")
      .where("entity_id", "=", inspectionId)
      .execute();
  }
}

export async function deleteInspection(id: number, tenantId: number) {
  await requireUser();
  const db = getDb();
  await deleteInspectionBlobs(db, id);
  await db.deleteFrom("inspection").where("id", "=", id).execute();
  revalidatePath(`/tenants/${tenantId}`);
}

export async function deleteInspectionPhoto(
  documentId: number,
  inspectionId: number,
  tenantId: number,
) {
  await requireUser();
  const db = getDb();
  const doc = await db
    .selectFrom("document")
    .select(["file_url"])
    .where("id", "=", documentId)
    .where("entity_type", "=", "inspection")
    .executeTakeFirst();
  if (doc) {
    try {
      await del(doc.file_url);
    } catch (err) {
      console.error("inspection photo blob delete failed", documentId, err);
    }
    await db.deleteFrom("document").where("id", "=", documentId).execute();
  }
  revalidatePath(`/inspections/${inspectionId}`);
  revalidatePath(`/tenants/${tenantId}`);
}
