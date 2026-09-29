import crypto from "crypto";
import Razorpay from "razorpay";
import { env, requireEnv } from "@/lib/env";

// The main site and the SRM site share one Razorpay account, so each receives the
// other's webhooks. Every provider order is tagged with the site that created it, and
// a site ignores captures tagged for a different one instead of retrying them forever.
export function paymentSiteKey() {
  try {
    return new URL(env.NEXT_PUBLIC_APP_URL).host.replace(/^www\./, "");
  } catch {
    return env.NEXT_PUBLIC_APP_URL;
  }
}

export async function fetchRazorpayPayment(paymentId: string) {
  const payment = await createRazorpayClient().payments.fetch(paymentId);
  return payment as {
    id?: string;
    order_id?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
}

export function createRazorpayClient() {
  return new Razorpay({
    key_id: requireEnv("RAZORPAY_KEY_ID"),
    key_secret: requireEnv("RAZORPAY_KEY_SECRET")
  });
}

export function verifyRazorpaySignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const expected = crypto
    .createHmac("sha256", requireEnv("RAZORPAY_KEY_SECRET"))
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  if (!/^[0-9a-f]{64}$/i.test(input.razorpaySignature) || expected.length !== input.razorpaySignature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.razorpaySignature, "hex"));
}
