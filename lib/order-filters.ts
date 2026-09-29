// Type-only Prisma import: the client-side orders table uses isUnpaidCheckout too, and
// the Prisma runtime must not end up in the browser bundle.
import type { PaymentStatus, Prisma } from "@prisma/client";

// One definition of "which orders count" for every admin screen, so the dashboard,
// analytics, customers and the live list can never disagree about the same numbers.

// Money actually received: paid online through the gateway or marked paid by an admin.
export const PAID_PAYMENT_STATUSES: PaymentStatus[] = ["PAID_ONLINE", "PAID_MANUALLY"];

// Orders the kitchen should prepare and hand over. UNPAID is included because WhatsApp
// and pay-later counter orders are real orders that are settled at handover.
export const FULFILLABLE_PAYMENT_STATUSES: PaymentStatus[] = [...PAID_PAYMENT_STATUSES, "UNPAID"];

// Revenue: paid and not cancelled. A cancelled order that was paid is money owed back
// or under review, not income.
export const REVENUE_ORDER_WHERE = {
  paymentStatus: { in: PAID_PAYMENT_STATUSES },
  status: { not: "CANCELLED" }
} satisfies Prisma.OrderWhereInput;

// An online checkout the customer never paid for (closed the Razorpay popup, or the
// payment failed). The row is kept so a late capture can still be matched, but it is
// not an order: nobody should cook it, count it, or be told it reached campus.
export const UNPAID_CHECKOUT_WHERE = {
  source: "CUSTOMER_ONLINE",
  paymentStatus: { in: ["PENDING", "FAILED"] }
} satisfies Prisma.OrderWhereInput;

export function isUnpaidCheckout(order: { source: string; paymentStatus: string }) {
  return (
    order.source === "CUSTOMER_ONLINE" && (order.paymentStatus === "PENDING" || order.paymentStatus === "FAILED")
  );
}

// Orders an admin should see and act on: accepted (not waiting on WhatsApp
// confirmation) and not an abandoned online checkout.
export const REAL_ORDER_WHERE = {
  status: { not: "AWAITING_CONFIRMATION" },
  NOT: UNPAID_CHECKOUT_WHERE
} satisfies Prisma.OrderWhereInput;
