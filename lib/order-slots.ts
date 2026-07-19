import type { OrderSlot } from "@prisma/client";

const INDIA_TIME_ZONE = "Asia/Kolkata";

export const ORDER_SLOT_DETAILS = {
  AFTERNOON: {
    cutoffMinutes: 12 * 60 + 30,
    cutoffLabel: "Order before 12:30 PM",
    deliveryLabel: "Deliver by 2:00 PM",
  },
  NIGHT: {
    cutoffMinutes: 17 * 60 + 30,
    cutoffLabel: "Order before 5:30 PM",
    deliveryLabel: "Deliver by 7:30 PM",
  },
} satisfies Record<OrderSlot, { cutoffMinutes: number; cutoffLabel: string; deliveryLabel: string }>;

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

export function isOrderSlotAvailable(slot: OrderSlot, date = new Date()) {
  return getIndiaMinutes(date) < ORDER_SLOT_DETAILS[slot].cutoffMinutes;
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
    throw new Error(`Ordering is open between ${formatIndiaMinutes(openMinute)} and ${formatIndiaMinutes(closeMinute)}.`);
  }
}

export function assertOrderSlotAvailable(slot: OrderSlot, date = new Date()) {
  if (!isOrderSlotAvailable(slot, date)) {
    throw new Error(`${slot === "AFTERNOON" ? "Afternoon" : "Night"} orders closed at ${slot === "AFTERNOON" ? "12:30 PM" : "5:30 PM"}. Please choose an available slot.`);
  }
}
