import assert from "node:assert/strict";
import test from "node:test";

// Synthetic doubles only: never loads .env and never reaches a database.
process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
process.env.BETTER_AUTH_SECRET = "admin-rewards-test-secret-not-production";
(globalThis as { prisma?: unknown }).prisma = {};

const {
  GIFT_DAYS,
  GIFT_PERCENTS,
  cancelPrizeBodySchema,
  giftCouponBodySchema,
  giftExpiry,
  giftWhatsAppMessage,
  giftWhatsAppUrl
} = await import("../lib/admin-rewards");
const { cancelPrizeTx, giveWheelCouponTx } = await import("../lib/admin-rewards-db");
const { generateWheelCouponCode, WHEEL_CODE_ALPHABET } = await import("../lib/wheel-coupon-code");
const { WHEEL_SEGMENTS } = await import("../lib/spin-wheel");

const NOW = new Date("2026-10-02T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

type Row = Record<string, any>;

// A tiny in-memory stand-in for the tables the prize actions touch. `where` supports plain
// equality, which is all these actions use. There is deliberately no spinUsage table, so
// any attempt to use up the daily spin throws.
function world(seed: { rewards?: Row[]; coupons?: Row[]; customers?: Row[] } = {}) {
  const customers: Row[] = seed.customers ?? [{ phone: "9876543210", name: "Asha Rao", email: "asha@example.com" }];
  const coupons: Row[] = seed.coupons ?? [];
  const rewards: Row[] = seed.rewards ?? [];
  let id = 0;
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
  const apply = (row: Row, data: Row) => Object.assign(row, data);

  const tx: any = {
    customer: { findUnique: async ({ where }: any) => customers.find((row) => matches(row, where)) ?? null },
    coupon: {
      findUnique: async ({ where }: any) => coupons.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ where, data }: any) => {
        const hit = coupons.filter((row) => matches(row, where));
        hit.forEach((row) => apply(row, data));
        return { count: hit.length };
      },
      create: async ({ data }: any) => {
        const row = { id: `c${++id}`, usedCount: 0, heldCount: 0, ...data };
        coupons.push(row);
        return row;
      }
    },
    spinReward: {
      findFirst: async ({ where }: any) => rewards.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ where, data }: any) => {
        const hit = rewards.filter((row) => matches(row, where));
        hit.forEach((row) => apply(row, data));
        return { count: hit.length };
      },
      create: async ({ data }: any) => {
        const row = { id: `r${++id}`, createdAt: NOW, redeemedAt: null, expiredAt: null, orderId: null, issuedById: null, issuedNote: null, ...data };
        rewards.push(row);
        return row;
      }
    }
  };
  return { tx, customers, coupons, rewards };
}

const live = (overrides: Row = {}) => ({
  id: "old-reward",
  phone: "9876543210",
  discountPercent: 6,
  couponCode: "WHEELOLD111",
  createdAt: new Date(NOW.getTime() - HOUR),
  redeemedAt: null,
  expiredAt: null,
  ...overrides
});
const oldCoupon = (overrides: Row = {}) => ({
  id: "old-coupon",
  code: "WHEELOLD111",
  active: true,
  maxUses: 1,
  usedCount: 0,
  heldCount: 0,
  expiresAt: new Date(NOW.getTime() + 5 * HOUR),
  ...overrides
});

const input = { phone: "9876543210", percent: 10, days: 1, note: "Sorry for the late order" };

