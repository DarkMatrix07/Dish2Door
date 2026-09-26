import assert from "node:assert/strict";
import test from "node:test";
import { getCheckoutAttempt, markCheckoutPending, completeCheckoutAttempt, claimCheckout, releaseCheckout, hasPendingCheckout, saveCheckoutProof, getPendingCheckout, markCheckoutTerminal } from "../lib/checkout-attempt-client";
import { forgetStoredIdentity, readStoredIdentity, writeStoredIdentity } from "../lib/customer-identity";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }
};
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

test("checkout retries share capabilities and preserve unresolved capture", async () => {
  const first = await getCheckoutAttempt("fixture-cart");
  const retry = await getCheckoutAttempt("fixture-cart");
  assert.equal(retry.key, first.key);
  assert.equal(retry.capability, first.capability);
  markCheckoutPending(first);
  assert.equal((await getCheckoutAttempt("fixture-cart")).pending, true);
  completeCheckoutAttempt(first);
  assert.notEqual((await getCheckoutAttempt("fixture-cart")).key, first.key);
});

test("contact prefill requires explicit opt-in and can be forgotten", () => {
  const identity = { name: "Fixture", email: "fixture@example.test", phone: "9000000001" };
  writeStoredIdentity(identity);
  assert.equal(readStoredIdentity(), null);
  writeStoredIdentity(identity, { remember: true });
  assert.deepEqual(readStoredIdentity(), identity);
  forgetStoredIdentity();
  assert.equal(readStoredIdentity(), null);
});

test("a second tab cannot start while a checkout is open or awaiting capture", async () => {
  const owner = await claimCheckout();
  assert.ok(owner);
  assert.equal(await claimCheckout(), null);
  releaseCheckout("another-tab");
  assert.equal(await claimCheckout(), null);
  const attempt = await getCheckoutAttempt("another-cart");
  markCheckoutPending(attempt, owner);
  assert.equal(hasPendingCheckout(), true);
  releaseCheckout(owner);
  assert.equal(await claimCheckout(), null);
  completeCheckoutAttempt(attempt);
  assert.equal(hasPendingCheckout(), false);
  const nextOwner = await claimCheckout();
  assert.ok(nextOwner);
  releaseCheckout(nextOwner);
});

test("signed callback survives reload and refund resolution blocks only the old attempt", async () => {
  const attempt = await getCheckoutAttempt("refunded-cart");
  markCheckoutPending(attempt);
  const proof = { razorpayOrderId: "order_test", razorpayPaymentId: "pay_test", razorpaySignature: "signed" };
  saveCheckoutProof(proof);
  assert.deepEqual(getPendingCheckout()?.proof, proof);
  markCheckoutTerminal();
  assert.equal(hasPendingCheckout(), false);
  assert.equal((await getCheckoutAttempt("refunded-cart")).terminal, true);
  const nextOwner = await claimCheckout();
  assert.ok(nextOwner);
  releaseCheckout(nextOwner);
});

test("an abandoned opening claim frees itself in minutes, not half an hour", async () => {
  const owner = await claimCheckout();
  assert.ok(owner);
  const stored = JSON.parse(values.get("dish2door_checkout_active") ?? "null");
  assert.equal(stored.state, "opening");
  // A tab closed mid-payment used to block this browser for 30 minutes.
  assert.ok(stored.expiresAt - Date.now() <= 3 * 60_000);

  // Simulate the owning tab dying: its lease lapses and a new checkout may start.
  values.set("dish2door_checkout_active", JSON.stringify({ ...stored, expiresAt: Date.now() - 1 }));
  const next = await claimCheckout();
  assert.ok(next);
  assert.notEqual(next, owner);
  releaseCheckout(next);
});
