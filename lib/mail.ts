import { env } from "@/lib/env";
import type { FullOrder } from "@/lib/order-types";
import { formatPaise } from "@/lib/utils";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function orderEmailHtml(order: FullOrder, headline: string, body: string, passcode?: string) {
  const trackingUrl = `${env.NEXT_PUBLIC_APP_URL}/orders/${order.trackingCode}`;
  const items = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;color:#1f2937;font-size:14px;">${item.quantity}x ${escapeHtml(item.nameSnapshot)}</td>
          <td align="right" style="padding:10px 0;color:#1f2937;font-size:14px;font-weight:700;">${formatPaise(item.linePaise)}</td>
        </tr>
      `
    )
    .join("");
  const passcodeBlock = passcode
    ? `
      <div style="margin:20px 0 0;padding:16px;border-radius:14px;background:#fff7ed;border:1px dashed #f59e0b;text-align:center;">
        <p style="margin:0 0 6px;color:#92400e;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Private passcode</p>
        <p style="margin:0;color:#111827;font-size:30px;line-height:1;font-weight:800;letter-spacing:8px;">${escapeHtml(passcode)}</p>
      </div>
    `
    : "";
  const deliveryLabel =
    order.deliveryType === "HOSTEL" ? `Hostel ${escapeHtml(order.hostelBlock)}` : "Campus gate";

  return `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#fff8ec;font-family:Arial,'Segoe UI',sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff8ec;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #eadcc8;border-radius:22px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:30px 32px;color:#fff8ec;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fbbf24;">Dish2Door</p>
                <h1 style="margin:0;font-size:30px;line-height:1.15;font-weight:900;">${escapeHtml(headline)}</h1>
                <p style="margin:14px 0 0;font-size:15px;line-height:1.7;color:#fef3c7;">${escapeHtml(body)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:0 0 14px;">
                      <p style="margin:0;color:#6b7280;font-size:13px;font-weight:700;">Restaurant</p>
                      <p style="margin:4px 0 0;color:#111827;font-size:18px;font-weight:800;">${escapeHtml(order.restaurant.name)}</p>
                    </td>
                    <td align="right" style="padding:0 0 14px;">
                      <p style="margin:0;color:#6b7280;font-size:13px;font-weight:700;">Order</p>
                      <p style="margin:4px 0 0;color:#111827;font-size:18px;font-weight:800;">${escapeHtml(order.trackingCode)}</p>
                    </td>
                  </tr>
                </table>

                <div style="margin:8px 0 20px;padding:16px;border-radius:16px;background:#f9fafb;border:1px solid #eef0f3;">
                  <p style="margin:0 0 6px;color:#374151;font-size:14px;"><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
                  <p style="margin:0 0 6px;color:#374151;font-size:14px;"><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>
                  <p style="margin:0;color:#374151;font-size:14px;"><strong>Delivery:</strong> ${deliveryLabel}</p>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${items}
                  <tr>
                    <td style="padding:14px 0 0;border-top:1px solid #e5e7eb;color:#111827;font-size:17px;font-weight:900;">Total paid</td>
                    <td align="right" style="padding:14px 0 0;border-top:1px solid #e5e7eb;color:#111827;font-size:17px;font-weight:900;">${formatPaise(order.totalPaise)}</td>
                  </tr>
                </table>

                ${passcodeBlock}

                <p style="margin:24px 0 0;text-align:center;">
                  <a href="${trackingUrl}" style="display:inline-block;background:#f59e0b;color:#111827;padding:13px 22px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:900;">Track your order</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #eef0f3;color:#6b7280;font-size:12px;line-height:1.6;">
                You are receiving this because an order was placed with Dish2Door. Keep the passcode private.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

export async function sendOrderEmail(order: FullOrder, subject: string, html: string) {
  if (!order.customerEmail) {
    throw new Error("Customer email missing");
  }

  if (!env.MAILER_SERVICE_URL || !env.MAILER_SERVICE_SECRET) {
    throw new Error("MAILER_SERVICE_URL/MAILER_SERVICE_SECRET are not configured");
  }

  const endpoint = `${env.MAILER_SERVICE_URL.replace(/\/+$/, "")}/send`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Secret": env.MAILER_SERVICE_SECRET,
    },
    body: JSON.stringify({
      to: [order.customerEmail],
      subject,
      html,
      fromAddress: env.MAIL_FROM_ADDRESS,
      fromName: env.MAIL_FROM_NAME || "Dish2Door",
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Mailer service failed with ${response.status}: ${details || response.statusText}`);
  }
}
