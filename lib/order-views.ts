import type { OrderStatus, DeliveryType } from "@prisma/client";
import { isUnpaidCheckout } from "@/lib/order-filters";

export type TrackingView = {
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: DeliveryType;
  hostelBlock: string | null;
  orderSlot: "AFTERNOON" | "NIGHT" | null;
  status: OrderStatus;
  totalPaise: number;
  restaurant: { name: string };
  items: Array<{ id: string; nameSnapshot: string; quantity: number; linePaise: number }>;
  rating: { id: string } | null;
};

export function toTrackingView(order: {
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  deliveryType: DeliveryType;
  hostelBlock: string | null;
  orderSlot: "AFTERNOON" | "NIGHT" | null;
  totalPaise: number;
  restaurant: { name: string };
  items: Array<{ nameSnapshot: string; quantity: number; linePaise: number }>;
  rating: { id: string } | null;
}): TrackingView {
  return {
    trackingCode: order.trackingCode,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    status: order.status,
    deliveryType: order.deliveryType,
    hostelBlock: order.hostelBlock,
    orderSlot: order.orderSlot,
    totalPaise: order.totalPaise,
    restaurant: { name: order.restaurant.name },
    items: order.items.map((item, index) => ({
      id: `${index}`,
      nameSnapshot: item.nameSnapshot,
      quantity: item.quantity,
      linePaise: item.linePaise
    })),
    rating: order.rating ? { id: order.rating.id } : null
  };
}

// Explicit contracts prevent future database fields or nested relations from
// accidentally becoming browser-visible when the persistence model grows.
type StaffOrder = {
  id: string; trackingCode: string; customerName: string; customerPhone: string;
  hostelBlock: string | null; status: OrderStatus; totalPaise: number;
  restaurant: { name: string };
  items: Array<{ id: string; nameSnapshot: string; quantity: number }>;
};

export function toDeliveryOrderView(order: StaffOrder) {
  return {
    id: order.id, trackingCode: order.trackingCode,
    customerName: order.customerName, customerPhone: order.customerPhone,
    hostelBlock: order.hostelBlock, status: order.status, totalPaise: order.totalPaise,
    restaurant: { name: order.restaurant.name },
    items: order.items.map((item) => ({ id: item.id, nameSnapshot: item.nameSnapshot, quantity: item.quantity }))
  };
}

export function toAdminOrderView(order: StaffOrder & {
  customerEmail: string | null; deliveryType: DeliveryType; paymentStatus: string;
  orderSlot: "AFTERNOON" | "NIGHT" | null; source: string; createdAt: Date;
  session: { id: string; label: string };
  campus: { id: string; code: string; name: string } | null;
}) {
  return {
    ...toDeliveryOrderView(order),
    customerEmail: order.customerEmail, deliveryType: order.deliveryType,
    paymentStatus: order.paymentStatus, orderSlot: order.orderSlot,
    source: order.source, createdAt: order.createdAt,
    session: { id: order.session.id, label: order.session.label },
    campus: order.campus ? { id: order.campus.id, code: order.campus.code, name: order.campus.name } : null
  };
}

export function toOrderMutationView(order: { id: string; status: OrderStatus; paymentStatus: string }) {
  return { id: order.id, status: order.status, paymentStatus: order.paymentStatus };
}

const FORBIDDEN = ["trackingPasscodeHash", "passwordHash", "razorpaySignature", "tokenHash"];

export function containsForbiddenField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenField);
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => FORBIDDEN.includes(key) || containsForbiddenField(nested)
  );
}

// The few fields the admin action buttons need to decide what to offer and to word the
// cancel confirmation. Shared by the order page and the Today board.
export type OrderActionView = {
  id: string;
  trackingCode: string;
  customerName: string;
  status: string;
  paymentStatus: string;
  source: string;
  totalPaise: number;
  // Only the Today board's "still open from earlier days" rows send this (as an ISO
  // string); it lets the quiet-close confirmation name the day the order is recorded on.
  createdAt?: string | Date;
};

export function toOrderActionView(order: OrderActionView): OrderActionView {
  return {
    id: order.id,
    trackingCode: order.trackingCode,
    customerName: order.customerName,
    status: order.status,
    paymentStatus: order.paymentStatus,
    source: order.source,
    totalPaise: order.totalPaise
  };
}

// Which buttons an order gets. One place so the order page and the Today board can never
// disagree, and so the rule "an unpaid online checkout is not an order" is testable.
// The server refuses the same invalid moves again; this only decides what to offer.
export function availableOrderActions(order: { status: string; paymentStatus: string; source: string }) {
  const active = order.status === "ORDER_CONFIRMED" || order.status === "REACHED_CAMPUS";
  const unpaidCheckout = isUnpaidCheckout(order);
  return {
    unpaidCheckout: active && unpaidCheckout,
    // Nobody paid for an unpaid checkout, so it is never moved along; cancelling stays
    // available because that frees any coupon it holds.
    reached: order.status === "ORDER_CONFIRMED" && !unpaidCheckout,
    delivered: order.status === "REACHED_CAMPUS" && !unpaidCheckout,
    // Closing a forgotten order without messages: same paid-order rule as the moves above.
    // The server additionally insists the order is from an earlier day.
    closeQuietly: active && !unpaidCheckout,
    cancel: active
  };
}
