import crypto from "crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  const bodyText = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!env.RAZORPAY_KEY_SECRET || !signature) {
    return NextResponse.json({ error: "Webhook secret missing" }, { status: 400 });
  }

  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(bodyText).digest("hex");

  if (expected !== signature) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
