import "dotenv/config";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./types";

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url }),
    }),
  });

  // Get admin user ID
  const admin = await db
    .selectFrom("user")
    .select("id")
    .where("role", "=", "admin")
    .executeTakeFirstOrThrow();
  const adminId = admin.id;

  console.log("Seeding with admin ID:", adminId);

  // ─── Base locations (K-16=1, Osan=2 already seeded) ─────────────────

  // ─── Landlords ──────────────────────────────────────────────────────

  const landlords = await db
    .insertInto("landlord")
    .values([
      {
        name: "김영수",
        phone: "010-1234-5678",
        email: "kimys@naver.com",
        bank_name: "KB국민은행",
        bank_account: "123-456-789012",
        sex: "M",
        birth: "1965-03-15",
        notes: "평택 다수 매물 보유",
        created_by: Number(adminId),
      },
      {
        name: "박미경",
        phone: "010-2345-6789",
        email: "parkmk@gmail.com",
        bank_name: "신한은행",
        bank_account: "110-234-567890",
        sex: "F",
        birth: "1972-08-22",
        notes: null,
        created_by: Number(adminId),
      },
      {
        name: "이정호",
        phone: "010-3456-7890",
        email: null,
        bank_name: "농협은행",
        bank_account: "302-0123-4567-01",
        sex: "M",
        birth: "1958-11-03",
        notes: "오산 지역 임대인, 연락은 아들 이승현으로",
        created_by: Number(adminId),
      },
      {
        name: "최은주",
        phone: "010-4567-8901",
        email: "choiej@hanmail.net",
        bank_name: "하나은행",
        bank_account: "267-890123-45678",
        sex: "F",
        birth: "1970-05-10",
        notes: null,
        created_by: Number(adminId),
      },
      {
        name: "정대민",
        phone: "010-5678-9012",
        email: null,
        bank_name: "KB국민은행",
        bank_account: "987-654-321098",
        sex: "M",
        birth: "1963-01-28",
        notes: "매월 25일까지 입금 요청",
        created_by: Number(adminId),
      },
    ])
    .returning("id")
    .execute();

  console.log(`✓ ${landlords.length} landlords`);

  // Landlord family members
  await db
    .insertInto("landlord_family_member")
    .values([
      {
        landlord_id: landlords[0].id,
        name: "김미영",
        relationship: "spouse",
        phone: "010-1234-0000",
        sex: "F",
      },
      {
        landlord_id: landlords[2].id,
        name: "이승현",
        relationship: "child",
        phone: "010-3456-0001",
        sex: "M",
        notes: "아버지 대리 연락",
      },
    ])
    .execute();

  console.log("✓ landlord family members");

  // ─── Properties ─────────────────────────────────────────────────────

  const properties = await db
    .insertInto("property")
    .values([
      // Landlord 1 (김영수) - 3 properties
      {
        landlord_id: landlords[0].id,
        address: "경기도 평택시 팽성읍 평택로 123",
        address_detail: "현대아파트 101동 1502호",
        property_type: "apartment",
        size_pyeong: 32,
        rooms: 3,
        bathrooms: 2,
        monthly_rent_krw: 850000,
        deposit_krw: 5000000,
        status: "occupied",
        permission_status: "approved",
        management_phone: "031-654-3210",
        created_by: Number(adminId),
      },
      {
        landlord_id: landlords[0].id,
        address: "경기도 평택시 팽성읍 안정로 45",
        address_detail: "삼성빌라 B동 301호",
        property_type: "villa",
        size_pyeong: 24,
        rooms: 2,
        bathrooms: 1,
        monthly_rent_krw: 600000,
        deposit_krw: 3000000,
        status: "occupied",
        permission_status: "approved",
        created_by: Number(adminId),
      },
      {
        landlord_id: landlords[0].id,
        address: "경기도 평택시 팽성읍 대추로 78",
        address_detail: "LG빌리지 203호",
        property_type: "villa",
        size_pyeong: 28,
        rooms: 3,
        bathrooms: 1,
        monthly_rent_krw: 700000,
        deposit_krw: 3000000,
        status: "vacant",
        permission_status: "approved",
        created_by: Number(adminId),
      },

      // Landlord 2 (박미경) - 2 properties
      {
        landlord_id: landlords[1].id,
        address: "경기도 평택시 서정동 서정로 210",
        address_detail: "래미안아파트 105동 803호",
        property_type: "apartment",
        size_pyeong: 34,
        rooms: 3,
        bathrooms: 2,
        monthly_rent_krw: 900000,
        deposit_krw: 5000000,
        status: "occupied",
        permission_status: "approved",
        management_phone: "031-655-1234",
        created_by: Number(adminId),
      },
      {
        landlord_id: landlords[1].id,
        address: "경기도 평택시 서정동 서정로 210",
        address_detail: "래미안아파트 105동 1201호",
        property_type: "apartment",
        size_pyeong: 25,
        rooms: 2,
        bathrooms: 1,
        monthly_rent_krw: 650000,
        deposit_krw: 3000000,
        status: "occupied",
        permission_status: "approved",
        management_phone: "031-655-1234",
        created_by: Number(adminId),
      },

      // Landlord 3 (이정호) - 2 properties (Osan area)
      {
        landlord_id: landlords[2].id,
        address: "경기도 오산시 오산로 89",
        address_detail: "오산타운 A동 502호",
        property_type: "apartment",
        size_pyeong: 30,
        rooms: 3,
        bathrooms: 2,
        monthly_rent_krw: 800000,
        deposit_krw: 5000000,
        status: "occupied",
        permission_status: "approved",
        created_by: Number(adminId),
      },
      {
        landlord_id: landlords[2].id,
        address: "경기도 오산시 수청로 156",
        address_detail: "햇살빌라 102호",
        property_type: "villa",
        size_pyeong: 22,
        rooms: 2,
        bathrooms: 1,
        monthly_rent_krw: 550000,
        deposit_krw: 2000000,
        status: "maintenance",
        permission_status: "approved",
        notes: "화장실 수리 중 (3월 말 완료 예정)",
        created_by: Number(adminId),
      },

      // Landlord 4 (최은주) - 2 properties
      {
        landlord_id: landlords[3].id,
        address: "경기도 평택시 비전동 비전로 340",
        address_detail: "힐스테이트 201동 1003호",
        property_type: "apartment",
        size_pyeong: 38,
        rooms: 4,
        bathrooms: 2,
        monthly_rent_krw: 1100000,
        deposit_krw: 10000000,
        status: "occupied",
        permission_status: "approved",
        management_phone: "031-658-9876",
        created_by: Number(adminId),
      },
      {
        landlord_id: landlords[3].id,
        address: "경기도 평택시 비전동 비전로 340",
        address_detail: "힐스테이트 201동 502호",
        property_type: "apartment",
        size_pyeong: 25,
        rooms: 2,
        bathrooms: 1,
        monthly_rent_krw: 650000,
        deposit_krw: 3000000,
        status: "vacant",
        permission_status: "pending",
        created_by: Number(adminId),
      },

      // Landlord 5 (정대민) - 1 property
      {
        landlord_id: landlords[4].id,
        address: "경기도 평택시 팽성읍 객사로 200",
        address_detail: "우성아파트 303동 701호",
        property_type: "apartment",
        size_pyeong: 28,
        rooms: 3,
        bathrooms: 1,
        monthly_rent_krw: 750000,
        deposit_krw: 5000000,
        status: "occupied",
        permission_status: "approved",
        created_by: Number(adminId),
      },
    ])
    .returning("id")
    .execute();

  console.log(`✓ ${properties.length} properties`);

  // Property equipment
  await db
    .insertInto("property_equipment")
    .values([
      {
        property_id: properties[0].id,
        name: "에어컨 (거실)",
        paid_by: "landlord",
        monthly_cost_krw: 0,
      },
      {
        property_id: properties[0].id,
        name: "에어컨 (안방)",
        paid_by: "landlord",
        monthly_cost_krw: 0,
      },
      {
        property_id: properties[0].id,
        name: "냉장고",
        paid_by: "landlord",
        monthly_cost_krw: 0,
      },
      {
        property_id: properties[0].id,
        name: "세탁기",
        paid_by: "landlord",
        monthly_cost_krw: 0,
      },
      {
        property_id: properties[0].id,
        name: "정수기",
        paid_by: "tenant",
        monthly_cost_krw: 25000,
        notes: "코웨이 렌탈",
      },
      {
        property_id: properties[3].id,
        name: "에어컨 (LG)",
        paid_by: "landlord",
        monthly_cost_krw: 0,
      },
      {
        property_id: properties[3].id,
        name: "빌트인 식기세척기",
        paid_by: "landlord",
        monthly_cost_krw: 0,
      },
      {
        property_id: properties[7].id,
        name: "에어컨 3대",
        paid_by: "landlord",
        monthly_cost_krw: 0,
      },
      {
        property_id: properties[7].id,
        name: "건조기",
        paid_by: "office",
        monthly_cost_krw: 30000,
      },
    ])
    .execute();

  console.log("✓ property equipment");

  // ─── Tenants ────────────────────────────────────────────────────────

  const tenants = await db
    .insertInto("tenant")
    .values([
      {
        name: "James Mitchell",
        rank: "E-6",
        unit: "2ID",
        phone: "010-9876-5432",
        email: "james.mitchell@army.mil",
        branch: "army",
        sex: "M",
        birth: "1990-06-14",
        deros: "2027-02-15",
        base_location_id: 1,
        status: "active",
        created_by: Number(adminId),
      },
      {
        name: "Sarah Thompson",
        rank: "O-3",
        unit: "51st FW",
        phone: "010-8765-4321",
        email: "sarah.thompson@us.af.mil",
        branch: "air_force",
        sex: "F",
        birth: "1988-09-23",
        deros: "2026-08-10",
        base_location_id: 2,
        status: "active",
        created_by: Number(adminId),
      },
      {
        name: "Robert Kim",
        rank: "E-5",
        unit: "2ID",
        phone: "010-7654-3210",
        email: "robert.kim@army.mil",
        branch: "army",
        sex: "M",
        birth: "1993-12-01",
        deros: "2026-11-20",
        base_location_id: 1,
        status: "active",
        notes: "한국어 가능",
        created_by: Number(adminId),
      },
      {
        name: "David Johnson",
        rank: "E-7",
        unit: "51st FW",
        phone: "010-6543-2109",
        email: "david.johnson@us.af.mil",
        branch: "air_force",
        sex: "M",
        birth: "1985-03-30",
        deros: "2027-05-01",
        base_location_id: 2,
        status: "active",
        created_by: Number(adminId),
      },
      {
        name: "Emily Davis",
        rank: "O-4",
        unit: "2ID",
        phone: "010-5432-1098",
        email: "emily.davis@army.mil",
        branch: "army",
        sex: "F",
        birth: "1984-07-18",
        deros: "2026-12-31",
        base_location_id: 1,
        status: "active",
        created_by: Number(adminId),
      },
      {
        name: "Michael Brown",
        rank: "E-4",
        unit: "2ID",
        phone: "010-4321-0987",
        email: "michael.brown@army.mil",
        branch: "army",
        sex: "M",
        birth: "1997-01-25",
        deros: "2026-06-15",
        base_location_id: 1,
        status: "active",
        created_by: Number(adminId),
      },
      {
        name: "Jessica Wilson",
        rank: "E-6",
        unit: "51st FW",
        phone: "010-3210-9876",
        email: "jessica.wilson@us.af.mil",
        branch: "air_force",
        sex: "F",
        birth: "1991-11-08",
        deros: "2027-03-20",
        base_location_id: 2,
        status: "active",
        created_by: Number(adminId),
      },
      {
        name: "Chris Anderson",
        rank: "E-5",
        unit: "2ID",
        phone: "010-2109-8765",
        email: "chris.anderson@army.mil",
        branch: "army",
        sex: "M",
        birth: "1994-04-12",
        deros: "2025-09-30",
        base_location_id: 1,
        status: "inactive",
        notes: "PCS 완료 (2025년 9월)",
        created_by: Number(adminId),
      },
    ])
    .returning("id")
    .execute();

  console.log(`✓ ${tenants.length} tenants`);

  // Tenant family members
  await db
    .insertInto("tenant_family_member")
    .values([
      {
        tenant_id: tenants[0].id,
        name: "Lisa Mitchell",
        relationship: "spouse",
        phone: "010-9876-0001",
        sex: "F",
        birth: "1991-02-20",
        base_location_id: 1,
      },
      {
        tenant_id: tenants[0].id,
        name: "Ethan Mitchell",
        relationship: "child",
        sex: "M",
        birth: "2018-05-10",
        base_location_id: 1,
      },
      {
        tenant_id: tenants[3].id,
        name: "Karen Johnson",
        relationship: "spouse",
        phone: "010-6543-0001",
        sex: "F",
        birth: "1987-08-14",
        base_location_id: 2,
      },
      {
        tenant_id: tenants[3].id,
        name: "Tyler Johnson",
        relationship: "child",
        sex: "M",
        birth: "2015-11-22",
        base_location_id: 2,
      },
      {
        tenant_id: tenants[3].id,
        name: "Grace Johnson",
        relationship: "child",
        sex: "F",
        birth: "2019-03-05",
        base_location_id: 2,
      },
      {
        tenant_id: tenants[4].id,
        name: "Mark Davis",
        relationship: "spouse",
        phone: "010-5432-0001",
        sex: "M",
        birth: "1983-12-09",
        base_location_id: 1,
      },
      {
        tenant_id: tenants[6].id,
        name: "Brian Wilson",
        relationship: "spouse",
        phone: "010-3210-0001",
        sex: "M",
        birth: "1990-06-17",
        base_location_id: 2,
      },
    ])
    .execute();

  console.log("✓ tenant family members");

  // Tenant pets
  await db
    .insertInto("tenant_pet")
    .values([
      {
        tenant_id: tenants[0].id,
        name: "Buddy",
        species: "dog",
        breed: "Golden Retriever",
        size: "large",
      },
      {
        tenant_id: tenants[2].id,
        name: "Mochi",
        species: "cat",
        breed: "Korean Shorthair",
        size: "small",
      },
      {
        tenant_id: tenants[4].id,
        name: "Max",
        species: "dog",
        breed: "French Bulldog",
        size: "small",
        notes: "알레르기 있음",
      },
    ])
    .execute();

  console.log("✓ tenant pets");

  // Tenant notes
  await db
    .insertInto("tenant_note")
    .values([
      {
        tenant_id: tenants[0].id,
        content: "2025년 12월 계약 갱신 완료. 월세 동결.",
        created_by: Number(adminId),
      },
      {
        tenant_id: tenants[2].id,
        content: "한국어 소통 가능. 한국인 어머니.",
        created_by: Number(adminId),
      },
      {
        tenant_id: tenants[5].id,
        content: "DEROS 임박 - 6월 퇴거 예정. 후임자 확인 필요.",
        created_by: Number(adminId),
      },
    ])
    .execute();

  console.log("✓ tenant notes");

  // ─── Leases ─────────────────────────────────────────────────────────

  const leases = await db
    .insertInto("lease")
    .values([
      // Active leases (7 occupied properties)
      {
        property_id: properties[0].id,
        tenant_id: tenants[0].id,
        start_date: "2025-01-01",
        end_date: "2026-12-31",
        monthly_rent_krw: 850000,
        deposit_krw: 5000000,
        status: "active",
        created_by: Number(adminId),
      },
      {
        property_id: properties[1].id,
        tenant_id: tenants[5].id,
        start_date: "2025-03-01",
        end_date: "2026-06-30",
        monthly_rent_krw: 600000,
        deposit_krw: 3000000,
        status: "active",
        notes: "DEROS 맞춤 계약기간",
        created_by: Number(adminId),
      },
      {
        property_id: properties[3].id,
        tenant_id: tenants[1].id,
        start_date: "2024-09-01",
        end_date: "2026-08-31",
        monthly_rent_krw: 900000,
        deposit_krw: 5000000,
        status: "active",
        created_by: Number(adminId),
      },
      {
        property_id: properties[4].id,
        tenant_id: tenants[2].id,
        start_date: "2025-02-01",
        end_date: "2026-11-30",
        monthly_rent_krw: 650000,
        deposit_krw: 3000000,
        status: "active",
        created_by: Number(adminId),
      },
      {
        property_id: properties[5].id,
        tenant_id: tenants[3].id,
        start_date: "2024-06-01",
        end_date: "2027-05-31",
        monthly_rent_krw: 800000,
        deposit_krw: 5000000,
        status: "active",
        created_by: Number(adminId),
      },
      {
        property_id: properties[7].id,
        tenant_id: tenants[4].id,
        start_date: "2024-12-01",
        end_date: "2026-12-31",
        monthly_rent_krw: 1100000,
        deposit_krw: 10000000,
        status: "active",
        created_by: Number(adminId),
      },
      {
        property_id: properties[9].id,
        tenant_id: tenants[6].id,
        start_date: "2025-04-01",
        end_date: "2027-03-31",
        monthly_rent_krw: 750000,
        deposit_krw: 5000000,
        status: "active",
        created_by: Number(adminId),
      },

      // Expired lease (Chris Anderson - PCS'd)
      {
        property_id: properties[2].id,
        tenant_id: tenants[7].id,
        start_date: "2023-10-01",
        end_date: "2025-09-30",
        monthly_rent_krw: 700000,
        deposit_krw: 3000000,
        status: "expired",
        notes: "PCS 퇴거 완료",
        created_by: Number(adminId),
      },
    ])
    .returning("id")
    .execute();

  console.log(`✓ ${leases.length} leases`);

  // ─── Exchange Rates ─────────────────────────────────────────────────

  const rates = await db
    .insertInto("exchange_rate")
    .values([
      {
        date: "2026-03-01",
        usd_to_krw: 1380,
        denomination: 100,
        set_by: Number(adminId),
      },
      {
        date: "2026-03-03",
        usd_to_krw: 1375,
        denomination: 100,
        set_by: Number(adminId),
      },
      {
        date: "2026-03-05",
        usd_to_krw: 1385,
        denomination: 100,
        set_by: Number(adminId),
      },
      {
        date: "2026-03-07",
        usd_to_krw: 1390,
        denomination: 100,
        set_by: Number(adminId),
      },
      {
        date: "2026-03-10",
        usd_to_krw: 1382,
        denomination: 100,
        set_by: Number(adminId),
      },
      {
        date: "2026-03-12",
        usd_to_krw: 1378,
        denomination: 100,
        set_by: Number(adminId),
      },
      {
        date: "2026-03-14",
        usd_to_krw: 1385,
        denomination: 100,
        set_by: Number(adminId),
      },
      {
        date: "2026-03-16",
        usd_to_krw: 1383,
        denomination: 100,
        set_by: Number(adminId),
      },
    ])
    .returning("id")
    .execute();

  console.log(`✓ ${rates.length} exchange rates`);

  // ─── Payments (Feb + Mar 2026) ──────────────────────────────────────

  // February rent payments (all paid)
  const febBundle = crypto.randomUUID();
  await db
    .insertInto("payment")
    .values([
      {
        lease_id: leases[0].id,
        payment_type: "rent",
        billing_month: "2026-02-01",
        amount_krw: 850000,
        currency_paid: "USD",
        amount_paid: 616,
        exchange_rate_id: rates[0].id,
        payment_method: "cash",
        payment_date: "2026-03-01",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[1].id,
        payment_type: "rent",
        billing_month: "2026-02-01",
        amount_krw: 600000,
        currency_paid: "KRW",
        amount_paid: 600000,
        payment_method: "transfer",
        payment_date: "2026-02-28",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[2].id,
        payment_type: "rent",
        billing_month: "2026-02-01",
        amount_krw: 900000,
        currency_paid: "USD",
        amount_paid: 652,
        exchange_rate_id: rates[0].id,
        payment_method: "cash",
        payment_date: "2026-03-01",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[3].id,
        payment_type: "rent",
        billing_month: "2026-02-01",
        amount_krw: 650000,
        currency_paid: "USD",
        amount_paid: 471,
        exchange_rate_id: rates[0].id,
        payment_method: "cash",
        payment_date: "2026-03-01",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[4].id,
        payment_type: "rent",
        billing_month: "2026-02-01",
        amount_krw: 800000,
        currency_paid: "USD",
        amount_paid: 580,
        exchange_rate_id: rates[0].id,
        payment_method: "cash",
        payment_date: "2026-03-01",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[5].id,
        payment_type: "rent",
        billing_month: "2026-02-01",
        amount_krw: 1100000,
        currency_paid: "USD",
        amount_paid: 797,
        exchange_rate_id: rates[0].id,
        payment_method: "cash",
        payment_date: "2026-03-03",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[6].id,
        payment_type: "rent",
        billing_month: "2026-02-01",
        amount_krw: 750000,
        currency_paid: "KRW",
        amount_paid: 750000,
        payment_method: "transfer",
        payment_date: "2026-03-02",
        status: "paid",
        received_by: Number(adminId),
      },
    ])
    .execute();

  // March rent payments (mixed: some paid, some pending)
  await db
    .insertInto("payment")
    .values([
      {
        lease_id: leases[0].id,
        payment_type: "rent",
        billing_month: "2026-03-01",
        amount_krw: 850000,
        currency_paid: "USD",
        amount_paid: 614,
        exchange_rate_id: rates[7].id,
        payment_method: "cash",
        payment_date: "2026-03-16",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[1].id,
        payment_type: "rent",
        billing_month: "2026-03-01",
        amount_krw: 600000,
        currency_paid: "KRW",
        amount_paid: 600000,
        payment_method: "transfer",
        payment_date: "2026-03-15",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[2].id,
        payment_type: "rent",
        billing_month: "2026-03-01",
        amount_krw: 900000,
        currency_paid: "USD",
        amount_paid: 651,
        exchange_rate_id: rates[7].id,
        payment_method: "cash",
        payment_date: "2026-03-16",
        status: "paid",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[3].id,
        payment_type: "rent",
        billing_month: "2026-03-01",
        amount_krw: 650000,
        currency_paid: "KRW",
        amount_paid: 650000,
        payment_method: "cash",
        payment_date: "2026-03-16",
        status: "pending",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[4].id,
        payment_type: "rent",
        billing_month: "2026-03-01",
        amount_krw: 800000,
        currency_paid: "KRW",
        amount_paid: 800000,
        payment_method: "cash",
        payment_date: "2026-03-16",
        status: "pending",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[5].id,
        payment_type: "rent",
        billing_month: "2026-03-01",
        amount_krw: 1100000,
        currency_paid: "KRW",
        amount_paid: 1100000,
        payment_method: "cash",
        payment_date: "2026-03-16",
        status: "pending",
        received_by: Number(adminId),
      },
      {
        lease_id: leases[6].id,
        payment_type: "rent",
        billing_month: "2026-03-01",
        amount_krw: 750000,
        currency_paid: "KRW",
        amount_paid: 750000,
        payment_method: "cash",
        payment_date: "2026-03-16",
        status: "pending",
        received_by: Number(adminId),
      },
    ])
    .execute();

  // Some utility payments (Feb)
  await db
    .insertInto("payment")
    .values([
      {
        lease_id: leases[0].id,
        payment_type: "utility",
        billing_month: "2026-02-01",
        amount_krw: 185000,
        currency_paid: "USD",
        amount_paid: 134,
        exchange_rate_id: rates[0].id,
        payment_method: "cash",
        payment_date: "2026-03-01",
        status: "paid",
        received_by: Number(adminId),
        bundle_id: febBundle,
      },
      {
        lease_id: leases[2].id,
        payment_type: "utility",
        billing_month: "2026-02-01",
        amount_krw: 210000,
        currency_paid: "USD",
        amount_paid: 152,
        exchange_rate_id: rates[0].id,
        payment_method: "cash",
        payment_date: "2026-03-01",
        status: "paid",
        received_by: Number(adminId),
      },
    ])
    .execute();

  console.log("✓ payments (Feb + Mar rent, Feb utilities)");

  // ─── Utility Bills ──────────────────────────────────────────────────

  // Feb utility bills for lease 1 (James Mitchell)
  await db
    .insertInto("utility_bill")
    .values([
      {
        lease_id: leases[0].id,
        utility_type_id: 1,
        billing_month: "2026-02-01",
        amount_krw: 45000,
        due_date: "2026-03-15",
        paid_to_company: true,
        paid_to_company_date: "2026-03-10",
      },
      {
        lease_id: leases[0].id,
        utility_type_id: 2,
        billing_month: "2026-02-01",
        amount_krw: 38000,
        due_date: "2026-03-15",
        paid_to_company: true,
        paid_to_company_date: "2026-03-10",
      },
      {
        lease_id: leases[0].id,
        utility_type_id: 3,
        billing_month: "2026-02-01",
        amount_krw: 22000,
        due_date: "2026-03-20",
        paid_to_company: true,
        paid_to_company_date: "2026-03-12",
      },
      {
        lease_id: leases[0].id,
        utility_type_id: 4,
        billing_month: "2026-02-01",
        amount_krw: 33000,
        due_date: "2026-03-25",
        paid_to_company: false,
      },
      {
        lease_id: leases[0].id,
        utility_type_id: 5,
        billing_month: "2026-02-01",
        amount_krw: 47000,
        due_date: "2026-03-25",
        paid_to_company: false,
      },
    ])
    .execute();

  // Feb utility bills for lease 3 (Sarah Thompson)
  await db
    .insertInto("utility_bill")
    .values([
      {
        lease_id: leases[2].id,
        utility_type_id: 1,
        billing_month: "2026-02-01",
        amount_krw: 52000,
        due_date: "2026-03-15",
        paid_to_company: true,
        paid_to_company_date: "2026-03-10",
      },
      {
        lease_id: leases[2].id,
        utility_type_id: 2,
        billing_month: "2026-02-01",
        amount_krw: 41000,
        due_date: "2026-03-15",
        paid_to_company: true,
        paid_to_company_date: "2026-03-10",
      },
      {
        lease_id: leases[2].id,
        utility_type_id: 3,
        billing_month: "2026-02-01",
        amount_krw: 28000,
        due_date: "2026-03-20",
        paid_to_company: false,
      },
      {
        lease_id: leases[2].id,
        utility_type_id: 4,
        billing_month: "2026-02-01",
        amount_krw: 33000,
        due_date: "2026-03-25",
        paid_to_company: false,
      },
      {
        lease_id: leases[2].id,
        utility_type_id: 5,
        billing_month: "2026-02-01",
        amount_krw: 56000,
        due_date: "2026-03-25",
        paid_to_company: false,
      },
    ])
    .execute();

  console.log("✓ utility bills");

  // ─── Service Requests ───────────────────────────────────────────────

  await db
    .insertInto("service_request")
    .values([
      {
        lease_id: leases[0].id,
        title: "거실 에어컨 작동 안됨",
        description:
          "거실 에어컨 전원은 들어오나 찬바람이 안 나옴. 필터 청소 후에도 동일 증상.",
        category: "hvac",
        status: "in_progress",
        logged_by: Number(adminId),
      },
      {
        lease_id: leases[2].id,
        title: "주방 수도 누수",
        description:
          "주방 싱크대 아래 배관에서 물이 새고 있음. 바닥에 물 고임.",
        category: "plumbing",
        status: "received",
        logged_by: Number(adminId),
      },
      {
        lease_id: leases[4].id,
        title: "현관 도어록 고장",
        description: "비밀번호 입력 후 잠금 해제가 안됨. 배터리 교체해도 동일.",
        category: "electrical",
        status: "completed",
        cost_krw: 150000,
        resolved_at: "2026-03-10",
        logged_by: Number(adminId),
      },
      {
        lease_id: leases[5].id,
        title: "화장실 환풍기 소음",
        description:
          "안방 화장실 환풍기에서 이상한 소리가 남. 특히 새벽에 심함.",
        category: "appliance",
        status: "escalated",
        escalated_to_landlord: true,
        logged_by: Number(adminId),
        notes: "임대인에게 연락 완료, 업체 방문 예정",
      },
    ])
    .execute();

  // Status logs for completed service request
  await db
    .insertInto("service_request_status_log")
    .values([
      {
        service_request_id: 3,
        status: "received",
        changed_by: Number(adminId),
        note: "접수",
      },
      {
        service_request_id: 3,
        status: "in_progress",
        changed_by: Number(adminId),
        note: "업체 방문 예약 (3/8)",
      },
      {
        service_request_id: 3,
        status: "completed",
        changed_by: Number(adminId),
        note: "도어록 교체 완료. 비용 150,000원 (임대인 부담)",
      },
    ])
    .execute();

  console.log("✓ service requests");

  // ─── Calendar Events ────────────────────────────────────────────────

  await db
    .insertInto("calendar_event")
    .values([
      {
        title: "Mitchell 계약 갱신 미팅",
        date: "2026-03-20",
        start_time: "14:00",
        end_time: "15:00",
        is_all_day: false,
        category: "contract_renewal",
        color: "primary",
        property_id: properties[0].id,
        tenant_id: tenants[0].id,
        created_by: Number(adminId),
        location: "사무실",
      },
      {
        title: "Brown 퇴거 점검",
        date: "2026-06-10",
        start_time: "10:00",
        end_time: "12:00",
        is_all_day: false,
        category: "move_out",
        color: "red",
        property_id: properties[1].id,
        tenant_id: tenants[5].id,
        created_by: Number(adminId),
      },
      {
        title: "3월 공과금 납부 마감",
        date: "2026-03-25",
        is_all_day: true,
        category: "utility_deadline",
        color: "amber",
        urgency: "high",
        created_by: Number(adminId),
      },
      {
        title: "오산타운 502호 점검",
        date: "2026-03-22",
        start_time: "11:00",
        end_time: "12:00",
        is_all_day: false,
        category: "inspection",
        color: "green",
        property_id: properties[5].id,
        created_by: Number(adminId),
        description: "환풍기 수리 업체 방문",
      },
      {
        title: "수청로 빌라 수리 완료 확인",
        date: "2026-03-30",
        is_all_day: true,
        category: "repair",
        color: "orange",
        property_id: properties[6].id,
        created_by: Number(adminId),
        description: "화장실 수리 완료 확인",
      },
    ])
    .execute();

  console.log("✓ calendar events");

  // ─── Ledger Entries ─────────────────────────────────────────────────

  await db
    .insertInto("ledger_entry")
    .values([
      {
        entry_type: "income",
        category: "rent_income",
        amount_krw: 5650000,
        description: "2월 월세 수납 (전체)",
        entry_date: "2026-03-03",
        recorded_by: Number(adminId),
      },
      {
        entry_type: "expense",
        category: "rent_expense",
        amount_krw: 5250000,
        description: "2월 임대인 월세 지급",
        entry_date: "2026-03-05",
        recorded_by: Number(adminId),
      },
      {
        entry_type: "income",
        category: "utility_income",
        amount_krw: 395000,
        description: "2월 공과금 수납 (Mitchell, Thompson)",
        entry_date: "2026-03-03",
        recorded_by: Number(adminId),
      },
      {
        entry_type: "expense",
        category: "utility_expense",
        amount_krw: 297000,
        description: "2월 공과금 납부 (전기, 가스, 수도)",
        entry_date: "2026-03-10",
        recorded_by: Number(adminId),
      },
      {
        entry_type: "expense",
        category: "service_expense",
        amount_krw: 150000,
        description: "Johnson 현관 도어록 교체",
        entry_date: "2026-03-10",
        recorded_by: Number(adminId),
        reference_type: "service_request",
        reference_id: 3,
      },
    ])
    .execute();

  console.log("✓ ledger entries");

  console.log("\n✅ Seed data complete!");

  await db.destroy();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
