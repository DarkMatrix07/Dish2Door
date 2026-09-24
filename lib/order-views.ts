import type { OrderStatus, DeliveryType } from "@prisma/client";

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
