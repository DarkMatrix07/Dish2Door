import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getActiveSpinReward } from "@/lib/spin-rewards";
import {
  getIndiaSpinDay,
  isValidIndianMobile,
  normalizePhone,
  qualifiesForSpin,
  reviewsUntilSpin,
  segmentIndexForPercent,
  SPIN_ORDERS_PER_REWARD
} from "@/lib/spin-wheel";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8).max(20)
});

// Called when a customer opens the cart. Returns whether the discount wheel should
// be offered, based on the *effective* reviewed-order count (real reviewed orders
// minus the loyalty baseline, so the counter restarts after each redeemed spin) and
// the daily spin cap. It never grants or consumes a spin, but it is not strictly
// read-only: getActiveSpinReward lazily stamps expiredAt on a reward whose coupon has
// lapsed, which frees the partial unique slot for a future spin.
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (!isValidIndianMobile(phone)) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    const spinDay = getIndiaSpinDay();
    const outstanding = await getActiveSpinReward(phone);
    const [reviewedCount, unratedOrders, loyalty, usage, settings] = await Promise.all([
      prisma.order.count({
        where: { customerPhone: phone, rating: { isNot: null } }
      }),
      // Delivered orders they could still rate — the concrete action behind the nudge.
      prisma.order.count({
        where: { customerPhone: phone, status: OrderStatus.DELIVERED, rating: { is: null } }
      }),
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

    // A customer with an unredeemed spin keeps that coupon (auto-applied) and is not
    // offered another spin until they use it.
    const reward = outstanding
      ? {
          discountPercent: outstanding.discountPercent,
          couponCode: outstanding.couponCode,
          segmentIndex: segmentIndexForPercent(outstanding.discountPercent)
        }
      : null;

    // Progress towards the next wheel, so the cart can nudge: "2 of 3 reviews — 1 more
    // unlocks your spin". Only meaningful in regulars mode; in everyone-mode the wheel
    // is already unlocked so there is nothing to work towards.
    const reviewsNeeded = reviewsUntilSpin(effectiveCount);
    const progress = settings.spinWheelForEveryone
      ? null
      : {
          reviewed: Math.min(effectiveCount, SPIN_ORDERS_PER_REWARD),
          required: SPIN_ORDERS_PER_REWARD,
          remaining: reviewsNeeded,
          unratedOrders
        };

    return NextResponse.json({
      orderCount: effectiveCount,
      totalReviewed: reviewedCount,
      hasOutstandingReward: Boolean(outstanding),
      usedToday: Boolean(usage),
      eligible: qualifies && !outstanding,
      progress,
      reward
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Enter your name, phone, and email." : "Could not look up your profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
