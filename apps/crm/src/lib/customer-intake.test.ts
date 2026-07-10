import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCustomerIntake,
  normalizePhone,
  escapeHtml,
} from "./customer-intake";

const TODAY = "2026-07-10";

function bare(): FormData {
  const fd = new FormData();
  fd.set("name", "BOUCHER, Jeremy");
  fd.set("phone", "010-8037-7805");
  // NOT NULL column; the form pre-fills it, the parser requires it.
  fd.set("base_location_id", "1");
  return fd;
}

function full(): FormData {
  const fd = bare();
  fd.set("rank", "E-8");
  fd.set("unit", "2ID");
  fd.set("address", "경기도 평택시 수정구 자곡동 290");
  fd.set("address_detail", "1층");
  fd.set("landlord_name", "강웅식");
  fd.set("landlord_phone", "010-4924-4005");
  fd.set("monthly_rent_krw", "3900000");
  fd.set("deposit_krw", "3525000");
  fd.set("start_date", "2026-07-09");
  fd.set("end_date", "2029-07-08");
  fd.set("memo", "선불금 6,140,000");
  return fd;
}

test("name+phone only → bare tenant, housing null", () => {
  const plan = parseCustomerIntake(bare(), { today: TODAY });
  assert.equal(plan.tenant.name, "BOUCHER, Jeremy");
  assert.equal(plan.tenant.phone, "010-8037-7805");
  assert.equal(plan.housing, null);
  assert.equal(plan.memo, null);
});

test("missing name or phone → Korean error", () => {
  const noName = bare();
  noName.set("name", "  ");
  assert.throws(() => parseCustomerIntake(noName, { today: TODAY }), {
    message: "이름을 입력해주세요.",
  });
  const noPhone = bare();
  noPhone.delete("phone");
  assert.throws(() => parseCustomerIntake(noPhone, { today: TODAY }), {
    message: "전화번호를 입력해주세요.",
  });
});

test("full form → housing plan with new landlord", () => {
  const plan = parseCustomerIntake(full(), { today: TODAY });
  assert.ok(plan.housing);
  assert.equal(plan.housing.address, "경기도 평택시 수정구 자곡동 290");
  assert.equal(plan.housing.addressJibeon, null); // free text, no Postcodify
  assert.deepEqual(plan.housing.landlord, {
    mode: "new",
    name: "강웅식",
    phone: "010-4924-4005",
  });
  assert.equal(plan.housing.monthlyRentKrw, "3900000");
  assert.equal(plan.housing.startDate, "2026-07-09");
  assert.equal(plan.housing.endDate, "2029-07-08");
  assert.equal(plan.memo, "선불금 6,140,000");
});

test("picked landlord id wins over typed name", () => {
  const fd = full();
  fd.set("landlord_id", "5");
  const plan = parseCustomerIntake(fd, { today: TODAY });
  assert.deepEqual(plan.housing?.landlord, { mode: "existing", landlordId: 5 });
});

test("address without landlord name → error", () => {
  const fd = full();
  fd.delete("landlord_id");
  fd.set("landlord_name", "");
  assert.throws(() => parseCustomerIntake(fd, { today: TODAY }), {
    message: "집주인 이름을 입력해주세요. (주소를 입력할 때 필요합니다)",
  });
});

test("rent/landlord without address → error, not silent drop", () => {
  const fd = bare();
  fd.set("monthly_rent_krw", "1000000");
  assert.throws(() => parseCustomerIntake(fd, { today: TODAY }), {
    message: "계약 정보를 입력하려면 주소를 입력해주세요.",
  });
});

test("blank rent/deposit/dates get defaults", () => {
  const fd = full();
  fd.set("monthly_rent_krw", "");
  fd.set("deposit_krw", "");
  fd.set("start_date", "");
  fd.set("end_date", "");
  const plan = parseCustomerIntake(fd, { today: TODAY });
  assert.equal(plan.housing?.monthlyRentKrw, "0");
  assert.equal(plan.housing?.depositKrw, "0");
  assert.equal(plan.housing?.startDate, TODAY);
  assert.equal(plan.housing?.endDate, "2027-07-10");
});

test("negative rent and end<=start are rejected", () => {
  const bad = full();
  bad.set("monthly_rent_krw", "-5");
  assert.throws(() => parseCustomerIntake(bad, { today: TODAY }), {
    message: "월세를 0 이상의 숫자로 입력해주세요.",
  });
  const flipped = full();
  flipped.set("end_date", "2026-07-09");
  assert.throws(() => parseCustomerIntake(flipped, { today: TODAY }), {
    message: "계약 종료일은 시작일 이후여야 합니다.",
  });
});

test("Postcodify fields pass through when present", () => {
  const fd = full();
  fd.set("address_jibeon", "경기도 평택시 자곡동 290");
  fd.set("address_en", "290, Jagok-dong, Pyeongtaek-si");
  const plan = parseCustomerIntake(fd, { today: TODAY });
  assert.equal(plan.housing?.addressJibeon, "경기도 평택시 자곡동 290");
  assert.equal(plan.housing?.addressEn, "290, Jagok-dong, Pyeongtaek-si");
  assert.equal(plan.housing?.addressDetail, "1층");
});

test("base_location_id is required (form pre-fills it; parser defends)", () => {
  const fd = bare();
  fd.set("base_location_id", "3");
  assert.equal(
    parseCustomerIntake(fd, { today: TODAY }).tenant.baseLocationId,
    3,
  );
  const missing = bare();
  missing.delete("base_location_id");
  assert.throws(() => parseCustomerIntake(missing, { today: TODAY }), {
    message: "기지를 선택해주세요.",
  });
});

test("normalizePhone strips everything but digits", () => {
  assert.equal(normalizePhone("010-4924-4005"), "01049244005");
  assert.equal(normalizePhone("+82 10 4924 4005"), "821049244005");
});

test("escapeHtml escapes &, <, >", () => {
  assert.equal(escapeHtml("a<b>&c"), "a&lt;b&gt;&amp;c");
});
