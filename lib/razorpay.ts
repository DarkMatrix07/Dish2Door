import crypto from "crypto";
import Razorpay from "razorpay";
import { requireEnv } from "@/lib/env";

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

  return expected === input.razorpaySignature;
}
