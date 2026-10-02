import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";
import { lookupReviewToken } from "@/lib/review-token-store";
import { isWellFormedReviewToken, reviewLinkProblemMessage } from "@/lib/review-tokens";
import { reviewTokenAttemptLimits } from "@/lib/tracking-limits";

// Opens a one-tap review link. It does NOT spend the token (the rating endpoint does).
// It returns only what the rating form shows: the order code the customer already has in
// the URL, the restaurant name and the item names. Never prices, phone, address, status
// timeline or anything else from the tracking view.
const schema = z.object({ token: z.string().max(100) });

export async function POST(request: Request, { params }: { params: Promise<{ trackingCode: string }> }) {
  const { trackingCode } = await params;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: reviewLinkProblemMessage("invalid"), reason: "invalid" }, { status: 400 });
  }

  const invalid = (reason: string) =>
    NextResponse.json({ error: reviewLinkProblemMessage(reason), reason }, { status: 401 });

  if (!/^[A-Z2-9]{7}$/.test(trackingCode) || !isWellFormedReviewToken(body.token)) return invalid("invalid");

  const limits = await Promise.all(
    reviewTokenAttemptLimits(trackingCode, clientAddress(request)).map((spec) =>
      consumeRateLimit(spec.key, spec.max, spec.windowMs)
    )
  );
  if (limits.some((limit) => !limit.allowed)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again.", reason: "rate_limited" },
      { status: 429 }
    );
  }

  const lookup = await lookupReviewToken(body.token, trackingCode);
  if (!lookup.ok) return invalid(lookup.reason);

  const order = await prisma.order.findUnique({
    where: { id: lookup.orderId },
    select: {
      trackingCode: true,
      status: true,
      restaurant: { select: { name: true } },
      items: { select: { nameSnapshot: true } },
      rating: { select: { id: true } }
    }
  });
  if (!order) return invalid("invalid");

  if (order.status !== OrderStatus.DELIVERED) {
    return NextResponse.json({ error: "Ratings open once your order is delivered.", reason: "not_delivered" }, { status: 400 });
  }

  return NextResponse.json({
    review: {
      trackingCode: order.trackingCode,
      restaurantName: order.restaurant.name,
      items: order.items.map((item) => item.nameSnapshot),
      alreadyRated: Boolean(order.rating)
    }
  });
}
