// Regression checks for the review findings. Synthetic fixtures only; never loads .env.
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

process.env.DATABASE_URL = "postgresql://review:review@127.0.0.1:1/review";
process.env.BETTER_AUTH_SECRET = "synthetic-review-secret-not-production";
delete process.env.TRUST_PROXY;
globalThis.fetch = async () => { throw new Error("Review probe forbids external requests"); };

const coupon = { id: "fixture-coupon", code: "FIXTURE", maxUses: 1, heldCount: 1, usedCount: 0 };
const order: any = { id: "fixture-order", trackingCode: "FIXTURE", source: "CUSTOMER_ONLINE", paymentStatus: "PENDING", status: "ORDER_CONFIRMED", checkoutState: "OPEN", couponCode: "FIXTURE", customerPhone: "9000000001" };
const payment: any = { amountPaise: 10000, currency: "INR", razorpayOrderId: "fixture-rp" };
let reservation: any = { id: "fixture-hold", couponId: coupon.id, orderId: order.id, status: "HELD" };
const applyCounters = (data: any) => {
  for (const key of ["usedCount", "heldCount"] as const) {
    if (data[key]?.increment) coupon[key] += data[key].increment;
    if (data[key]?.decrement) coupon[key] -= data[key].decrement;
  }
};
const tx: any = {
  $queryRaw: async () => [{ id: order.id }],
  $executeRaw: async () => {
    if (coupon.usedCount + coupon.heldCount >= coupon.maxUses) return 0;
    coupon.usedCount++;
    return 1;
  },
  order: {
    findUnique: async () => order,
    updateMany: async ({ where, data }: any) => {
      if (where.paymentStatus && where.paymentStatus !== order.paymentStatus) return { count: 0 };
      if (where.checkoutState && where.checkoutState !== order.checkoutState) return { count: 0 };
      Object.assign(order, data);
      return { count: 1 };
    },
    update: async ({ data }: any) => { if (data.payment) Object.assign(payment, data.payment.update); Object.assign(order, Object.fromEntries(Object.entries(data).filter(([key]) => key !== "payment"))); return order; },
    findUniqueOrThrow: async () => order
  },
  payment: { findUnique: async () => payment, update: async ({ data }: any) => Object.assign(payment, data) },
  couponReservation: {
    findUnique: async () => reservation,
    updateMany: async ({ where, data }: any) => {
      if (!reservation || reservation.status !== where.status) return { count: 0 };
      Object.assign(reservation, data);
      return { count: 1 };
    },
    update: async ({ data }: any) => Object.assign(reservation, data)
  },
  coupon: {
    updateMany: async ({ data }: any) => { applyCounters(data); return { count: 1 }; },
    update: async ({ data }: any) => { applyCounters(data); return coupon; }
  },
  spinReward: { findFirst: async () => null }
};
const counts = new Map<string, number>();
const db: any = {
  $transaction: async (work: any) => work(tx),
  order: {
    findMany: async () => [{ id: order.id }],
    findUnique: async () => null // Background notification lookup sends nothing.
  },
  user: { findFirst: async () => ({ id: "fixture-user", active: true, role: "ADMIN", passwordHash: "synthetic" }) },
  auditEvent: { create: async () => ({}) },
  $queryRaw: async (_parts: any, ...values: any[]) => {
    const key = values[0];
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return [{ count, expiresAt: new Date(Date.now() + 900000) }];
  }
};
(globalThis as any).prisma = db;
const service = await import("../lib/orders");
const { prisma } = await import("../lib/db");
assert.equal(prisma, db, "Must use fake Prisma, never a real database");

const capture = () => service.confirmOnlineOrder(order.id, { razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: "fixture-pay", amountPaise: 10000, currency: "INR", captured: true });
await service.cleanupStalePendingOrders();
assert.equal(reservation.status, "HELD");
assert.equal(coupon.heldCount, 1);
assert.equal(order.checkoutState, "EXPIRED");
assert.equal(coupon.usedCount + coupon.heldCount, coupon.maxUses, "No capacity available to a second buyer");
await capture();
assert.equal(coupon.usedCount, 1);
assert.equal(coupon.heldCount, 0);
assert.equal(order.paymentStatus, "PAID_ONLINE");
await capture();
assert.equal(coupon.usedCount, 1, "Duplicate capture is idempotent");
console.log("PASS: expiry retains capacity, late capture consumes once.");

