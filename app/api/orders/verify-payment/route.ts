import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmOnlineOrderByRazorpayOrderId } from "@/lib/orders";
import { verifyRazorpaySignature } from "@/lib/razorpay";

const bodySchema = z.object({
  // orderId is accepted for backwards compatibility but intentionally NOT trusted:
  // the order is resolved from the verified razorpayOrderId instead (see below).
  orderId: z.string().optional(),
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

    // Resolve the order strictly from the signed razorpayOrderId via the Payment row
    // (persisted at create-payment time). Never confirm a client-supplied orderId — a
    // valid signature from one payment could otherwise confirm a different unpaid order.
    const result = await confirmOnlineOrderByRazorpayOrderId(body.razorpayOrderId, body.razorpayPaymentId);
    if (!result) {
      return NextResponse.json({ error: "Payment could not be matched to an order" }, { status: 400 });
    }

    const { order, passcode } = result;
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
