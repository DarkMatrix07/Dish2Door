// Human wording and badge colours for order fields, shared by the admin screens and the
// CSV export so an order reads the same everywhere. Plain strings only (no React), so
// server routes can import it too.
import { isUnpaidCheckout } from "@/lib/order-filters";

export type BadgeTone = "neutral" | "green" | "amber" | "red";

export function statusLabel(status: string) {
  switch (status) {
    case "AWAITING_CONFIRMATION":
      return "Awaiting confirmation";
    case "ORDER_CONFIRMED":
      return "Confirmed";
    case "REACHED_CAMPUS":
      return "Reached campus";
    case "DELIVERED":
      return "Delivered";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.replaceAll("_", " ").toLowerCase();
  }
}

// An abandoned online checkout keeps the default ORDER_CONFIRMED status in the database,
// but calling it "Confirmed" next to an "Unpaid checkout" badge would mislead: nothing
// was confirmed and nobody will cook it.
export function orderStatusLabel(order: { status: string; paymentStatus: string; source: string }) {
  return order.status === "ORDER_CONFIRMED" && isUnpaidCheckout(order) ? "Awaiting payment" : statusLabel(order.status);
}

export function statusTone(status: string): BadgeTone {
  if (status === "DELIVERED") return "green";
  if (status === "REACHED_CAMPUS" || status === "AWAITING_CONFIRMATION") return "amber";
  if (status === "CANCELLED") return "red";
  return "neutral";
}

// An online order still PENDING or FAILED is not a real order, so it says so instead of
// showing a bare gateway status.
export function paymentLabel(order: { paymentStatus: string; source: string }) {
  if (isUnpaidCheckout(order)) return "Unpaid checkout";
  switch (order.paymentStatus) {
    case "PAID_ONLINE":
      return "Paid online";
    case "PAID_MANUALLY":
      return "Paid manually";
    case "UNPAID":
      return "Pay later";
    case "REFUNDED":
      return "Refunded";
    case "PENDING":
      return "Payment pending";
    case "FAILED":
      return "Payment failed";
    default:
      return order.paymentStatus.replaceAll("_", " ").toLowerCase();
  }
}

export function paymentTone(order: { paymentStatus: string; source: string }): BadgeTone {
  if (isUnpaidCheckout(order)) return "red";
  switch (order.paymentStatus) {
    case "PAID_ONLINE":
    case "PAID_MANUALLY":
      return "green";
    case "UNPAID":
    case "REFUNDED":
      return "amber";
    default:
      return "red";
  }
}

export function slotLabel(slot: string | null | undefined) {
  if (slot === "AFTERNOON") return "Afternoon";
  if (slot === "NIGHT") return "Night";
  return "No slot";
}

export function sourceLabel(source: string) {
  switch (source) {
    case "CUSTOMER_ONLINE":
      return "Website";
    case "ADMIN_MANUAL":
      return "Counter order";
    case "CUSTOMER_WHATSAPP":
      return "WhatsApp";
    default:
      return source.replaceAll("_", " ").toLowerCase();
  }
}

export function deliveryLabel(order: { deliveryType: string; hostelBlock: string | null }) {
  return order.deliveryType === "HOSTEL" ? `Hostel${order.hostelBlock ? ` ${order.hostelBlock}` : ""}` : "Gate pickup";
}

// "2× Veg Biryani, 1× Coke": the one-line form used in lists and the CSV.
export function itemsSummary(items: { nameSnapshot: string; quantity: number }[]) {
  return items.map((item) => `${item.quantity}× ${item.nameSnapshot}`).join(", ");
}
