import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isSpinEligible, normalizePhone, segmentIndexForPercent } from "@/lib/spin-wheel";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8).max(20)
});

// Called when a customer opens the cart. Returns whether the discount wheel should
// be offered, based on the *effective* reviewed-order count (real reviewed orders
// minus the loyalty baseline, so the counter restarts after each redeemed spin).
// Never mutates.
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 8) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    const [reviewedCount, loyalty, outstanding] = await Promise.all([
      prisma.order.count({
        where: { customerPhone: { contains: phone }, rating: { isNot: null } }
      }),
      prisma.customerLoyalty.findUnique({ where: { phone } }),
      prisma.spinReward.findFirst({ where: { phone, redeemedAt: null } })
    ]);

    const effectiveCount = Math.max(0, reviewedCount - (loyalty?.spinBaseline ?? 0));

    // A customer with an unredeemed spin keeps that coupon (auto-applied) and is not
    // offered another spin until they use it.
    const reward = outstanding
      ? {
          discountPercent: outstanding.discountPercent,
          couponCode: outstanding.couponCode,
          segmentIndex: segmentIndexForPercent(outstanding.discountPercent)
        }
      : null;

    return NextResponse.json({
      orderCount: effectiveCount,
      totalReviewed: reviewedCount,
      hasOutstandingReward: Boolean(outstanding),
      eligible: isSpinEligible(effectiveCount) && !outstanding,
      reward
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Enter your name, phone, and email." : "Could not look up your profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
