import assert from "node:assert/strict";
import test from "node:test";

// Synthetic doubles only: never loads .env and never reaches a database.
process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
process.env.BETTER_AUTH_SECRET = "supersede-test-secret-not-production";
(globalThis as { prisma?: unknown }).prisma = {};

const { supersedeOwnUnpaidHolds } = await import("../lib/orders");

type Fixture = {
  order: { id: string; status: string; paymentStatus: string; checkoutState: string };
  payment: { captureState: string; refundState: string; razorpayPaymentId: string | null };
  reservation: { id: string; couponId: string; orderId: string; status: string };
};

function world(overrides: { payment?: Partial<Fixture["payment"]>; order?: Partial<Fixture["order"]> } = {}) {
  const fixture: Fixture = {
    order: { id: "stale-order", status: "ORDER_CONFIRMED", paymentStatus: "PENDING", checkoutState: "EXPIRED", ...overrides.order },
    payment: { captureState: "PENDING", refundState: "NONE", razorpayPaymentId: null, ...overrides.payment },
    reservation: { id: "hold-1", couponId: "wheel-coupon", orderId: "stale-order", status: "HELD" }
  };
  const coupon = { heldCount: 1, usedCount: 0 };
  let lastHoldQuery: any = null;
  const tx: any = {
    $queryRaw: async () => [{ id: fixture.order.id }],
    couponReservation: {
      findMany: async (args: any) => {
        lastHoldQuery = args;
        return fixture.reservation.status === "HELD" ? [{ orderId: fixture.order.id }] : [];
      },
      findUnique: async () => fixture.reservation,
      updateMany: async ({ where, data }: any) => {
        if (fixture.reservation.status !== where.status) return { count: 0 };
        Object.assign(fixture.reservation, data);
        return { count: 1 };
      }
    },
    order: {
      findUnique: async () => fixture.order,
      update: async ({ data }: any) => Object.assign(fixture.order, data)
    },
    payment: { findUnique: async () => fixture.payment },
    coupon: {
      update: async ({ data }: any) => {
        if (data.heldCount?.decrement) coupon.heldCount -= data.heldCount.decrement;
        return coupon;
      }
    }
  };
  return { fixture, coupon, tx, holdQuery: () => lastHoldQuery };
}

test("a newer checkout releases the same customer's unpaid coupon hold", async () => {
  const { fixture, coupon, tx } = world();

  const released = await supersedeOwnUnpaidHolds(tx, "wheel-coupon", "9000000001");

  assert.equal(released, 1);
  assert.equal(fixture.order.status, "CANCELLED");
  assert.equal(fixture.order.checkoutState, "ABANDONED");
  assert.equal(fixture.reservation.status, "RELEASED");
  assert.equal(coupon.heldCount, 0, "The single use is free for the new checkout");
});

test("only holds on this customer's own unpaid online orders are looked up", async () => {
  const { tx, holdQuery } = world();

  await supersedeOwnUnpaidHolds(tx, "wheel-coupon", "9000000001");

  const where = holdQuery().where;
  assert.equal(where.couponId, "wheel-coupon");
  assert.equal(where.status, "HELD");
  assert.equal(where.order.customerPhone, "9000000001", "Another customer's hold must never match");
  assert.equal(where.order.source, "CUSTOMER_ONLINE");
  assert.equal(where.order.paymentStatus, "PENDING");
});

test("a hold is kept whenever money may already have moved", async () => {
  for (const payment of [
    { razorpayPaymentId: "pay_123" },
    { captureState: "AUTHORIZED" },
    { captureState: "CAPTURED" },
    { refundState: "REQUESTED" }
  ]) {
    const { fixture, coupon, tx } = world({ payment });

    const released = await supersedeOwnUnpaidHolds(tx, "wheel-coupon", "9000000001");

    assert.equal(released, 0, JSON.stringify(payment));
    assert.equal(fixture.order.status, "ORDER_CONFIRMED");
    assert.equal(fixture.reservation.status, "HELD");
    assert.equal(coupon.heldCount, 1);
  }
});

test("an order that was paid between lookup and lock is left alone", async () => {
  const { fixture, tx } = world({ order: { paymentStatus: "PAID_ONLINE" } });

  const released = await supersedeOwnUnpaidHolds(tx, "wheel-coupon", "9000000001");

  assert.equal(released, 0);
  assert.equal(fixture.order.status, "ORDER_CONFIRMED");
  assert.equal(fixture.reservation.status, "HELD");
});
