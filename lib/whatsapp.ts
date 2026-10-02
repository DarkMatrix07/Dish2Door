import { env, requireEnv } from "@/lib/env";
import type { FullOrder } from "@/lib/order-types";
import { formatPaise } from "@/lib/utils";

export type OrderWhatsAppExtras = {
  // Shown instead of the passcode when it was already delivered by another message.
  passcodeNote?: string;
  // One-tap review link (no passcode needed).
  reviewUrl?: string;
};

export function orderWhatsAppText(order: FullOrder, headline: string, passcode?: string, extras: OrderWhatsAppExtras = {}) {
  const trackingUrl = `${env.NEXT_PUBLIC_APP_URL}/orders/${order.trackingCode}`;
  const items = order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ");
  const passcodeLine = passcode
    ? `\nPasscode: ${passcode}`
    : extras.passcodeNote
      ? `\n${extras.passcodeNote}`
      : "";
  const reviewLine = extras.reviewUrl ? `\nRate your order (one tap, no passcode needed): ${extras.reviewUrl}` : "";

  return `${headline}
Restaurant: ${order.restaurant.name}
Customer: ${order.customerName}
Items: ${items}
Total: ${formatPaise(order.totalPaise)}
Track: ${trackingUrl}${passcodeLine}${reviewLine}`;
}

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  // Drop a leading trunk "0" (e.g. 09440095426 -> 9440095426) so 10-digit
  // numbers get a country code instead of producing an invalid WhatsApp id.
  if (digits.length > 10 && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }
  if (digits.length === 10 && env.WHATSAPP_DEFAULT_COUNTRY_CODE) {
    return `${env.WHATSAPP_DEFAULT_COUNTRY_CODE}${digits}`;
  }
  return digits;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendWhatsApp(order: FullOrder, message: string) {
  const url = requireEnv("WHATSAPP_API_URL");
  const body = JSON.stringify({ phone: normalizePhone(order.customerPhone), text: message });

  // WAHA's WhatsApp-Web engine occasionally tears down its Chromium context
  // mid-send (e.g. right after a session restart) and returns a 5xx with
  // "Execution context was destroyed". These clear within a few seconds, so
  // retry server errors with backoff. 4xx (bad number etc.) fail fast.
  const maxAttempts = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.WHATSAPP_API_KEY ? { "x-service-key": env.WHATSAPP_API_KEY } : {})
      },
      body
    });

    if (response.ok) return;

    const details = await response.text().catch(() => "");
    lastError = `${response.status}${details ? `: ${details}` : ""}`;

    if (response.status < 500 || attempt === maxAttempts) {
      throw new Error(`WhatsApp API failed with ${lastError}`);
    }
    await delay(attempt * 3000);
  }
}
