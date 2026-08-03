// Builds the message a customer sends us for a WhatsApp-mode shop. Kept free of any
// database import so it can be unit tested and reused from both server and client.

export const SUPPORT_WHATSAPP_NUMBER = "916302250978";

export type WhatsAppOrderLine = { name: string; quantity: number; linePaise: number };

export type WhatsAppOrderSummary = {
  shopName: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  campusName: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock?: string | null;
  slotLabel?: string | null;
  lines: WhatsAppOrderLine[];
  subtotalPaise: number;
  platformFeePaise: number;
  hostelFeePaise: number;
  totalPaise: number;
};

function rupees(paise: number) {
  // Whole rupees where possible: "₹641" reads better in chat than "₹641.00".
  const value = paise / 100;
  return `₹${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export function buildWhatsAppOrderMessage(order: WhatsAppOrderSummary) {
  const items = order.lines
    .map((line) => `• ${line.quantity} × ${line.name} — ${rupees(line.linePaise)}`)
    .join("\n");

  const bill = [
    `Items: ${rupees(order.subtotalPaise)}`,
    order.platformFeePaise > 0 ? `Platform fee: ${rupees(order.platformFeePaise)}` : null,
    order.hostelFeePaise > 0 ? `Hostel delivery: ${rupees(order.hostelFeePaise)}` : null,
    `*Total: ${rupees(order.totalPaise)}*`
  ]
    .filter(Boolean)
    .join("\n");

  const dropOff =
    order.deliveryType === "HOSTEL"
      ? `Hostel delivery${order.hostelBlock ? ` — Block ${order.hostelBlock}` : ""}`
      : "Campus gate pickup";

  return [
    `*New ${order.shopName} order*`,
    `Order code: *${order.trackingCode}*`,
    "",
    "*Items*",
    items,
    "",
    "*Bill*",
    bill,
    "",
    "*Delivery*",
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    `Campus: ${order.campusName}`,
    dropOff,
    order.slotLabel ? `Slot: ${order.slotLabel}` : null,
    "",
    "_Sent from dish2door.store — please confirm this order._"
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildWhatsAppOrderLink(message: string, phoneNumber = SUPPORT_WHATSAPP_NUMBER) {
  // wa.me needs the number without "+" and the text percent-encoded.
  const digits = phoneNumber.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
