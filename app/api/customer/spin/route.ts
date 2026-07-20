import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  isSpinEligible,
  normalizePhone,
  pickWeightedSegmentIndex,
  segmentIndexForPercent,
  WHEEL_SEGMENTS
} from "@/lib/spin-wheel";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8).max(20)
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REWARD_TTL_MS = 24 * 60 * 60 * 1000;

function randomCouponCode() {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `WHEEL${suffix}`;
}

function rewardResponse(reward: { discountPercent: number; couponCode: string }) {
  return NextResponse.json({
    segmentIndex: segmentIndexForPercent(reward.discountPercent),
    discountPercent: reward.discountPercent,
    couponCode: reward.couponCode
  });
}

// Server-authoritative spin: the client never chooses its own discount. We verify
// eligibility, pick the winning face by weight, and issue a one-time coupon. The
// unique phone constraint on SpinReward makes the "one spin per phone" rule atomic.
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 8) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    const existing = await prisma.spinReward.findUnique({ where: { phone } });
    if (existing) {
      // Already spun — hand back the same result (idempotent) rather than re-rolling.
      return rewardResponse(existing);
    }

    const orderCount = await prisma.order.count({
      where: { customerPhone: { contains: phone }, rating: { isNot: null } }
    });
    if (!isSpinEligible(orderCount)) {
      return NextResponse.json({ error: "This account is not eligible for a spin right now." }, { status: 403 });
    }

    const segmentIndex = pickWeightedSegmentIndex(Math.random());
    const discountPercent = WHEEL_SEGMENTS[segmentIndex].percent;

    // Retry on the rare coupon-code collision.
    let couponCode = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      couponCode = randomCouponCode();
      const clash = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (!clash) break;
      couponCode = "";
    }
    if (!couponCode) {
      return NextResponse.json({ error: "Could not issue your reward. Please try again." }, { status: 500 });
    }

    try {
      await prisma.$transaction([
        prisma.coupon.create({
          data: {
            code: couponCode,
            description: `Spin wheel reward — ${discountPercent}% off`,
            discountPercent,
            active: true,
            maxUses: 1,
            expiresAt: new Date(Date.now() + REWARD_TTL_MS)
          }
        }),
        prisma.spinReward.create({
          data: {
            phone,
            email: body.email || null,
            name: body.name || null,
            discountPercent,
            couponCode
          }
        })
      ]);
    } catch (error) {
      // Concurrent spin from the same phone lost the race — return the winner's reward.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await prisma.spinReward.findUnique({ where: { phone } });
        if (winner) return rewardResponse(winner);
      }
      throw error;
    }

    return NextResponse.json({ segmentIndex, discountPercent, couponCode });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Enter your details first." : "Could not spin right now. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
