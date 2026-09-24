import crypto from "crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { reconcilePaymentEvent } from "@/lib/payment-reconciliation";

// Razorpay signs each webhook with the webhook secret (set in the dashboard),
// which is separate from the API key secret.
function verifySignature(bodyText: string, signature: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

type RazorpayWebhookBody = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; status?: string } };
    order?: { entity?: { id?: string } };
  };
};

export async function POST(request: Request) {
  const bodyText = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const secret = env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }
  if (!signature || !verifySignature(bodyText, signature, secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    if (body.event === "payment.captured" || body.event === "order.paid") {
      const payment = body.payload?.payment?.entity;
      const razorpayOrderId = payment?.order_id ?? body.payload?.order?.entity?.id;
      const razorpayPaymentId = payment?.id ?? "";

      if (razorpayOrderId) {
        const amount = payment?.amount;
        const currency = payment?.currency;
        if (!razorpayPaymentId || !Number.isSafeInteger(amount) || !currency) {
          return NextResponse.json({ error: "Incomplete payment event" }, { status: 500 });
        }
        const providerEventId = `${body.event}:${razorpayPaymentId || razorpayOrderId}:${amount}`;
        const stored = await prisma.paymentEvent.upsert({
          where: { providerEventId },
          update: {},
          create: {
            providerEventId,
            razorpayOrderId,
            razorpayPaymentId,
            amountPaise: amount!,
            currency,
            eventType: body.event || "unknown"
          }
        });
        await reconcilePaymentEvent(stored.id);
      }
    }
    // Always ack 2xx for handled/ignored events so Razorpay stops retrying.
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Transient failure (e.g. DB) — return 500 so Razorpay retries the delivery.
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
