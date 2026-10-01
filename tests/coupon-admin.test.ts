import assert from "node:assert/strict";
import test from "node:test";
import {
  COUPON_IN_USE_MESSAGE,
  couponDeleteBlock,
  couponState,
  expiryFromDay,
  expiryProblem,
  expiryToDay,
  isWheelCode,
  matchesCouponFilter,
  maxUsesProblem,
  parseCouponFilter,
  usesLeft
} from "../lib/coupon-admin";

const now = new Date("2026-10-02T10:00:00Z");

test("state: expired beats paused, paused beats active", () => {
  assert.equal(couponState({ active: true, expiresAt: null }, now), "active");
  assert.equal(couponState({ active: false, expiresAt: null }, now), "paused");
  assert.equal(couponState({ active: true, expiresAt: "2026-10-01T00:00:00Z" }, now), "expired");
  assert.equal(couponState({ active: false, expiresAt: "2026-10-01T00:00:00Z" }, now), "expired");
  assert.equal(couponState({ active: true, expiresAt: "2026-10-03T00:00:00Z" }, now), "active");
});

test("filter chips: unknown values fall back to Active, All shows everything", () => {
  assert.equal(parseCouponFilter("paused"), "paused");
  assert.equal(parseCouponFilter("nonsense"), "active");
  assert.equal(parseCouponFilter(undefined), "active");
  assert.equal(matchesCouponFilter({ active: false, expiresAt: null }, "all", now), true);
  assert.equal(matchesCouponFilter({ active: false, expiresAt: null }, "active", now), false);
  assert.equal(matchesCouponFilter({ active: false, expiresAt: null }, "paused", now), true);
});

test("uses left counts open checkouts as taken and never goes negative", () => {
  assert.equal(usesLeft({ maxUses: null, usedCount: 5, heldCount: 1 }), null);
  assert.equal(usesLeft({ maxUses: 10, usedCount: 3, heldCount: 2 }), 5);
  assert.equal(usesLeft({ maxUses: 2, usedCount: 2, heldCount: 1 }), 0);
});

test("an expiry day means the end of that day in India", () => {
  assert.equal(expiryFromDay("2026-10-05")?.toISOString(), "2026-10-05T18:30:00.000Z");
  assert.equal(expiryFromDay("2026-02-31"), undefined);
  assert.equal(expiryFromDay("soon"), undefined);
});

test("the expiry day shown is the one that was picked, including old midnight-UTC codes", () => {
  assert.equal(expiryToDay(expiryFromDay("2026-10-05") as Date), "2026-10-05");
  assert.equal(expiryToDay("2026-10-05T00:00:00.000Z"), "2026-10-05");
  assert.equal(expiryToDay(null), "");
  assert.equal(expiryToDay("garbage"), "");
});

test("an expiry in the past is refused, today is fine", () => {
  assert.equal(expiryProblem(null, now), null);
  assert.equal(expiryProblem("2026-10-02", now), null);
  assert.notEqual(expiryProblem("2026-10-01", now), null);
  assert.notEqual(expiryProblem("2026-13-01", now), null);
  // 02:30 IST on 3 Oct is still 2 Oct in UTC; "today" is the IST day.
  const lateUtc = new Date("2026-10-02T21:00:00Z");
  assert.equal(expiryProblem("2026-10-03", lateUtc), null);
  assert.notEqual(expiryProblem("2026-10-02", lateUtc), null);
});

test("max uses cannot drop below what is used or held", () => {
  assert.equal(maxUsesProblem(null, 9, 1), null);
  assert.equal(maxUsesProblem(undefined, 9, 1), null);
  assert.equal(maxUsesProblem(10, 9, 1), null);
  assert.match(maxUsesProblem(5, 4, 2) ?? "", /cannot be lower than 6/);
  assert.match(maxUsesProblem(3, 5, 0) ?? "", /5 used/);
});

test("a coupon is deletable only if it never touched an order", () => {
  assert.equal(couponDeleteBlock({ usedCount: 0, heldCount: 0, orderCount: 0 }), null);
  assert.equal(couponDeleteBlock({ usedCount: 1, heldCount: 0, orderCount: 0 }), COUPON_IN_USE_MESSAGE);
  assert.equal(couponDeleteBlock({ usedCount: 0, heldCount: 1, orderCount: 0 }), COUPON_IN_USE_MESSAGE);
  assert.equal(couponDeleteBlock({ usedCount: 0, heldCount: 0, orderCount: 2 }), COUPON_IN_USE_MESSAGE);
  assert.equal(couponDeleteBlock({ usedCount: 0, heldCount: 0, orderCount: 0 }, 1), COUPON_IN_USE_MESSAGE);
});

test("wheel codes are recognised in any letter case", () => {
  assert.equal(isWheelCode("WHEELAB12"), true);
  assert.equal(isWheelCode("wheelab12"), true);
  assert.equal(isWheelCode("D2DABC"), false);
});
