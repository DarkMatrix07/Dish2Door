import assert from "node:assert/strict";
import test from "node:test";
import {
  getIndiaSpinDay,
  isSpinCouponUsable,
  isValidIndianMobile,
  normalizePhone,
  pickWeightedSegmentIndex,
  qualifiesForSpin,
  WHEEL_SEGMENTS
} from "../lib/spin-wheel";

test("everyone mode allows exactly one decision per day", () => {
  assert.equal(qualifiesForSpin({ effectiveCount: 0, forEveryone: true, usedToday: false }), true);
  assert.equal(qualifiesForSpin({ effectiveCount: 0, forEveryone: true, usedToday: true }), false);
});

test("regular mode keeps the reviewed-order window and daily cap", () => {
  assert.equal(qualifiesForSpin({ effectiveCount: 2, forEveryone: false, usedToday: false }), false);
  assert.equal(qualifiesForSpin({ effectiveCount: 3, forEveryone: false, usedToday: false }), true);
  assert.equal(qualifiesForSpin({ effectiveCount: 6, forEveryone: false, usedToday: false }), true);
  assert.equal(qualifiesForSpin({ effectiveCount: 7, forEveryone: false, usedToday: false }), false);
  assert.equal(qualifiesForSpin({ effectiveCount: 4, forEveryone: false, usedToday: true }), false);
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
