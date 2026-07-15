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

export function assertOrderSlotAvailable(slot: OrderSlot, date = new Date()) {
  if (!isOrderSlotAvailable(slot, date)) {
    throw new Error(`${slot === "AFTERNOON" ? "Afternoon" : "Night"} orders closed at ${slot === "AFTERNOON" ? "12:30 PM" : "5:30 PM"}. Please choose an available slot.`);
  }
}
