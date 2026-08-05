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

// Every shop number we deal with is an Indian mobile, so a bare 10-digit number is
// normalised to 91XXXXXXXXXX. wa.me resolves a number WITHOUT a country code against
// the viewer's own locale, which fails or opens the wrong contact — the country code
// is not optional. Returns null when the input is not a usable Indian mobile.
export function normalizeIndianWhatsAppNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  // Tolerate 0-prefixed local dialling (09876543210) and an existing 91 / +91.
  const local = digits.startsWith("91") && digits.length === 12
    ? digits.slice(2)
    : digits.startsWith("0") && digits.length === 11
      ? digits.slice(1)
      : digits;

  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `91${local}`;
}

export function buildWhatsAppOrderLink(message: string, phoneNumber = SUPPORT_WHATSAPP_NUMBER) {
  // wa.me needs the number without "+" and the text percent-encoded. Fall back to the
  // support line rather than building a link to a number WhatsApp cannot resolve.
  const number = normalizeIndianWhatsAppNumber(phoneNumber) ?? SUPPORT_WHATSAPP_NUMBER;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
