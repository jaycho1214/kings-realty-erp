import { test } from "node:test";
import assert from "node:assert/strict";
import { redirect } from "next/navigation";
import { runAction, ValidationError, isValidationError } from "./form-action";
import { parseCustomerIntake } from "./customer-intake";

// The reported bug: submitting 새 고객 without a 기지 threw out of the server
// action, so production stripped the message and staff got a blank error card
// with a digest. The intake parser must now reach the form as returned state.
test("새 고객 without 기지 reports the Korean message, not a digest", async () => {
  const fd = new FormData();
  fd.set("name", "홍길동");
  fd.set("phone", "010-1234-5678");
  fd.set("base_location_id", "");

  const state = await runAction(async () => {
    parseCustomerIntake(fd, { today: "2026-07-24" });
  });

  assert.equal(state.error, "기지를 선택해주세요.");
});

test("a ValidationError message reaches the caller verbatim", async () => {
  const state = await runAction(async () => {
    throw new ValidationError("기지를 선택해주세요.");
  });
  assert.equal(state.error, "기지를 선택해주세요.");
});

test("success returns no error", async () => {
  const state = await runAction(async () => {});
  assert.equal(state.error, undefined);
});

test("an unexpected error is masked, not leaked to the UI", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const state = await runAction(async () => {
      throw new Error(
        'duplicate key value violates unique constraint "tenant_pkey"',
      );
    });
    assert.ok(state.error, "should still report something");
    assert.ok(
      !state.error.includes("tenant_pkey"),
      `internal detail leaked: ${state.error}`,
    );
  } finally {
    console.error = original;
  }
});

test("redirect() propagates instead of being swallowed", async () => {
  await assert.rejects(
    runAction(async () => {
      redirect("/tenants/1");
    }),
    // Next signals navigation by throwing; runAction must not convert it to state.
    (err: unknown) => err instanceof Error && !isValidationError(err),
  );
});

test("isValidationError recognises a cross-chunk duplicate", () => {
  const lookalike = new Error("기지를 선택해주세요.");
  lookalike.name = "ValidationError";
  assert.equal(isValidationError(lookalike), true);
  assert.equal(isValidationError(new Error("boom")), false);
});
