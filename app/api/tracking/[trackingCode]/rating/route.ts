import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPasscode } from "@/lib/order-codes";

const schema = z.object({
  passcode: z.string().length(4),
  foodRating: z.number().int().min(1).max(5),
  deliveryRating: z.number().int().min(1).max(5),
  review: z.string().max(500).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ trackingCode: string }> }) {
  const { trackingCode } = await params;
  const body = schema.parse(await request.json());
  const order = await prisma.order.findUnique({
    where: { trackingCode },
    include: { rating: true }
  });

  if (!order?.trackingPasscodeHash) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== OrderStatus.DELIVERED) {
    return NextResponse.json({ error: "Ratings open after delivery" }, { status: 400 });
  }

  if (order.rating) {
    return NextResponse.json({ error: "Rating already submitted" }, { status: 400 });
  }

  const ok = await verifyPasscode(body.passcode, order.trackingPasscodeHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  const rating = await prisma.rating.create({
    data: {
      orderId: order.id,
      foodRating: body.foodRating,
      deliveryRating: body.deliveryRating,
      review: body.review
    }
  });

  return NextResponse.json({ rating });
}
