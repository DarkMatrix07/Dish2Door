import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
process.env.BETTER_AUTH_SECRET = "checkout-test-secret-not-production";
const key = randomUUID();
const capability = randomUUID();
const body = { customer: { name: "Fixture", email: "fixture@example.test", phone: "9000000001", deliveryType: "GATE", orderSlot: "NIGHT" }, items: [{ menuItemId: "fixture-item", quantity: 1 }] };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
let prior: any;
let creationError: unknown = { code: "P2002" };
let deleted: any[] = [];
let deleteCount = 1;
(globalThis as any).prisma = {
  checkoutAttempt: {
    create: async () => { if (creationError) throw creationError; return { id: "new-attempt" }; },
    findUnique: async () => prior,
    deleteMany: async (query: unknown) => { deleted.push(query); return { count: deleteCount }; }
  },
  systemSettings: { upsert: async () => { throw new Error("transient database connection failure"); } }
};
const { POST, GET, DELETE } = await import("../app/api/orders/create-payment/route");

function reset() {
  creationError = { code: "P2002" };
  deleted = [];
  deleteCount = 1;
  prior = { capabilityHash: hash(capability), payloadHash: hash(JSON.stringify(body)), order: {
    id: "fixture-order", paymentStatus: "PENDING", status: "ORDER_CONFIRMED", checkoutState: "OPEN", totalPaise: 12300,
    customerName: "Fixture", customerEmail: "fixture@example.test", customerPhone: "9000000001",
    payment: { razorpayOrderId: "order_fixture", captureState: "PENDING", refundState: "NONE" }
  } };
}
function request(overrides?: { capability?: string; payload?: unknown }) {
  return POST(new Request("http://localhost/api/orders/create-payment", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, "Checkout-Capability": overrides?.capability ?? capability },
    body: JSON.stringify(overrides?.payload ?? body)
  }));
}

test("checkout retries return the existing provider order without creating another order", async () => {
  reset();
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).razorpayOrderId, "order_fixture");
});

test("checkout key alone cannot retrieve another customer's checkout", async () => {
  reset();
  const response = await request({ capability: randomUUID() });
  assert.equal(response.status, 409);
  assert.equal(JSON.stringify(await response.json()).includes("fixture@example.test"), false);
});

test("checkout key cannot be reused with a modified cart", async () => {
  reset();
  assert.equal((await request({ payload: { ...body, items: [{ menuItemId: "fixture-item", quantity: 2 }] } })).status, 409);
});

test("unmapped and completed checkouts do not start another payment", async () => {
  reset(); prior.order.payment.razorpayOrderId = null;
  assert.equal((await request()).status, 409);
  reset(); prior.order.paymentStatus = "PAID_ONLINE";
  assert.equal((await request()).status, 409);
});

test("expired, authorized and refund-pending checkouts cannot reopen payment", async () => {
  reset(); prior.order.checkoutState = "EXPIRED";
  assert.equal((await request()).status, 409);
  reset(); prior.order.payment.captureState = "AUTHORIZED";
  assert.equal((await request()).status, 409);
  reset(); prior.order.payment.refundState = "REQUESTED";
  assert.equal((await request()).status, 409);
});

test("database errors containing domain keywords are never reflected", async () => {
  reset(); creationError = new Error("Prisma restaurant coupon secret database internals");
  const response = await request();
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes("secret database"), false);
});

test("capability-bound status lookup supports confirmation and refund recovery", async () => {
  reset();
  const statusRequest = (secret = capability) => GET(new Request("http://localhost/api/orders/create-payment", {
    headers: { "Idempotency-Key": key, "Checkout-Capability": secret }
  }));
  assert.equal((await statusRequest(randomUUID())).status, 404);
  const pending = await statusRequest();
  assert.equal((await pending.json()).status, "pending");
  prior.order.paymentStatus = "PAID_ONLINE";
  prior.order.trackingCode = "TRACK-TEST";
  const confirmed = await statusRequest();
  assert.deepEqual(await confirmed.json(), { status: "confirmed", trackingCode: "TRACK-TEST" });
  prior.order.status = "CANCELLED";
  const refunded = await statusRequest();
  assert.equal((await refunded.json()).status, "refund_pending");
});

test("expired and cancelled unpaid attempts report recoverable states", async () => {
  reset();
  prior.order.checkoutState = "EXPIRED";
  const headers = { "Idempotency-Key": key, "Checkout-Capability": capability };
  const expired = await GET(new Request("http://localhost/api/orders/create-payment", { headers }));
  assert.equal((await expired.json()).status, "expired");
  const denied = await DELETE(new Request("http://localhost/api/orders/create-payment", {
    method: "DELETE", headers: { ...headers, "Checkout-Capability": randomUUID() }
  }));
  assert.equal(denied.status, 404);
  prior.order.status = "CANCELLED";
  prior.order.checkoutState = "ABANDONED";
  const cancelled = await GET(new Request("http://localhost/api/orders/create-payment", { headers }));
  assert.equal((await cancelled.json()).status, "cancelled");
  assert.equal((await DELETE(new Request("http://localhost/api/orders/create-payment", { method: "DELETE", headers }))).status, 409);
});

test("a transient failure before order linkage releases its checkout claim", async () => {
  reset(); creationError = null;
  const OriginalDate = Date;
  const morning = new OriginalDate("2026-09-24T04:00:00.000Z").getTime();
  globalThis.Date = class extends OriginalDate {
    constructor(...args: any[]) { super(args.length ? args[0] : morning); }
    static now() { return morning; }
  } as DateConstructor;
  try {
    const response = await request();
    assert.equal(response.status, 503);
    assert.deepEqual(deleted, [{ where: { id: "new-attempt", orderId: null } }]);
  } finally {
    globalThis.Date = OriginalDate;
  }
});

test("an old orphaned claim can be conditionally cancelled with its capability", async () => {
  reset();
  prior.order = null;
  prior.id = "orphan-attempt";
  prior.createdAt = new Date(Date.now() - 6 * 60_000);
  const headers = { "Idempotency-Key": key, "Checkout-Capability": capability };
  assert.equal((await (await GET(new Request("http://localhost/api/orders/create-payment", { headers }))).json()).status, "expired");
  const recovered = await DELETE(new Request("http://localhost/api/orders/create-payment", { method: "DELETE", headers }));
  assert.equal((await recovered.json()).status, "cancelled");
  assert.equal(deleted[0].where.id, "orphan-attempt");
  assert.equal(deleted[0].where.orderId, null);
  assert.ok(deleted[0].where.createdAt.lt instanceof Date);
  deleteCount = 0;
  assert.equal((await DELETE(new Request("http://localhost/api/orders/create-payment", { method: "DELETE", headers }))).status, 409);
});
