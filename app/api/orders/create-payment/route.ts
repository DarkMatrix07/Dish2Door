import { NextResponse } from "next/server";
import { DeliveryType, OrderSlot } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createPendingOnlineOrder } from "@/lib/orders";
import { assertOrderSlotAvailable } from "@/lib/order-slots";
import { createRazorpayClient } from "@/lib/razorpay";
import { env } from "@/lib/env";
import { optionalHostelBlockSchema } from "@/lib/hostels";

const bodySchema = z.object({
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(8),
    deliveryType: z.nativeEnum(DeliveryType),
    hostelBlock: optionalHostelBlockSchema,
    couponCode: z.string().optional(),
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
    z.object({
      menuItemId: z.string().min(1),
      quantity: z.number().int().min(1).max(20)
    })
  ).min(1)
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    assertOrderSlotAvailable(body.customer.orderSlot);
    const order = await createPendingOnlineOrder(body.customer, body.items);
    const razorpay = createRazorpayClient();
    const razorpayOrder = await razorpay.orders.create({
      amount: order.totalPaise,
      currency: "INR",
      receipt: order.id,
      notes: {
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
    // A ZodError's .message is a raw JSON dump of every issue — surface the first
    // field message instead so the customer sees something readable.
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Please check your order details." },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Could not create payment";
    const isDatabaseConnectionError =
      message.includes("ECONNREFUSED") || message.includes("Can't reach database server");

    return NextResponse.json(
      {
        error: isDatabaseConnectionError
          ? "Database is not running. Start PostgreSQL, run migrations, then try checkout again."
          : message
      },
      { status: 400 }
    );
  }
}