test("gift percentages are exactly the wheel values, in order", () => {
  assert.deepEqual([...GIFT_PERCENTS], [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.deepEqual([...GIFT_PERCENTS], [...new Set(WHEEL_SEGMENTS.map((s) => s.percent))].sort((a, b) => a - b));
  assert.deepEqual([...GIFT_DAYS], [1, 3, 7]);
});

test("gift body: only wheel percentages, 1/3/7 days, valid phone, short note, no extras", () => {
  const ok = giftCouponBodySchema.parse({ phone: "+91 98765 43210", percent: 10, days: 3, note: "  hello  ", replace: true });
  assert.equal(ok.phone, "9876543210");
  assert.equal(ok.note, "hello");

  const bad = (body: unknown) => assert.equal(giftCouponBodySchema.safeParse(body).success, false);
  bad({ phone: "9876543210", percent: 5, days: 1 });
  bad({ phone: "9876543210", percent: 100, days: 1 });
  bad({ phone: "9876543210", percent: "10", days: 1 });
  bad({ phone: "9876543210", percent: 10, days: 2 });
  bad({ phone: "9876543210", percent: 10, days: 30 });
  bad({ phone: "1234567890", percent: 10, days: 1 });
  bad({ phone: "98765", percent: 10, days: 1 });
  bad({ phone: "9876543210", percent: 10, days: 1, note: "x".repeat(201) });
  bad({ phone: "9876543210", percent: 10, days: 1, discountPercent: 90 });
  assert.equal(giftCouponBodySchema.safeParse({ phone: "9876543210", percent: 16, days: 7, note: "x".repeat(200) }).success, true);
});

test("cancel body: phone and reward id only", () => {
  assert.equal(cancelPrizeBodySchema.parse({ phone: "9876543210", rewardId: "abc" }).rewardId, "abc");
  assert.equal(cancelPrizeBodySchema.safeParse({ phone: "9876543210" }).success, false);
  assert.equal(cancelPrizeBodySchema.safeParse({ phone: "9876543210", rewardId: "abc", extra: 1 }).success, false);
});

test("wheel code: WHEEL plus six characters from the shared alphabet", () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(generateWheelCouponCode(), /^WHEEL[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  }
  assert.equal(generateWheelCouponCode(() => 0), `WHEEL${WHEEL_CODE_ALPHABET[0].repeat(6)}`);
  assert.equal(generateWheelCouponCode(() => 0.999999), `WHEEL${WHEEL_CODE_ALPHABET.at(-1)!.repeat(6)}`);
});

test("WhatsApp message and link carry the code, percentage, expiry and the customer number", () => {
  const expiresAt = giftExpiry(1, NOW);
  assert.equal(expiresAt.getTime(), NOW.getTime() + 24 * HOUR);
  const message = giftWhatsAppMessage({ name: "Asha Rao", percent: 10, code: "WHEELABC234", expiresAt });
  assert.match(message, /^Hi Asha!/);
  assert.match(message, /10% off/);
  assert.match(message, /WHEELABC234/);
  assert.match(message, /3 Oct 2026, 3:30 pm/);
  assert.doesNotMatch(giftWhatsAppMessage({ percent: 10, code: "X", expiresAt }), /^Hi /);
  const url = giftWhatsAppUrl("98765 43210", message);
  assert.ok(url.startsWith("https://wa.me/919876543210?text="));
  assert.equal(decodeURIComponent(url.split("?text=")[1]), message);
});

test("giving a coupon creates a one-use wheel coupon and a gift prize, and never touches the daily spin", async () => {
  const w = world();
  const given = await giveWheelCouponTx(w.tx, input, "admin-1", NOW);

  assert.match(given.couponCode, /^WHEEL[A-Z2-9]{6}$/);
  assert.equal(given.percent, 10);
  assert.equal(given.expiresAt.getTime(), NOW.getTime() + 24 * HOUR);
  assert.equal(given.replacedCode, null);

  const [coupon] = w.coupons;
  assert.equal(coupon.code, given.couponCode);
  assert.equal(coupon.discountPercent, 10);
  assert.equal(coupon.maxUses, 1);
  assert.equal(coupon.active, true);
  assert.equal(coupon.description, "Gift from Dish2Door — 10% off");
  assert.equal(coupon.expiresAt.getTime(), given.expiresAt.getTime());

  const [reward] = w.rewards;
  assert.equal(reward.issuedById, "admin-1");
  assert.equal(reward.issuedNote, "Sorry for the late order");
  assert.equal(reward.name, "Asha Rao");
  assert.equal(reward.email, "asha@example.com");
  assert.equal(reward.couponCode, given.couponCode);
  assert.equal(reward.redeemedAt, null);
  assert.equal(reward.expiredAt, null);
});

test("a blank note is stored as nothing, and longer validity moves the expiry", async () => {
  const w = world();
  const given = await giveWheelCouponTx(w.tx, { phone: "9876543210", percent: 2, days: 7, note: "   " }, "admin-1", NOW);
  assert.equal(w.rewards[0].issuedNote, null);
  assert.equal(given.expiresAt.getTime(), NOW.getTime() + 7 * 24 * HOUR);
});

test("an unknown customer is refused and nothing is created", async () => {
  const w = world({ customers: [] });
  await assert.rejects(giveWheelCouponTx(w.tx, input, "admin-1", NOW), { status: 404 });
  assert.equal(w.coupons.length + w.rewards.length, 0);
});

test("a customer with a live prize is refused unless the admin chooses to replace it", async () => {
  const w = world({ rewards: [live()], coupons: [oldCoupon()] });
  await assert.rejects(giveWheelCouponTx(w.tx, input, "admin-1", NOW), (error: any) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /already has a 6% prize waiting \(WHEELOLD111\)/);
    return true;
  });
  assert.equal(w.rewards.length, 1);
  assert.equal(w.rewards[0].expiredAt, null);
  assert.equal(w.coupons[0].active, true);
});

