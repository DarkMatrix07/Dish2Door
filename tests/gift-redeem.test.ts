import assert from "node:assert/strict";
import test from "node:test";

// Synthetic doubles only: never loads .env and never reaches a database.
process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
process.env.BETTER_AUTH_SECRET = "gift-redeem-test-secret-not-production";
(globalThis as { prisma?: unknown }).prisma = {};

const { redeemSpinRewardIfAny, restoreSpinRewardForCancelledOrder } = await import("../lib/orders");

type Row = Record<string, any>;

function world(reward: Row, customer: Row = { phone: "9876543210", spinBaseline: 1 }, reviewed = 4) {
  const rewards: Row[] = [reward];
  const state = { customer: { ...customer }, customerWrites: 0, couponDecrements: 0 };
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => (value && typeof value === "object" && "not" in value ? row[key] !== value.not : row[key] === value));
  const tx: any = {
    spinReward: {
      findFirst: async ({ where }: any) => rewards.find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: any) => Object.assign(rewards.find((row) => row.id === where.id)!, data)
    },
    order: { count: async () => reviewed },
    customer: {
      findUnique: async () => state.customer,
      upsert: async ({ update }: any) => {
        state.customerWrites += 1;
        Object.assign(state.customer, update);
      },
      updateMany: async ({ data }: any) => {
        state.customerWrites += 1;
        Object.assign(state.customer, data);
        return { count: 1 };
      }
    },
    coupon: {
      updateMany: async () => {
        state.couponDecrements += 1;
        return { count: 1 };
      }
    }
  };
  return { tx, rewards, state };
}

const base = { id: "r1", phone: "9876543210", couponCode: "WHEELGIFT22", redeemedAt: null, expiredAt: null, orderId: null, baselineBefore: null };

test("spending a wheel-won prize restarts the loyalty cycle and records the old baseline", async () => {
  const w = world({ ...base, issuedById: null });
  await redeemSpinRewardIfAny(w.tx, "WHEELGIFT22", "9876543210", "order-1");
  assert.ok(w.rewards[0].redeemedAt instanceof Date);
  assert.equal(w.rewards[0].orderId, "order-1");
  assert.equal(w.rewards[0].baselineBefore, 1);
  assert.equal(w.state.customer.spinBaseline, 4);
});

test("spending a gift marks it used but leaves the loyalty cycle alone", async () => {
  const w = world({ ...base, issuedById: "admin-1" });
  await redeemSpinRewardIfAny(w.tx, "WHEELGIFT22", "9876543210", "order-1");
  assert.ok(w.rewards[0].redeemedAt instanceof Date);
  assert.equal(w.rewards[0].orderId, "order-1");
  assert.equal(w.rewards[0].baselineBefore, null);
  assert.equal(w.state.customer.spinBaseline, 1);
  assert.equal(w.state.customerWrites, 0);
});

test("a coupon that is not a wheel prize for this phone is a no-op", async () => {
  const w = world({ ...base, issuedById: "admin-1" });
  await redeemSpinRewardIfAny(w.tx, "OTHERCODE", "9876543210", "order-1");
  await redeemSpinRewardIfAny(w.tx, "WHEELGIFT22", "9123456780", "order-1");
  assert.equal(w.rewards[0].redeemedAt, null);
});

test("cancelling the order reopens a used gift without rewinding any baseline", async () => {
  const w = world({ ...base, issuedById: "admin-1", redeemedAt: new Date(), orderId: "order-1" }, { phone: "9876543210", spinBaseline: 1 });
  await restoreSpinRewardForCancelledOrder(w.tx, "order-1", "WHEELGIFT22");
  assert.equal(w.rewards[0].redeemedAt, null);
  assert.equal(w.rewards[0].orderId, null);
  assert.equal(w.state.couponDecrements, 1);
  assert.equal(w.state.customer.spinBaseline, 1);
  assert.equal(w.state.customerWrites, 0);
});

test("cancelling the order still rewinds the cycle for a wheel-won prize", async () => {
  const w = world(
    { ...base, issuedById: null, redeemedAt: new Date(), orderId: "order-1", baselineBefore: 1 },
    { phone: "9876543210", spinBaseline: 4 }
  );
  await restoreSpinRewardForCancelledOrder(w.tx, "order-1", "WHEELGIFT22");
  assert.equal(w.rewards[0].redeemedAt, null);
  assert.equal(w.state.customer.spinBaseline, 1);
});
