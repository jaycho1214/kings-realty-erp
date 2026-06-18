import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLeaseIntake } from "./lease-intake";

function base(): FormData {
  const fd = new FormData();
  fd.set("property_mode", "new");
  fd.set("property_address", "평택시 …");
  fd.set("property_type", "apartment");
  fd.set("landlord_mode", "new");
  fd.set("landlord_name", "홍길동");
  fd.set("landlord_phone", "010-1111-2222");
  fd.set("tenant_mode", "new");
  fd.set("tenant_name", "John Doe");
  fd.set("tenant_phone", "010-3333-4444");
  fd.set("base_location_id", "1");
  fd.set("start_date", "2026-07-01");
  fd.set("end_date", "2027-07-01");
  fd.set("monthly_rent_krw", "1500000");
  fd.set("deposit_krw", "10000000");
  return fd;
}

test("new/new/new builds create plans for all entities", () => {
  const plan = parseLeaseIntake(base(), { canViewRrn: true });
  assert.equal(plan.property.mode, "new");
  assert.equal(plan.landlord?.mode, "new");
  assert.equal(plan.tenant.mode, "new");
  assert.equal(plan.terms.monthlyRentKrw, "1500000");
});

test("existing property drops the landlord plan (landlord = null)", () => {
  const fd = base();
  fd.set("property_mode", "existing");
  fd.set("property_id", "42");
  const plan = parseLeaseIntake(fd, { canViewRrn: true });
  assert.deepEqual(plan.property, { mode: "existing", propertyId: 42 });
  assert.equal(plan.landlord, null);
});

test("existing tenant uses the id", () => {
  const fd = base();
  fd.set("tenant_mode", "existing");
  fd.set("tenant_id", "7");
  const plan = parseLeaseIntake(fd, { canViewRrn: true });
  assert.deepEqual(plan.tenant, { mode: "existing", tenantId: 7 });
});

test("co-lessors are collected; blank rows skipped; loop stops at first absent", () => {
  const fd = base();
  fd.set("landlord_rrn", "900101-1234567");
  fd.set("lessor[0].name", "김영희");
  fd.set("lessor[0].relationship", "spouse");
  fd.set("lessor[0].phone", "010-5555-6666");
  fd.set("lessor[0].rrn", "910202-2345678");
  fd.set("lessor[1].name", "   "); // blank → skipped
  const plan = parseLeaseIntake(fd, { canViewRrn: true });
  assert.equal(plan.landlord?.mode, "new");
  const L = plan.landlord as Extract<typeof plan.landlord, { mode: "new" }>;
  assert.equal(L.rrn, "900101-1234567");
  assert.equal(L.coLessors.length, 1);
  assert.equal(L.coLessors[0].name, "김영희");
  assert.equal(L.coLessors[0].rrn, "910202-2345678");
});

test("RRN is dropped entirely when canViewRrn is false", () => {
  const fd = base();
  fd.set("landlord_rrn", "900101-1234567");
  fd.set("lessor[0].name", "김영희");
  fd.set("lessor[0].rrn", "910202-2345678");
  const plan = parseLeaseIntake(fd, { canViewRrn: false });
  const L = plan.landlord as Extract<typeof plan.landlord, { mode: "new" }>;
  assert.equal(L.rrn, null);
  assert.equal(L.coLessors[0].rrn, null);
});

test("missing required fields throw Korean errors", () => {
  const fd = base();
  fd.delete("landlord_name");
  assert.throws(() => parseLeaseIntake(fd, { canViewRrn: true }), /임대인 성명/);

  const fd2 = base();
  fd2.set("property_mode", "existing");
  // no property_id
  assert.throws(() => parseLeaseIntake(fd2, { canViewRrn: true }), /매물을 선택/);

  const fd3 = base();
  fd3.set("monthly_rent_krw", "abc");
  assert.throws(() => parseLeaseIntake(fd3, { canViewRrn: true }), /월세/);
});
