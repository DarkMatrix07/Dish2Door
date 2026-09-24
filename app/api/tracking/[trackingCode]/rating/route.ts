import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyOrderPasscode } from "@/lib/order-codes";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";

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

  const source = clientAddress(request);
  const limits = await Promise.all([
    consumeRateLimit(`rating:${trackingCode}`, MAX_ATTEMPTS, WINDOW_MS),
    ...(source ? [consumeRateLimit(`rating-source:${source}`, 40, WINDOW_MS)] : [])
  ]);
  if (limits.some((limit) => !limit.allowed)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 429 });
  }

  const order = await prisma.order.findUnique({
    where: { trackingCode },
    include: { rating: true }
  });

  const hash = order?.trackingPasscodeHash || "$2b$12$J4BhNMwYX78srLdhdi6EluJ6GlnQuVKB9ph5WfRFGngYHBdId0lC.";
  const ok = await verifyOrderPasscode(body.passcode, hash);
  if (!ok || !order?.trackingPasscodeHash) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  if (order.status !== OrderStatus.DELIVERED) {
    return NextResponse.json({ error: "Ratings open after delivery" }, { status: 400 });
  }

  if (order.rating) {
    return NextResponse.json({ error: "Rating already submitted" }, { status: 400 });
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
