import assert from "node:assert/strict";
import test from "node:test";
import { deriveReviewPasscode } from "../lib/order-codes";

test("review passcodes are stable four-digit values scoped to an order", () => {
  const secret = "test-secret-that-is-long-enough";
  const first = deriveReviewPasscode("ORDER-A", secret);

  assert.match(first, /^\d{4}$/);
  assert.equal(deriveReviewPasscode("ORDER-A", secret), first);
  assert.notEqual(deriveReviewPasscode("ORDER-B", secret), first);
  assert.notEqual(deriveReviewPasscode("ORDER-A", `${secret}-different`), first);
});
