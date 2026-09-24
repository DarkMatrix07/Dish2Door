import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmOnlineOrderByRazorpayOrderId } from "@/lib/orders";
import { fetchRazorpayPayment, verifyRazorpaySignature } from "@/lib/razorpay";

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
    const providerPayment = await fetchRazorpayPayment(body.razorpayPaymentId);
    if (providerPayment.order_id !== body.razorpayOrderId) {
      return NextResponse.json({ error: "Payment could not be matched to an order" }, { status: 400 });
    }
    const captured = providerPayment.status === "captured";
    const result = await confirmOnlineOrderByRazorpayOrderId(body.razorpayOrderId, body.razorpayPaymentId, {
      amountPaise: Number(providerPayment.amount),
      currency: providerPayment.currency || "",
      captured
    });
    if (!result) {
      return NextResponse.json({ error: "Payment could not be matched to an order" }, { status: 400 });
    }
    if (result.pending || !result.order) {
      return NextResponse.json({ status: "pending", error: "Payment is not captured yet." }, { status: 202 });
    }

    const { order, passcode } = result;
    if (order.status === "CANCELLED") {
      return NextResponse.json({ status: "refund_pending", error: "Payment received, but this order cannot be fulfilled. Your refund requires support review. Please do not pay again." }, { status: 409 });
    }
    return NextResponse.json({
      trackingCode: order.trackingCode,
      passcode
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not verify payment. Please retry verification or contact support; do not pay again." },
      { status: 400 }
    );
  }
}
