import assert from "node:assert/strict";
import test from "node:test";
import { PublicError, publicErrorMessage } from "../lib/public-error";

test("error contracts never expose SQL/provider messages even when they contain domain keywords", () => {
  const fallback = "Could not place the order";
  for (const error of [
    new Error('Invalid prisma.coupon invocation at /srv/app/lib/orders.ts: secret DATABASE_URL'),
    new Error('Restaurant phone=9000000001 campus query failed: password=secret'),
    { name: "PublicError", message: "provider API secret" },
    "cart secret"
  ]) assert.equal(publicErrorMessage(error, fallback), fallback);
  assert.equal(publicErrorMessage(new PublicError("This coupon has expired"), fallback), "This coupon has expired");
});
