import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPasscode } from "@/lib/order-codes";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  passcode: z.string().length(4),
  foodRating: z.number().int().min(1).max(5),
  deliveryRating: z.number().int().min(1).max(5),
  review: z.string().max(500).optional()
});

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ trackingCode: string }> }) {
  const { trackingCode } = await params;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid passcode and ratings." }, { status: 400 });
  }

  if (!rateLimit(`rating:${trackingCode}`, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

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

  clearRateLimit(`rating:${trackingCode}`);

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
