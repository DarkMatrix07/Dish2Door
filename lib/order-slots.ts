import { PublicError } from "@/lib/public-error";
import type { OrderSlot } from "@prisma/client";

const INDIA_TIME_ZONE = "Asia/Kolkata";

// The four slot times as stored on the settings row (minutes after midnight, India time).
export type SlotTimeSettings = {
  afternoonCutoffMinute: number;
  afternoonDeliveryMinute: number;
  nightCutoffMinute: number;
  nightDeliveryMinute: number;
};

export type SlotTime = { cutoffMinutes: number; deliveryMinutes: number; cutoffLabel: string; deliveryLabel: string };
export type SlotTimes = Record<OrderSlot, SlotTime>;

// What the slots were before the owner could change them; also the column defaults.
export const DEFAULT_SLOT_SETTINGS: SlotTimeSettings = {
  afternoonCutoffMinute: 12 * 60,
  afternoonDeliveryMinute: 13 * 60 + 40,
  nightCutoffMinute: 17 * 60 + 45,
  nightDeliveryMinute: 19 * 60 + 30
};

// Pure and importable from client components. Accepts a partial object so callers that fall
// back to placeholder settings (database unreachable) still get the default times.
export function slotTimesFrom(settings: Partial<SlotTimeSettings> = {}): SlotTimes {
  const s = { ...DEFAULT_SLOT_SETTINGS, ...settings };
  const slot = (cutoffMinutes: number, deliveryMinutes: number): SlotTime => ({
    cutoffMinutes,
    deliveryMinutes,
    cutoffLabel: `Order before ${formatIndiaMinutes(cutoffMinutes)}`,
    deliveryLabel: `Deliver by ${formatIndiaMinutes(deliveryMinutes)}`
  });
  return {
    AFTERNOON: slot(s.afternoonCutoffMinute, s.afternoonDeliveryMinute),
    NIGHT: slot(s.nightCutoffMinute, s.nightDeliveryMinute)
  };
}

export const DEFAULT_SLOT_TIMES: SlotTimes = slotTimesFrom();

// Plain-English reason the four times can't be saved, or null. Run on the server before
// saving and in the settings page before the button is pressed.
export function validateSlotTimes(times: SlotTimeSettings): string | null {
  const all = [times.afternoonCutoffMinute, times.afternoonDeliveryMinute, times.nightCutoffMinute, times.nightDeliveryMinute];
  if (all.some((minute) => !Number.isInteger(minute) || minute < 0 || minute > 1439)) {
    return "Slot times must be a time of day between 12:00 AM and 11:59 PM.";
  }
  if (times.afternoonCutoffMinute >= times.afternoonDeliveryMinute) {
    return "For the Afternoon slot, customers must order before the delivery time.";
  }
  if (times.nightCutoffMinute >= times.nightDeliveryMinute) {
    return "For the Night slot, customers must order before the delivery time.";
  }
  if (times.afternoonCutoffMinute >= times.nightCutoffMinute) {
    return "The Afternoon order-by time must be earlier than the Night order-by time.";
  }
  return null;
}

export function getIndiaMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isOrderSlotAvailable(slot: OrderSlot, times: SlotTimes, date = new Date()) {
  return getIndiaMinutes(date) < times[slot].cutoffMinutes;
}

// Daily ordering window (blocks overnight ordering). Non-wrapping: open <= now < close.
export function isWithinOrderingWindow(openMinute: number, closeMinute: number, date = new Date()) {
  const now = getIndiaMinutes(date);
  return now >= openMinute && now < closeMinute;
}

export function formatIndiaMinutes(minutes: number) {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function assertOrderingWindowOpen(openMinute: number, closeMinute: number, date = new Date()) {
  if (!isWithinOrderingWindow(openMinute, closeMinute, date)) {
    throw new PublicError(`Ordering is open between ${formatIndiaMinutes(openMinute)} and ${formatIndiaMinutes(closeMinute)}.`);
  }
}

export function assertOrderSlotAvailable(slot: OrderSlot, times: SlotTimes, date = new Date()) {
  if (!isOrderSlotAvailable(slot, times, date)) {
    throw new PublicError(`${slot === "AFTERNOON" ? "Afternoon" : "Night"} orders closed at ${formatIndiaMinutes(times[slot].cutoffMinutes)}. Please choose an available slot.`);
  }
}
