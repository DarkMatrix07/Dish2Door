import { z } from "zod";
import { formatIstFull } from "@/lib/ist-day";
import { WHEEL_SEGMENTS, isValidIndianMobile, normalizePhone } from "@/lib/spin-wheel";

// Pure rules for the admin "Give wheel coupon" and "Cancel prize" buttons. Everything here
// is safe to import from the browser; the database work is in lib/admin-rewards-db.ts.

// A gift can only be one of the percentages printed on the wheel, so a gifted prize never
// looks different from a won one.
export const GIFT_PERCENTS: readonly number[] = [...new Set(WHEEL_SEGMENTS.map((segment) => segment.percent))].sort((a, b) => a - b);
export const GIFT_DAYS = [1, 3, 7] as const;
export const GIFT_NOTE_MAX = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

const phoneField = z
  .string()
  .max(20)
  .refine((value) => isValidIndianMobile(value), "Enter a valid 10-digit mobile number.")
  .transform(normalizePhone);

export const giftCouponBodySchema = z
  .object({
    phone: phoneField,
    percent: z.number().refine((value) => GIFT_PERCENTS.includes(value), "Pick one of the percentages on the wheel."),
    days: z.number().refine((value) => (GIFT_DAYS as readonly number[]).includes(value), "Choose 1, 3 or 7 days."),
    note: z
      .string()
      .trim()
      .max(GIFT_NOTE_MAX, `Keep the note under ${GIFT_NOTE_MAX} characters.`)
      .optional(),
    replace: z.boolean().optional()
  })
  .strict();
export type GiftCouponInput = z.infer<typeof giftCouponBodySchema>;

export const cancelPrizeBodySchema = z
  .object({
    phone: phoneField,
    rewardId: z.string().min(1).max(64)
  })
  .strict();
export type CancelPrizeInput = z.infer<typeof cancelPrizeBodySchema>;

export function giftExpiry(days: number, now = new Date()) {
  return new Date(now.getTime() + days * DAY_MS);
}

export function giftCouponDescription(percent: number) {
  return `Gift from Dish2Door — ${percent}% off`;
}

export function daysLabel(days: number) {
  return days === 1 ? "1 day" : `${days} days`;
}

// The ready-to-send WhatsApp message and link for a freshly given prize. The phone is the
// normalized 10-digit key; wa.me needs the country code in front.
export function giftWhatsAppMessage({
  name,
  percent,
  code,
  expiresAt
}: {
  name?: string | null;
  percent: number;
  code: string;
  expiresAt: Date;
}) {
  const first = name?.trim().split(/\s+/)[0];
  return [
    `Hi${first ? ` ${first}` : ""}! Here is a little gift from Dish2Door: ${percent}% off your next order.`,
    `Use code ${code} at checkout. It works until ${formatIstFull(expiresAt)}.`
  ].join(" ");
}

export function giftWhatsAppUrl(phone: string, message: string) {
  return `https://wa.me/91${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
