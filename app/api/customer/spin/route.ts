import { NextResponse } from "next/server";
import { Prisma, SpinMode, SpinOutcome } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getActiveSpinReward } from "@/lib/spin-rewards";
import {
  getIndiaSpinDay,
  isValidIndianMobile,
  normalizePhone,
  pickWeightedSegmentIndex,
  qualifiesForSpin,
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
// eligibility, pick the winning face by weight, and issue a one-time coupon. Two DB
// constraints make the limits atomic rather than check-then-write: SpinUsage's unique
// (phone, spinDay) caps it at one spin per number per IST day, and SpinReward's
// partial unique index allows only one un-redeemed, un-expired reward per number.
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (!isValidIndianMobile(phone)) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    const spinDay = getIndiaSpinDay();
    const outstanding = await getActiveSpinReward(phone);
    if (outstanding) {
      // Unredeemed spin already exists — hand back the same result (idempotent).
      return rewardResponse(outstanding);
    }

    const [reviewedCount, loyalty, usage, settings] = await Promise.all([
      prisma.order.count({ where: { customerPhone: phone, rating: { isNot: null } } }),
      prisma.customer.findUnique({ where: { phone } }),
      prisma.spinUsage.findUnique({ where: { phone_spinDay: { phone, spinDay } } }),
      getSettings()
    ]);
    const effectiveCount = Math.max(0, reviewedCount - (loyalty?.spinBaseline ?? 0));
    const qualifies = qualifiesForSpin({
      effectiveCount,
      forEveryone: settings.spinWheelForEveryone,
      usedToday: Boolean(usage)
    });
    if (!qualifies) {
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

    const mode = settings.spinWheelForEveryone ? SpinMode.EVERYONE : SpinMode.REGULARS;

    try {
      await prisma.$transaction([
        // Must come first: SpinReward and SpinUsage both reference Customer.
        prisma.customer.upsert({
          where: { phone },
          create: { phone, name: body.name || null, email: body.email || null },
          update: { name: body.name || undefined, email: body.email || undefined }
        }),
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
        }),
        prisma.spinUsage.create({
          data: { phone, spinDay, outcome: SpinOutcome.SPUN, mode }
        })
      ]);
    } catch (error) {
      // Lost a race against one of the two unique constraints above: either a
      // concurrent spin already issued the reward (return it), or this number has
      // already used today's spin (409).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await getActiveSpinReward(phone);
        if (winner) return rewardResponse(winner);
        const used = await prisma.spinUsage.findUnique({ where: { phone_spinDay: { phone, spinDay } } });
        if (used) {
          return NextResponse.json({ error: "This number has already used today's spin." }, { status: 409 });
        }
      }
      throw error;
    }

    return NextResponse.json({ segmentIndex, discountPercent, couponCode });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Enter your details first." : "Could not spin right now. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
