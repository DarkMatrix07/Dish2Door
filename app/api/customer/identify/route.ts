import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isSpinEligible, normalizePhone, segmentIndexForPercent } from "@/lib/spin-wheel";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8).max(20)
});

// Called when a customer opens the cart. Returns how many *reviewed* orders this
// phone has placed and whether the discount wheel should be offered. Never mutates.
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 8) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    const [orderCount, existingReward] = await Promise.all([
      prisma.order.count({
        where: { customerPhone: { contains: phone }, rating: { isNot: null } }
      }),
      prisma.spinReward.findUnique({ where: { phone } })
    ]);

    // A customer who already spun keeps their coupon until it is redeemed, so we
    // hand it back for auto-apply. They are never offered another spin.
    const reward = existingReward && !existingReward.redeemedAt
      ? {
          discountPercent: existingReward.discountPercent,
          couponCode: existingReward.couponCode,
          segmentIndex: segmentIndexForPercent(existingReward.discountPercent)
        }
      : null;

    return NextResponse.json({
      orderCount,
      alreadySpun: Boolean(existingReward),
      eligible: isSpinEligible(orderCount) && !existingReward,
      reward
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Enter your name, phone, and email." : "Could not look up your profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
