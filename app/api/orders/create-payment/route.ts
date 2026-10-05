import { NextResponse } from "next/server";
import { DeliveryType, OrderSlot } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { cancelOrder, confirmOnlineOrder, createPendingOnlineOrder, PENDING_ORDER_TTL_MS } from "@/lib/orders";
import { assertOrderSlotAvailable } from "@/lib/order-slots";
import { createRazorpayClient, paymentSiteKey } from "@/lib/razorpay";
import { env } from "@/lib/env";
import { optionalHostelBlockSchema } from "@/lib/hostels";
import { createHash } from "node:crypto";
import { PublicError, publicErrorMessage } from "@/lib/public-error";
import { testCheckoutEnabled } from "@/lib/test-checkout";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const bodySchema = z.object({
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(8),
    deliveryType: z.nativeEnum(DeliveryType),
    hostelBlock: optionalHostelBlockSchema,
    couponCode: z.string().optional(),
    campusCode: z.string().min(1).optional(),
    orderSlot: z.nativeEnum(OrderSlot)
  }).superRefine((customer, context) => {
    if (customer.deliveryType === DeliveryType.HOSTEL && !customer.hostelBlock) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hostelBlock"],
        message: "Select a hostel block"
      });
    }
  }),
  items: z.array(
    z
      .object({
        menuItemId: z.string().min(1).optional(),
        comboId: z.string().min(1).optional(),
        quantity: z.number().int().min(1).max(20)
      })
      // Each line is exactly one thing: a menu item or a combo, never both/neither.
      .refine((line) => Boolean(line.menuItemId) !== Boolean(line.comboId), {
        message: "Each cart line must be a single item or a single combo"
      })
  ).min(1)
});

