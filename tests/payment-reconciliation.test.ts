import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.BETTER_AUTH_SECRET = "isolated-test-secret-not-production";
(globalThis as any).prisma = {};
const { reconcilePaymentEvent } = await import("../lib/payment-reconciliation");

function fixture() {
  const event: any = { id: "e1", razorpayOrderId: "provider1", razorpayPaymentId: "capture1", amountPaise: 100, currency: "INR", attempts: 0 };
  const order: any = { id: "local1", source: "CUSTOMER_ONLINE", trackingCode: "TRACK1", totalPaise: 100, payment: { razorpayOrderId: null } };
  let mapped = false;
  let confirmations = 0;
  let failConfirmation = false;
  let unrelated = false;
  const deps: any = {
    db: {
      paymentEvent: {
        findUnique: async () => event,
        update: async ({ data }: any) => {
          if (data.attempts) event.attempts += data.attempts.increment;
          const { attempts, ...rest } = data;
          Object.assign(event, rest);
        }
      },
      payment: {
        findUnique: async () => mapped ? { orderId: order.id } : null,
        updateMany: async () => { mapped = true; return { count: 1 }; }
      },
      order: { findUnique: async () => unrelated ? null : order }
    },
    fetchOrder: async () => ({ receipt: order.id, amount: 100, currency: "INR", notes: unrelated ? {} : { app: "dish2door", orderId: order.id } }),
    confirm: async () => { if (failConfirmation) throw Error("temporary"); confirmations++; return order; },
    site: () => "dish2door.store"
  };
  return { event, order, deps, confirmations: () => confirmations, fail: (value: boolean) => { failConfirmation = value; }, unrelated: () => { unrelated = true; } };
}

test("webhook before mapping recovers receipt, confirms, and duplicate replay is harmless", async () => {
  const f = fixture();
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.event.matched, true);
  assert.ok(f.event.processedAt);
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.confirmations(), 1);
});

test("failed confirmation remains durable and a later worker replay completes it", async () => {
  const f = fixture(); f.fail(true);
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.event.processedAt, undefined);
  assert.equal(f.event.attempts, 1);
  assert.ok(f.event.nextAttemptAt.getTime() > Date.now());
  f.fail(false);
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.event.matched, true);
});

test("conflicting amount is retained for triage and never confirmed", async () => {
  const f = fixture(); f.order.totalPaise = 200;
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.confirmations(), 0);
  assert.equal(f.event.processedAt, undefined);
  assert.equal(f.event.attempts, 1);
});

test("unrelated shared-account order is classified without local confirmation", async () => {
  const f = fixture(); f.unrelated();
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.confirmations(), 0);
  assert.equal(f.event.matched, false);
  assert.equal(f.event.lastError, "UNRELATED_PROVIDER_ORDER");
  assert.ok(f.event.processedAt);
});

test("receipt collision from another application never binds a local order", async () => {
  const f = fixture();
  f.deps.fetchOrder = async () => ({ receipt: f.order.id, amount: 100, currency: "INR", notes: { app: "another-app" } });
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.confirmations(), 0);
  assert.equal(f.event.processedAt, undefined);
  assert.equal(f.event.attempts, 1);
});
test("legacy server-authored tracking metadata recovers an old provider mapping", async () => {
  const f = fixture();
  f.deps.fetchOrder = async () => ({ receipt: f.order.id, amount: 100, currency: "INR", notes: { trackingCode: "TRACK1" } });
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.confirmations(), 1);
  assert.equal(f.event.matched, true);
});

test("a capture tagged for the other site is closed out, not retried", async () => {
  const f = fixture();
  f.deps.db.order.findUnique = async () => null;
  f.deps.fetchOrder = async () => ({ receipt: "srm-order", amount: 100, currency: "INR", notes: { app: "dish2door", site: "srm.dish2door.store", orderId: "srm-order" } });
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.confirmations(), 0);
  assert.equal(f.event.matched, false);
  assert.equal(f.event.lastError, "OTHER_SITE_ORDER");
  assert.ok(f.event.processedAt);
});

test("a capture tagged for this site whose order is missing keeps retrying", async () => {
  const f = fixture();
  f.deps.db.order.findUnique = async () => null;
  f.deps.fetchOrder = async () => ({ receipt: "gone", amount: 100, currency: "INR", notes: { app: "dish2door", site: "dish2door.store", orderId: "gone" } });
  f.event.attempts = 500;
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.event.processedAt, undefined);
  assert.equal(f.event.lastError, "LOCAL_ORDER_MISSING");
});

test("an untagged legacy capture with no local order retries, then is closed out", async () => {
  const f = fixture();
  f.deps.db.order.findUnique = async () => null;
  f.deps.fetchOrder = async () => ({ receipt: "old", amount: 100, currency: "INR", notes: { app: "dish2door", orderId: "old" } });
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.event.processedAt, undefined);
  assert.equal(f.event.lastError, "LOCAL_ORDER_MISSING");
  f.event.attempts = 24;
  await reconcilePaymentEvent("e1", f.deps);
  assert.equal(f.event.lastError, "OTHER_SITE_ORDER_LEGACY");
  assert.ok(f.event.processedAt);
  assert.equal(f.confirmations(), 0);
});