test("replacing closes the old prize and its coupon, and issues the new one", async () => {
  const w = world({ rewards: [live()], coupons: [oldCoupon()] });
  const given = await giveWheelCouponTx(w.tx, { ...input, replace: true }, "admin-1", NOW);

  assert.equal(given.replacedCode, "WHEELOLD111");
  assert.equal(w.rewards[0].expiredAt, NOW);
  assert.equal(w.coupons[0].active, false);
  const fresh = w.rewards.find((reward) => reward.couponCode === given.couponCode)!;
  assert.equal(fresh.expiredAt, null);
  assert.equal(fresh.issuedById, "admin-1");
  // Exactly one prize is live afterwards.
  assert.equal(w.rewards.filter((reward) => !reward.redeemedAt && !reward.expiredAt).length, 1);
});

test("replacing is refused while an open checkout holds the old code, and nothing changes", async () => {
  const w = world({ rewards: [live()], coupons: [oldCoupon({ heldCount: 1 })] });
  await assert.rejects(giveWheelCouponTx(w.tx, { ...input, replace: true }, "admin-1", NOW), (error: any) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /started a checkout/);
    return true;
  });
  assert.equal(w.rewards.length, 1);
  assert.equal(w.rewards[0].expiredAt, null);
  assert.equal(w.coupons[0].active, true);
  assert.equal(w.coupons.length, 1);
});

test("a leftover prize whose code already ran out is cleared without asking to replace", async () => {
  const w = world({ rewards: [live()], coupons: [oldCoupon({ expiresAt: new Date(NOW.getTime() - HOUR) })] });
  const given = await giveWheelCouponTx(w.tx, input, "admin-1", NOW);
  assert.equal(given.replacedCode, null);
  assert.equal(w.rewards[0].expiredAt, NOW);
  assert.equal(w.rewards.length, 2);
});

test("a used prize does not stand in the way of a gift", async () => {
  const w = world({ rewards: [live({ redeemedAt: NOW })], coupons: [oldCoupon({ usedCount: 1 })] });
  const given = await giveWheelCouponTx(w.tx, input, "admin-1", NOW);
  assert.equal(given.replacedCode, null);
  assert.equal(w.rewards.length, 2);
});

test("cancelling closes a live prize and switches its coupon off", async () => {
  const w = world({ rewards: [live()], coupons: [oldCoupon()] });
  const result = await cancelPrizeTx(w.tx, { phone: "9876543210", rewardId: "old-reward" }, NOW);
  assert.equal(result.couponCode, "WHEELOLD111");
  assert.equal(w.rewards[0].expiredAt, NOW);
  assert.equal(w.coupons[0].active, false);
});

test("cancelling is refused while a checkout holds the code", async () => {
  const w = world({ rewards: [live()], coupons: [oldCoupon({ heldCount: 2 })] });
  await assert.rejects(cancelPrizeTx(w.tx, { phone: "9876543210", rewardId: "old-reward" }, NOW), { status: 409 });
  assert.equal(w.rewards[0].expiredAt, null);
  assert.equal(w.coupons[0].active, true);
});

test("cancelling refuses used, already closed, unknown and someone else prizes", async () => {
  const w = world({
    rewards: [live({ id: "used", redeemedAt: NOW }), live({ id: "closed", expiredAt: NOW }), live({ id: "mine" })],
    coupons: [oldCoupon()]
  });
  await assert.rejects(cancelPrizeTx(w.tx, { phone: "9876543210", rewardId: "used" }, NOW), /already been used/);
  await assert.rejects(cancelPrizeTx(w.tx, { phone: "9876543210", rewardId: "closed" }, NOW), /already closed/);
  await assert.rejects(cancelPrizeTx(w.tx, { phone: "9876543210", rewardId: "nope" }, NOW), { status: 404 });
  await assert.rejects(cancelPrizeTx(w.tx, { phone: "9123456780", rewardId: "mine" }, NOW), { status: 404 });
  assert.equal(w.coupons[0].active, true);
});
