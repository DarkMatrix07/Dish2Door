// The discount wheel is offered to loyal-but-not-yet-regular customers: those who
// have placed between MIN and MAX *reviewed* orders (only orders a customer rated
// count towards the total). Outside that window the wheel is never shown.
export const SPIN_MIN_FEEDBACK_ORDERS = 3;
export const SPIN_MAX_FEEDBACK_ORDERS = 6;

// Wheel faces run 2% -> 16% in steps of 2. Two intentional design constraints:
//  1. Display order is jumbled, NOT ascending, so neighbours aren't 2/4/6.
//  2. Odds are uneven and skewed low — small discounts are common, 16% is rare.
// `weight` is a relative probability; the winning face is chosen server-side.
export const WHEEL_SEGMENTS = [
  { percent: 6, weight: 22 },
  { percent: 2, weight: 30 },
  { percent: 12, weight: 6 },
  { percent: 4, weight: 26 },
  { percent: 16, weight: 2 },
  { percent: 8, weight: 13 },
  { percent: 14, weight: 3 },
  { percent: 10, weight: 8 }
] as const;

export const WHEEL_TOTAL_WEIGHT = WHEEL_SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);

export function isSpinEligible(feedbackOrderCount: number) {
  return feedbackOrderCount >= SPIN_MIN_FEEDBACK_ORDERS && feedbackOrderCount <= SPIN_MAX_FEEDBACK_ORDERS;
}

// Whether a customer qualifies for a new spin. The daily usage row is authoritative
// in every mode; regulars must additionally be inside the reviewed-order window.
export function qualifiesForSpin({
  effectiveCount,
  forEveryone,
  usedToday
}: {
  effectiveCount: number;
  forEveryone: boolean;
  usedToday: boolean;
}) {
  if (usedToday) return false;
  return forEveryone || isSpinEligible(effectiveCount);
}

// India has a fixed UTC+05:30 offset and no daylight-saving changes. A string is
// stored instead of a timestamp so the database can enforce one use per IST day.
export function getIndiaSpinDay(now = new Date()) {
  const INDIA_OFFSET_MS = 330 * 60 * 1000;
  return new Date(now.getTime() + INDIA_OFFSET_MS).toISOString().slice(0, 10);
}

type CouponState = {
  active: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
};

export function isSpinCouponUsable(coupon: CouponState | null, now = new Date()) {
  return Boolean(
    coupon &&
      coupon.active &&
      (!coupon.expiresAt || coupon.expiresAt > now) &&
      (coupon.maxUses === null || coupon.usedCount < coupon.maxUses)
  );
}

// Given a uniform random number in [0, 1), return the index into WHEEL_SEGMENTS of
// the winning face, respecting each face's weight.
export function pickWeightedSegmentIndex(random: number) {
  let threshold = random * WHEEL_TOTAL_WEIGHT;
  for (let index = 0; index < WHEEL_SEGMENTS.length; index += 1) {
    threshold -= WHEEL_SEGMENTS[index].weight;
    if (threshold < 0) return index;
  }
  return WHEEL_SEGMENTS.length - 1;
}

// A given discount can appear on only one face today, so the first match is safe.
export function segmentIndexForPercent(percent: number) {
  const index = WHEEL_SEGMENTS.findIndex((segment) => segment.percent === percent);
  return index === -1 ? 0 : index;
}

// Phone numbers are typed inconsistently (spaces, +91, leading 0). Normalise to the
// last 10 digits so lookups and the one-spin-per-phone rule are stable.
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

export function isValidIndianMobile(phone: string) {
  return /^[6-9]\d{9}$/.test(normalizePhone(phone));
}
