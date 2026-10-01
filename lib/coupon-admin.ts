// The rules behind the Coupons screen, kept pure (no database, no React) so the page, the
// API and the tests agree on them. Only coupons the owner made live here: the one-time
// codes the discount wheel hands out are managed on the Discount wheel page.
import { istDayKey, parseIstDay } from "@/lib/ist-day";

// Wheel prizes are coupons whose code starts with this (see app/api/customer/spin/route.ts).
// Kept as its own constant because lib/analytics-sql.ts pulls the Prisma runtime into
// whatever imports it, and this file is also used by the browser.
export const WHEEL_CODE_PREFIX = "WHEEL";

export const MAX_COUPON_PERCENT = 100;
export const MAX_COUPON_USES = 1_000_000;

// What the screen and the API pass around. Dates are ISO text so it crosses the
// server/browser line unchanged.
export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  discountPercent: number;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  heldCount: number;
  expiresAt: string | null;
  createdAt: string;
  // Orders that carry this code, paid or not. Zero together with no uses is what makes a
  // coupon safe to delete.
  orderCount: number;
};

export type CouponState = "active" | "paused" | "expired";
export const COUPON_FILTERS = ["active", "paused", "expired", "all"] as const;
export type CouponFilter = (typeof COUPON_FILTERS)[number];

export function parseCouponFilter(value: string | null | undefined): CouponFilter {
  return COUPON_FILTERS.includes(value as CouponFilter) ? (value as CouponFilter) : "active";
}

type StateInput = Pick<CouponRow, "active" | "expiresAt">;

// Past its expiry wins over paused: an expired coupon cannot be brought back by resuming it.
export function couponState(coupon: StateInput, now = new Date()): CouponState {
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) return "expired";
  return coupon.active ? "active" : "paused";
}

export function matchesCouponFilter(coupon: StateInput, filter: CouponFilter, now = new Date()) {
  return filter === "all" || couponState(coupon, now) === filter;
}

// Uses nobody has claimed yet. A checkout that is open right now holds one, so it is not
// counted as free. Null means unlimited.
export function usesLeft(coupon: Pick<CouponRow, "maxUses" | "usedCount" | "heldCount">) {
  if (coupon.maxUses === null) return null;
  return Math.max(0, coupon.maxUses - coupon.usedCount - coupon.heldCount);
}

// ---- Expiry: a coupon works through the end of the day the owner picks (India time) ----

const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-10-05" becomes midnight starting 6 October in India. Undefined for anything that
// is not a real calendar day.
export function expiryFromDay(day: string): Date | undefined {
  const start = parseIstDay(day);
  return start ? new Date(start.getTime() + DAY_MS) : undefined;
}

// The day to show in the date box. Stepping back a millisecond puts end-of-day expiries
// on the day that was picked, and codes made before this rule (midnight UTC) on the day
// they were typed.
export function expiryToDay(expiresAt: Date | string | null) {
  if (!expiresAt) return "";
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? "" : istDayKey(new Date(date.getTime() - 1));
}

export function formatDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(date);
}

// A new expiry must not be a day that has already gone.
export function expiryProblem(day: string | null | undefined, now = new Date()): string | null {
  if (!day) return null;
  if (!parseIstDay(day)) return "Pick a real date for the expiry.";
  if (day < istDayKey(now)) return "The expiry date has already passed. Pick today or a later day.";
  return null;
}

// ---- Rules the server enforces ----

// Lowering the limit below what is already used or sitting in someone's checkout would
// leave the coupon over its own limit.
export function maxUsesProblem(maxUses: number | null | undefined, usedCount: number, heldCount: number): string | null {
  if (maxUses === null || maxUses === undefined) return null;
  const committed = usedCount + heldCount;
  if (maxUses >= committed) return null;
  const parts = [`${usedCount} used`];
  if (heldCount > 0) parts.push(`${heldCount} in someone's checkout right now`);
  return `The limit cannot be lower than ${committed} (${parts.join(" and ")}).`;
}

export const COUPON_IN_USE_MESSAGE = "This coupon has already been used on orders, so it cannot be deleted. Pause it instead and nobody can use it again.";

// Why a coupon cannot be deleted, or null when it never touched an order. Deleting a used
// coupon would leave past orders pointing at a code that no longer exists.
export function couponDeleteBlock(coupon: Pick<CouponRow, "usedCount" | "heldCount" | "orderCount">, reservationCount = 0): string | null {
  if (coupon.usedCount <= 0 && coupon.heldCount <= 0 && coupon.orderCount <= 0 && reservationCount <= 0) return null;
  return COUPON_IN_USE_MESSAGE;
}

export function isWheelCode(code: string) {
  return code.toUpperCase().startsWith(WHEEL_CODE_PREFIX);
}

export const WHEEL_CODE_MESSAGE = `Codes starting with ${WHEEL_CODE_PREFIX} are kept for discount wheel prizes. Pick a different code.`;

export function randomCouponCode() {
  return `D2D${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
