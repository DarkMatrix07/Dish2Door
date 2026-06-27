import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmOnlineOrder } from "@/lib/orders";
import { verifyRazorpaySignature } from "@/lib/razorpay";

const bodySchema = z.object({
  orderId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const valid = verifyRazorpaySignature(body);

    if (!valid) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    const { order, passcode } = await confirmOnlineOrder(body.orderId, body);
    return NextResponse.json({
      trackingCode: order.trackingCode,
      passcode // may be null if the webhook already confirmed this order first
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify payment" },
      { status: 400 }
    );
  }
}
