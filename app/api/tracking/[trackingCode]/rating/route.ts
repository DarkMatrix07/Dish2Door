import { NextResponse } from "next/server";
import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyOrderPasscode } from "@/lib/order-codes";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";
import { lookupReviewToken } from "@/lib/review-token-store";
import { isWellFormedReviewToken, reviewLinkProblemMessage } from "@/lib/review-tokens";
import { passcodeAttemptLimits, reviewTokenAttemptLimits, type LimitSpec } from "@/lib/tracking-limits";

// A rating is authorised by EITHER the order's passcode OR a one-tap review token from a
// review reminder. The token can only ever submit this one rating.
const schema = z
  .object({
    passcode: z.string().length(4).optional(),
    token: z.string().max(100).optional(),
    foodRating: z.number().int().min(1).max(5),
    deliveryRating: z.number().int().min(1).max(5),
    review: z.string().max(500).optional()
  })
  .refine((body) => body.passcode !== undefined || body.token !== undefined);

class TokenNoLongerValid extends Error {}

async function withinLimits(specs: LimitSpec[]) {
  const results = await Promise.all(specs.map((spec) => consumeRateLimit(spec.key, spec.max, spec.windowMs)));
  return results.every((result) => result.allowed);
}

export async function POST(request: Request, { params }: { params: Promise<{ trackingCode: string }> }) {
  const { trackingCode } = await params;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid passcode and ratings." }, { status: 400 });
  }

  if (!/^[A-Z2-9]{7}$/.test(trackingCode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  const source = clientAddress(request);

  if (body.token !== undefined) {
    return rateWithToken(trackingCode, body.token, source, body);
  }

  if (!(await withinLimits(passcodeAttemptLimits("rating", trackingCode, source)))) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 429 });
  }

  const order = await prisma.order.findUnique({
    where: { trackingCode },
    include: { rating: true }
  });

  const hash = order?.trackingPasscodeHash || "$2b$12$J4BhNMwYX78srLdhdi6EluJ6GlnQuVKB9ph5WfRFGngYHBdId0lC.";
  const ok = await verifyOrderPasscode(body.passcode ?? "", hash);
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

async function rateWithToken(
  trackingCode: string,
  token: string,
  source: string | null,
  body: { foodRating: number; deliveryRating: number; review?: string }
) {
  if (!(await withinLimits(reviewTokenAttemptLimits(trackingCode, source)))) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again.", reason: "rate_limited" },
      { status: 429 }
    );
  }

  const invalid = (reason: string) =>
    NextResponse.json({ error: reviewLinkProblemMessage(reason), reason }, { status: 401 });

  if (!isWellFormedReviewToken(token)) return invalid("invalid");
  const lookup = await lookupReviewToken(token, trackingCode);
  if (!lookup.ok) return invalid(lookup.reason);

  const order = await prisma.order.findUnique({
    where: { id: lookup.orderId },
    include: { rating: true }
  });
  if (!order) return invalid("invalid");

  if (order.status !== OrderStatus.DELIVERED) {
    return NextResponse.json({ error: "Ratings open after delivery" }, { status: 400 });
  }
  if (order.rating) {
    return NextResponse.json({ error: "Rating already submitted" }, { status: 400 });
  }

  try {
    // One transaction: the token is spent only if the rating is saved, and a second
    // request using the same token cannot also pass the conditional update.
    const rating = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const spent = await tx.reviewToken.updateMany({
        where: { id: lookup.tokenId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      if (spent.count !== 1) throw new TokenNoLongerValid();
      return tx.rating.create({
        data: {
          orderId: order.id,
          foodRating: body.foodRating,
          deliveryRating: body.deliveryRating,
          review: body.review
        }
      });
    });
    return NextResponse.json({ rating });
  } catch (error) {
    if (error instanceof TokenNoLongerValid) return invalid("used");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Rating already submitted" }, { status: 400 });
    }
    throw error;
  }
}
