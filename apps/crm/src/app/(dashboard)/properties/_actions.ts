"use server";

import { getDb } from "@kingsrealty/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz";

export async function createProperty(formData: FormData) {
  const session = await requirePermission("property", "create");

  const db = getDb();

  const address = formData.get("address") as string;
  const address_jibeon = (formData.get("address_jibeon") as string) || null;
  const address_detail = (formData.get("address_detail") as string) || null;
  const address_en = (formData.get("address_en") as string) || null;
  const property_type = formData.get("property_type") as string;
  const rooms_raw = formData.get("rooms") as string;
  const rooms = rooms_raw ? parseInt(rooms_raw, 10) : null;
  const bathrooms_raw = formData.get("bathrooms") as string;
  const bathrooms = bathrooms_raw ? parseInt(bathrooms_raw, 10) : null;
  const size_pyeong_raw = formData.get("size_pyeong") as string;
  const size_pyeong = size_pyeong_raw ? parseFloat(size_pyeong_raw) : null;
  const monthly_rent_krw = parseFloat(
    formData.get("monthly_rent_krw") as string,
  );
  const deposit_krw = parseFloat(formData.get("deposit_krw") as string);
  const status = (formData.get("status") as string) || "vacant";
  const permission_status =
    (formData.get("permission_status") as string) || "pending";
  const landlord_id = Number(formData.get("landlord_id") as string);
  const notes = (formData.get("notes") as string) || null;
  const management_phone = (formData.get("management_phone") as string) || null;
  const moveout_date = (formData.get("moveout_date") as string) || null;

  // Require a Postcodify-selected address: both 지번 and 도로명 must be present so
  // every new property is stored normalized (a typed-but-unselected address has
  // neither). The form also blocks submit, this is the server-side backstop.
  if (!address?.trim() || !address_jibeon?.trim()) {
    throw new Error("주소를 검색하여 선택해주세요. (지번·도로명 주소가 함께 저장됩니다)");
  }
  if (Number.isNaN(monthly_rent_krw) || Number.isNaN(deposit_krw)) {
    throw new Error("임대료와 보증금을 숫자로 입력해주세요.");
  }
  if (!Number.isInteger(landlord_id) || landlord_id <= 0) {
    throw new Error("임대인을 선택해주세요.");
  }

  await db
    .insertInto("property")
    .values({
      address,
      address_jibeon,
      address_detail,
      address_en,
      property_type,
      rooms,
      bathrooms,
      size_pyeong,
      monthly_rent_krw,
      deposit_krw,
      status,
      permission_status,
      landlord_id,
      notes,
      management_phone,
      moveout_date,
      created_by: Number(session.user.id),
    })
    .execute();

  revalidatePath("/properties");
  redirect("/properties");
}

export async function updateProperty(id: number, formData: FormData) {
  await requirePermission("property", "update");

  const db = getDb();

  const address = formData.get("address") as string;
  const address_jibeon = (formData.get("address_jibeon") as string) || null;
  const address_detail = (formData.get("address_detail") as string) || null;
  const address_en = (formData.get("address_en") as string) || null;
  const property_type = formData.get("property_type") as string;
  const rooms_raw = formData.get("rooms") as string;
  const rooms = rooms_raw ? parseInt(rooms_raw, 10) : null;
  const bathrooms_raw = formData.get("bathrooms") as string;
  const bathrooms = bathrooms_raw ? parseInt(bathrooms_raw, 10) : null;
  const size_pyeong_raw = formData.get("size_pyeong") as string;
  const size_pyeong = size_pyeong_raw ? parseFloat(size_pyeong_raw) : null;
  const monthly_rent_krw = parseFloat(
    formData.get("monthly_rent_krw") as string,
  );
  const deposit_krw = parseFloat(formData.get("deposit_krw") as string);
  const status = (formData.get("status") as string) || "vacant";
  const permission_status =
    (formData.get("permission_status") as string) || "pending";
  const landlord_id = Number(formData.get("landlord_id") as string);
  const notes = (formData.get("notes") as string) || null;
  const management_phone = (formData.get("management_phone") as string) || null;
  const moveout_date = (formData.get("moveout_date") as string) || null;

  // A 도로명 address must always be present. 지번 isn't hard-required here so the
  // few still-un-normalized legacy rows stay editable; selecting a new address
  // repopulates both via Postcodify.
  if (!address?.trim()) {
    throw new Error("주소를 검색하여 선택해주세요.");
  }
  if (Number.isNaN(monthly_rent_krw) || Number.isNaN(deposit_krw)) {
    throw new Error("임대료와 보증금을 숫자로 입력해주세요.");
  }
  if (!Number.isInteger(landlord_id) || landlord_id <= 0) {
    throw new Error("임대인을 선택해주세요.");
  }

  await db
    .updateTable("property")
    .set({
      address,
      address_jibeon,
      address_detail,
      address_en,
      property_type,
      rooms,
      bathrooms,
      size_pyeong,
      monthly_rent_krw,
      deposit_krw,
      status,
      permission_status,
      landlord_id,
      notes,
      management_phone,
      moveout_date,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .execute();

  revalidatePath("/properties");
  redirect(`/properties/${id}`);
}

export async function deleteProperty(id: number) {
  await requirePermission("property", "delete");

  const db = getDb();

  // lease.property_id is ON DELETE RESTRICT: a bare delete throws an opaque FK
  // error for any property that has a lease. Refuse with a clear message
  // instead (matches deleteLease / deleteLandlord). No lease ⇒ no inspection
  // (inspection.lease_id is NOT NULL), so leases are the only hard blocker.
  const leases = await db
    .selectFrom("lease")
    .select(({ fn }) => fn.countAll<number>().as("c"))
    .where("property_id", "=", id)
    .executeTakeFirst();
  if (Number(leases?.c ?? 0) > 0) {
    throw new Error("계약 내역이 연결된 매물은 삭제할 수 없습니다.");
  }

  await db.transaction().execute(async (trx) => {
    // calendar_event.property_id is a nullable FK with no cascade — detach any
    // reminders so they survive and don't block the delete. appliances
    // cascade automatically.
    await trx
      .updateTable("calendar_event")
      .set({ property_id: null })
      .where("property_id", "=", id)
      .execute();
    await trx.deleteFrom("property").where("id", "=", id).execute();
  });

  revalidatePath("/properties");
  redirect("/properties");
}
