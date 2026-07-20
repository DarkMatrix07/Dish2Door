import assert from "node:assert/strict";
import test from "node:test";
import {
  getIndiaSpinDay,
  isSpinCouponUsable,
  isValidIndianMobile,
  normalizePhone,
  pickWeightedSegmentIndex,
  qualifiesForSpin,
  reviewsUntilSpin,
  shouldRevertEveryoneMode,
  WHEEL_SEGMENTS
} from "../lib/spin-wheel";


test("everyone mode allows exactly one decision per day", () => {
  assert.equal(qualifiesForSpin({ effectiveCount: 0, forEveryone: true, usedToday: false }), true);
  assert.equal(qualifiesForSpin({ effectiveCount: 0, forEveryone: true, usedToday: true }), false);
});

test("regular mode unlocks on the 4th order and never ages out", () => {
  // 3 reviewed orders in the cycle unlocks the wheel on the 4th order.
  assert.equal(qualifiesForSpin({ effectiveCount: 2, forEveryone: false, usedToday: false }), false);
  assert.equal(qualifiesForSpin({ effectiveCount: 3, forEveryone: false, usedToday: false }), true);
  // No upper cap: loyal customers keep earning instead of ageing out at 6.
  assert.equal(qualifiesForSpin({ effectiveCount: 7, forEveryone: false, usedToday: false }), true);
  assert.equal(qualifiesForSpin({ effectiveCount: 40, forEveryone: false, usedToday: false }), true);
  // The daily cap still wins over everything.
  assert.equal(qualifiesForSpin({ effectiveCount: 4, forEveryone: false, usedToday: true }), false);
});

test("reviews-until-spin drives the cart progress nudge", () => {
  assert.equal(reviewsUntilSpin(0), 3);
  assert.equal(reviewsUntilSpin(2), 1);
  assert.equal(reviewsUntilSpin(3), 0);
  assert.equal(reviewsUntilSpin(9), 0);
});

test("everyone-mode promo reverts once its ordering window closes", () => {
  const base = { forEveryone: true, untilDay: "2026-07-20", closeMinute: 1050 };
  // Same day, window still open -> promo keeps running.
  assert.equal(shouldRevertEveryoneMode({ ...base, today: "2026-07-20", nowMinute: 1049 }), false);
  // Same day, window closed -> revert.
  assert.equal(shouldRevertEveryoneMode({ ...base, today: "2026-07-20", nowMinute: 1050 }), true);
  // A later day always reverts, even mid-window.
  assert.equal(shouldRevertEveryoneMode({ ...base, today: "2026-07-21", nowMinute: 600 }), true);
  // Never touches a promo that is already off, or one with no end day recorded.
  assert.equal(shouldRevertEveryoneMode({ ...base, forEveryone: false, today: "2026-07-25", nowMinute: 1400 }), false);
  assert.equal(shouldRevertEveryoneMode({ ...base, untilDay: null, today: "2026-07-25", nowMinute: 1400 }), false);
});

test("IST spin day changes at India midnight", () => {
  assert.equal(getIndiaSpinDay(new Date("2026-07-20T18:29:59.999Z")), "2026-07-20");
  assert.equal(getIndiaSpinDay(new Date("2026-07-20T18:30:00.000Z")), "2026-07-21");
});

test("phone variants collapse to one valid daily identity", () => {
  assert.equal(normalizePhone("+91 90631 79365"), "9063179365");
  assert.equal(normalizePhone("09063179365"), "9063179365");
  assert.equal(isValidIndianMobile("+91 90631 79365"), true);
  assert.equal(isValidIndianMobile("1234567890"), false);
});

test("weighted selection stays inside the configured wheel", () => {
  assert.equal(pickWeightedSegmentIndex(0), 0);
  assert.equal(pickWeightedSegmentIndex(0.999999), WHEEL_SEGMENTS.length - 1);
  for (let step = 0; step < 1000; step += 1) {
    const index = pickWeightedSegmentIndex(step / 1000);
    assert.ok(index >= 0 && index < WHEEL_SEGMENTS.length);
  }
});

test("expired, inactive, and exhausted reward coupons are unusable", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  const usable = { active: true, expiresAt: new Date("2026-07-20T13:00:00.000Z"), maxUses: 1, usedCount: 0 };
  assert.equal(isSpinCouponUsable(usable, now), true);
  assert.equal(isSpinCouponUsable({ ...usable, active: false }, now), false);
  assert.equal(isSpinCouponUsable({ ...usable, expiresAt: now }, now), false);
  assert.equal(isSpinCouponUsable({ ...usable, usedCount: 1 }, now), false);
  assert.equal(isSpinCouponUsable(null, now), false);
});
