// Rules for closing a forgotten order from an earlier day without messaging the customer.
// Pure (no database, no React) so the date rule and the allowed / refused states are
// unit-tested, and the same helper words the confirmation in the browser.
import { FULFILLABLE_PAYMENT_STATUSES } from "@/lib/order-filters";
import { istDayStartUtc } from "@/lib/ist-day";

const HOUR_MS = 60 * 60 * 1000;
// A closed order is recorded as handed over this long after it was placed.
const DELIVERY_AFTER_PLACED_MS = 2 * HOUR_MS;

// When the order is recorded as delivered: two hours after it was placed, but never past
// the end of its own IST day. The day is what matters for the books, and "delivered
// three days later" would be a lie about a forgotten order.
export function quietCloseDeliveredAt(createdAt: Date) {
  const dayEnd = istDayStartUtc(0, createdAt).getTime() + 24 * HOUR_MS;
  return new Date(Math.min(createdAt.getTime() + DELIVERY_AFTER_PLACED_MS, dayEnd - 1));
}

// The timestamps a quiet close writes. An existing reached-campus time is kept, unless it
// is later than the delivery time (an earlier late "reached" click), which would put
// "reached" after "delivered" on the order's timeline.
export function quietCloseTimes(order: { createdAt: Date; reachedCampusAt: Date | null; releasedAt?: Date | null }) {
  const deliveredAt = quietCloseDeliveredAt(order.createdAt);
  const reachedCampusAt =
    order.reachedCampusAt && order.reachedCampusAt.getTime() <= deliveredAt.getTime() ? order.reachedCampusAt : deliveredAt;
  return { reachedCampusAt, deliveredAt, releasedAt: order.releasedAt ?? deliveredAt };
}

export type QuietCloseDecision = { ok: true } | { ok: false; reason: string };

// Only a still-open, paid (or pay-later) order from before today may be closed this way.
// Today's orders go through the normal buttons, which do message the customer, and an
// unpaid online checkout is not an order at all.
export function quietCloseDecision(
  order: { createdAt: Date; status: string; paymentStatus: string },
  todayStart: Date
): QuietCloseDecision {
  if (order.status !== "ORDER_CONFIRMED" && order.status !== "REACHED_CAMPUS") {
    return { ok: false, reason: "Only open orders can be closed" };
  }
  if (!(FULFILLABLE_PAYMENT_STATUSES as string[]).includes(order.paymentStatus)) {
    return { ok: false, reason: "This checkout was never paid, so it cannot be marked delivered" };
  }
  if (order.createdAt.getTime() >= todayStart.getTime()) {
    return { ok: false, reason: "Only orders from earlier days can be closed without a message. Use Mark delivered for today's orders." };
  }
  return { ok: true };
}