Object.assign(order, { paymentStatus: "PENDING", checkoutState: "OPEN" });
reservation = null;
coupon.usedCount = 0;
await capture();
assert.equal(coupon.usedCount, 1);
assert.equal(order.paymentStatus, "PAID_ONLINE");
console.log("PASS: legacy pending coupon order consumes capacity.");

Object.assign(order, { paymentStatus: "PENDING", status: "ORDER_CONFIRMED" });
reservation = { id: "released", couponId: coupon.id, status: "RELEASED" };
await capture();
assert.equal(coupon.usedCount, 1, "Exhausted capacity must never increment");
assert.equal(order.status, "CANCELLED");
assert.equal(payment.refundState, "REQUESTED");
assert.equal(payment.captureState, "CAPTURED");
console.log("PASS: released/exhausted quote enters refund review without fulfillment.");

Object.assign(payment, { status: "REFUNDED", refundState: "SUCCEEDED" });
await capture();
assert.equal(payment.refundState, "SUCCEEDED", "Capture replay preserves completed refund");
assert.equal(order.paymentStatus, "REFUNDED");
console.log("PASS: cancelled capture replay preserves refund truth.");

Object.assign(order, { status: "ORDER_CONFIRMED", paymentStatus: "PENDING" });
Object.assign(payment, { status: "PENDING", refundState: "NONE" });
reservation = { id: "cancel-held", couponId: coupon.id, status: "HELD" };
coupon.heldCount = 1;
coupon.usedCount = 0;
await service.cancelOrder(order.id, false);
assert.equal(reservation.status, "RELEASED");
assert.equal(coupon.heldCount, 0);
coupon.usedCount = 1; // Another buyer can now use the released capacity.
await capture();
assert.equal(order.status, "CANCELLED");
assert.equal(coupon.usedCount, 1);
assert.equal(payment.refundState, "REQUESTED");
assert.equal(order.paymentStatus, "PAID_ONLINE");
console.log("PASS: explicit cancellation releases capacity; late capture never fulfills recycled quote.");

Object.assign(order, { status: "ORDER_CONFIRMED", paymentStatus: "PENDING", checkoutState: "EXPIRED" });
Object.assign(payment, { captureState: "AUTHORIZED", refundState: "NONE", razorpayPaymentId: null });
reservation = { id: "customer-cancel-held", couponId: coupon.id, status: "HELD" };
coupon.heldCount = 1;
await assert.rejects(service.cancelOrder(order.id, false, true), /already being processed/);
assert.equal(reservation.status, "HELD");
Object.assign(payment, { captureState: "PENDING" });
await service.cancelOrder(order.id, false, true);
assert.equal(order.checkoutState, "ABANDONED");
assert.equal(reservation.status, "RELEASED");
assert.equal(coupon.heldCount, 0);
console.log("PASS: customer expiry cancellation refuses authorization and releases only unprocessed quotes.");

let passwordChecks = 0;
const originalCompare = bcrypt.compare;
(bcrypt as any).compare = async () => { passwordChecks++; return false; };
try {
  const login = await import("../app/api/session/login/route");
  const attempt = () => login.POST(new Request("http://review.invalid/api/session/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "staff@example.invalid", password: "wrong-password" })
  }));
  for (let i = 0; i < 81; i++) await attempt();
  const afterLimit = await attempt();
  assert.equal(afterLimit.status, 429);
  assert.ok(passwordChecks <= 80, "Over-limit requests must not compare passwords");
  console.log("PASS: account budget enforced before bcrypt with TRUST_PROXY unset.");
} finally {
  bcrypt.compare = originalCompare;
}
console.log("Security regressions passed with isolated doubles; no production requests or records used.");
