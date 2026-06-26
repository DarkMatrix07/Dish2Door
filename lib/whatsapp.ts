import { env, requireEnv } from "@/lib/env";
import type { FullOrder } from "@/lib/order-types";
import { formatPaise } from "@/lib/utils";

export function orderWhatsAppText(order: FullOrder, headline: string, passcode?: string) {
  const trackingUrl = `${env.NEXT_PUBLIC_APP_URL}/orders/${order.trackingCode}`;
  const items = order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ");
  const passcodeLine = passcode ? `\nPasscode: ${passcode}` : "";

  return `${headline}
Restaurant: ${order.restaurant.name}
Customer: ${order.customerName}
Items: ${items}
Total: ${formatPaise(order.totalPaise)}
Track: ${trackingUrl}${passcodeLine}`;
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

export async function sendWhatsApp(order: FullOrder, message: string) {
  const url = requireEnv("WHATSAPP_API_URL");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.WHATSAPP_API_KEY ? { "x-service-key": env.WHATSAPP_API_KEY } : {})
    },
    body: JSON.stringify({
      phone: normalizePhone(order.customerPhone),
      text: message
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`WhatsApp API failed with ${response.status}${details ? `: ${details}` : ""}`);
  }
}
