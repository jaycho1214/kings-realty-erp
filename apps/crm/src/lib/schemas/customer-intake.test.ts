/**
 * Ported verbatim from the hand-written parser's suite (src/lib/customer-intake
 * .test.ts) so the zod schema is held to exactly the old behaviour — same
 * messages, same defaults, same coercions. Only the call shape changed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerIntakeSchema,
  toIntakePlan,
  normalizePhone,
  escapeHtml,
} from "./customer-intake";
import { parseForm } from "./parse";

const TODAY = "2026-07-10";

const plan = (fd: FormData) =>
  toIntakePlan(parseForm(customerIntakeSchema({ today: TODAY }), fd));

/** The per-field message the server would put on `name`. */
function fieldErrors(fd: FormData): Record<string, string> {
  try {
    plan(fd);
    return {};
  } catch (e) {
    return (e as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
  }
}

function bare(): FormData {
  const fd = new FormData();
  fd.set("name", "BOUCHER, Jeremy");
  fd.set("phone", "010-8037-7805");
  // NOT NULL column; the form pre-fills it, the schema requires it.
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
  const p = plan(bare());
  assert.equal(p.tenant.name, "BOUCHER, Jeremy");
  assert.equal(p.tenant.phone, "010-8037-7805");
  assert.equal(p.housing, null);
  assert.equal(p.memo, null);
});

test("missing name or phone → Korean error", () => {
  const noName = bare();
  noName.set("name", "  ");
  assert.throws(() => plan(noName), { message: "이름을 입력해주세요." });
  const noPhone = bare();
  noPhone.delete("phone");
  assert.throws(() => plan(noPhone), { message: "전화번호를 입력해주세요." });
});

test("full form → housing plan with new landlord", () => {
  const p = plan(full());
  assert.ok(p.housing);
  assert.equal(p.housing.address, "경기도 평택시 수정구 자곡동 290");
  assert.equal(p.housing.addressJibeon, null); // free text, no Postcodify
  assert.deepEqual(p.housing.landlord, {
    mode: "new",
    name: "강웅식",
    phone: "010-4924-4005",
  });
  assert.equal(p.housing.monthlyRentKrw, "3900000");
  assert.equal(p.housing.startDate, "2026-07-09");
  assert.equal(p.housing.endDate, "2029-07-08");
  assert.equal(p.memo, "선불금 6,140,000");
});

test("picked landlord id wins over typed name", () => {
  const fd = full();
  fd.set("landlord_id", "5");
  assert.deepEqual(plan(fd).housing?.landlord, {
    mode: "existing",
    landlordId: 5,
  });
});

test("address without landlord name → error", () => {
  const fd = full();
  fd.delete("landlord_id");
  fd.set("landlord_name", "");
  assert.throws(() => plan(fd), {
    message: "집주인 이름을 입력해주세요. (주소를 입력할 때 필요합니다)",
  });
});

test("rent/landlord without address → error, not silent drop", () => {
  const fd = bare();
  fd.set("monthly_rent_krw", "1000000");
  assert.throws(() => plan(fd), {
    message: "계약 정보를 입력하려면 주소를 입력해주세요.",
  });
});

test("blank rent/deposit/dates get defaults", () => {
  const fd = full();
  fd.set("monthly_rent_krw", "");
  fd.set("deposit_krw", "");
  fd.set("start_date", "");
  fd.set("end_date", "");
  const p = plan(fd);
  assert.equal(p.housing?.monthlyRentKrw, "0");
  assert.equal(p.housing?.depositKrw, "0");
  assert.equal(p.housing?.startDate, TODAY);
  assert.equal(p.housing?.endDate, "2027-07-10");
});

test("negative rent and end<=start are rejected", () => {
  const bad = full();
  bad.set("monthly_rent_krw", "-5");
  assert.throws(() => plan(bad), {
    message: "월세를 0 이상의 숫자로 입력해주세요.",
  });
  const flipped = full();
  flipped.set("end_date", "2026-07-09");
  assert.throws(() => plan(flipped), {
    message: "계약 종료일은 시작일 이후여야 합니다.",
  });
});

test("Postcodify fields pass through when present", () => {
  const fd = full();
  fd.set("address_jibeon", "경기도 평택시 자곡동 290");
  fd.set("address_en", "290, Jagok-dong, Pyeongtaek-si");
  const p = plan(fd);
  assert.equal(p.housing?.addressJibeon, "경기도 평택시 자곡동 290");
  assert.equal(p.housing?.addressEn, "290, Jagok-dong, Pyeongtaek-si");
  assert.equal(p.housing?.addressDetail, "1층");
});

test("base_location_id is required (form pre-fills it; schema defends)", () => {
  const fd = bare();
  fd.set("base_location_id", "3");
  assert.equal(plan(fd).tenant.baseLocationId, 3);
  const missing = bare();
  missing.delete("base_location_id");
  assert.throws(() => plan(missing), { message: "기지를 선택해주세요." });
});

test("normalizePhone strips everything but digits", () => {
  assert.equal(normalizePhone("010-4924-4005"), "01049244005");
  assert.equal(normalizePhone("+82 10 4924 4005"), "821049244005");
});

test("escapeHtml escapes &, <, >", () => {
  assert.equal(escapeHtml("a<b>&c"), "a&lt;b&gt;&amp;c");
});

// --- new capability the hand-written parser did not have ---

test("errors are attributed to the field that caused them", () => {
  const missing = bare();
  missing.delete("base_location_id");
  assert.equal(fieldErrors(missing).base_location_id, "기지를 선택해주세요.");

  const noLandlord = full();
  noLandlord.set("landlord_name", "");
  assert.equal(
    fieldErrors(noLandlord).landlord_name,
    "집주인 이름을 입력해주세요. (주소를 입력할 때 필요합니다)",
  );

  const flipped = full();
  flipped.set("end_date", "2026-07-09");
  assert.equal(
    fieldErrors(flipped).end_date,
    "계약 종료일은 시작일 이후여야 합니다.",
  );
});

test("every bad field is reported at once, not one per round-trip", () => {
  const fd = new FormData();
  fd.set("name", "");
  fd.set("phone", "");
  fd.set("base_location_id", "");
  const errs = fieldErrors(fd);
  assert.deepEqual(Object.keys(errs).sort(), [
    "base_location_id",
    "name",
    "phone",
  ]);
});