export async function GET(request: Request) {
  const key = z.string().uuid().safeParse(request.headers.get("Idempotency-Key"));
  const capability = z.string().uuid().safeParse(request.headers.get("Checkout-Capability"));
  if (!key.success || !capability.success) return NextResponse.json({ error: "Invalid checkout reference." }, { status: 400 });
  try {
    const attempt = await prisma.checkoutAttempt.findUnique({
      where: { idempotencyKeyHash: hash(key.data) },
      include: { order: { include: { payment: true } } }
    });
    if (!attempt || attempt.capabilityHash !== hash(capability.data)) {
      return NextResponse.json({ error: "Checkout reference was not found." }, { status: 404 });
    }
    const order = attempt.order;
    if (!order) {
      return NextResponse.json({ status: attempt.createdAt.getTime() < Date.now() - PENDING_ORDER_TTL_MS ? "expired" : "pending" },
        { headers: { "Cache-Control": "no-store" } });
    }
    if (order.status === "CANCELLED" || order.checkoutState === "ABANDONED") {
      const paid = order.paymentStatus !== "PENDING" || order.payment?.captureState !== "PENDING";
      return NextResponse.json({ status: paid ? "refund_pending" : "cancelled" }, { headers: { "Cache-Control": "no-store" } });
    }
    if ((order.payment && order.payment.refundState !== "NONE") || order.paymentStatus === "REFUNDED") {
      return NextResponse.json({ status: "refund_pending" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (order.paymentStatus === "PAID_ONLINE") {
      return NextResponse.json({ status: "confirmed", trackingCode: order.trackingCode }, { headers: { "Cache-Control": "no-store" } });
    }
    if (order.checkoutState === "EXPIRED" && order.paymentStatus === "PENDING" && order.payment?.captureState === "PENDING") {
      return NextResponse.json({ status: "expired" }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ status: "pending" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not check payment yet. Please retry." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const key = z.string().uuid().safeParse(request.headers.get("Idempotency-Key"));
  const capability = z.string().uuid().safeParse(request.headers.get("Checkout-Capability"));
  if (!key.success || !capability.success) return NextResponse.json({ error: "Invalid checkout reference." }, { status: 400 });
  try {
    const attempt = await prisma.checkoutAttempt.findUnique({
      where: { idempotencyKeyHash: hash(key.data) },
      include: { order: { include: { payment: true } } }
    });
    if (!attempt || attempt.capabilityHash !== hash(capability.data)) {
      return NextResponse.json({ error: "Checkout reference was not found." }, { status: 404 });
    }
    const order = attempt.order;
    if (!order) {
      const removed = await prisma.checkoutAttempt.deleteMany({
        where: { id: attempt.id, orderId: null, createdAt: { lt: new Date(Date.now() - PENDING_ORDER_TTL_MS) } }
      });
      return removed.count === 1
        ? NextResponse.json({ status: "cancelled" }, { headers: { "Cache-Control": "no-store" } })
        : NextResponse.json({ error: "This checkout is still starting. Check its payment status shortly." }, { status: 409 });
    }
    if (order.checkoutState !== "EXPIRED" || order.status === "CANCELLED" ||
        order.paymentStatus !== "PENDING" || order.payment?.captureState !== "PENDING" ||
        order.payment.refundState !== "NONE") {
      return NextResponse.json({ error: "This checkout cannot be cancelled here. Check its payment status or contact support." }, { status: 409 });
    }
    await cancelOrder(order.id, false, true);
    return NextResponse.json({ status: "cancelled" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Could not cancel this checkout. Check its payment status or contact support.") },
      { status: error instanceof PublicError ? 409 : 503 });
  }
}

export async function POST(request: Request) {
  let attemptId: string | undefined;
  try {
    const body = bodySchema.parse(await request.json());
    const key = z.string().uuid().parse(request.headers.get("Idempotency-Key"));
    const capability = z.string().uuid().parse(request.headers.get("Checkout-Capability"));
    const idempotencyKeyHash = hash(key);
    const capabilityHash = hash(capability);
    const payloadHash = hash(JSON.stringify(body));
    // The unique constraint elects one creator across workers and tabs. An
    // uncertain provider response is never retried by creating a second order.
    try {
      const attempt = await prisma.checkoutAttempt.create({ data: { idempotencyKeyHash, capabilityHash, payloadHash } });
      attemptId = attempt.id;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      const existing = await prisma.checkoutAttempt.findUnique({ where: { idempotencyKeyHash }, include: { order: { include: { payment: true } } } });
      if (!existing || existing.capabilityHash !== capabilityHash || existing.payloadHash !== payloadHash) {
        return NextResponse.json({ error: "Checkout attempt does not match. Please review your cart." }, { status: 409 });
      }
      const prior = existing.order;
      if (!prior?.payment?.razorpayOrderId || prior.paymentStatus !== "PENDING" || prior.status === "CANCELLED" ||
          prior.checkoutState !== "OPEN" || prior.payment.captureState !== "PENDING" || prior.payment.refundState !== "NONE") {
        return NextResponse.json({ error: "This checkout is being processed or has already completed. Please don't pay again; check your email or contact support." }, { status: 409 });
      }
      return NextResponse.json({ orderId: prior.id, amountPaise: prior.totalPaise, razorpayOrderId: prior.payment.razorpayOrderId, razorpayKeyId: env.RAZORPAY_KEY_ID,
        customer: { name: prior.customerName, email: prior.customerEmail, phone: prior.customerPhone } });
    }
    assertOrderSlotAvailable(body.customer.orderSlot);
    const order = await createPendingOnlineOrder(body.customer, body.items, attemptId);

    // Test site only (lib/test-checkout.ts): confirm the order straight away through the
    // normal confirmation path, with clearly fake payment ids, instead of opening Razorpay.
    if (testCheckoutEnabled()) {
      const testOrderId = `test_order_${order.id}`;
      await prisma.payment.update({ where: { orderId: order.id }, data: { razorpayOrderId: testOrderId } });
      const placed = await confirmOnlineOrder(order.id, {
        razorpayOrderId: testOrderId,
        razorpayPaymentId: `test_pay_${order.id}`,
        amountPaise: order.totalPaise,
        currency: "INR",
        captured: true
      });
      return NextResponse.json({ testPlaced: true, trackingCode: placed.order?.trackingCode ?? order.trackingCode, passcode: placed.passcode });
    }

    const razorpay = createRazorpayClient();
    const razorpayOrder = await razorpay.orders.create({
      amount: order.totalPaise,
      currency: "INR",
      receipt: order.id,
      notes: {
        app: "dish2door",
        site: paymentSiteKey(),
        orderId: order.id,
        trackingCode: order.trackingCode
      }
    });

    // Persist the Razorpay order id so the webhook can map a captured payment
    // back to this order even if the customer's browser never calls verify-payment.
    await prisma.payment.update({
      where: { orderId: order.id },
      data: { razorpayOrderId: razorpayOrder.id }
    });

    return NextResponse.json({
      orderId: order.id,
      amountPaise: order.totalPaise,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: env.RAZORPAY_KEY_ID,
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone
      }
    });
  } catch (error) {
    // The order link is committed atomically with order creation, before the
    // provider is called. A claim with no link cannot have initiated payment.
    if (attemptId) {
      try { await prisma.checkoutAttempt.deleteMany({ where: { id: attemptId, orderId: null } }); }
      catch { /* Leave an uncertain claim for timed, conditional recovery. */ }
    }
    // A ZodError's .message is a raw JSON dump of every issue — surface the first
    // field message instead so the customer sees something readable.
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Please check your order details." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: publicErrorMessage(error, "Could not start payment. Retry this checkout; do not create another payment if money was deducted.") }, { status: error instanceof PublicError ? 400 : 503 });
  }
}
