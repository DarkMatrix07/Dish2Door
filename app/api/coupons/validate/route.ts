import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/spin-wheel";

const schema = z.object({
  code: z.string().min(3).max(24),
  phone: z.string().optional()
});

export async function POST(request: Request) {
  const body = schema.parse(await request.json());
  const coupon = await prisma.coupon.findUnique({
    where: { code: body.code.toUpperCase() }
  });

  if (
    !coupon ||
    !coupon.active ||
    (coupon.expiresAt && coupon.expiresAt < new Date()) ||
    (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses)
  ) {
    return NextResponse.json({ error: "Invalid coupon" }, { status: 404 });
  }

  // Spin-wheel coupons are bound to the phone that won them. A copied/shared code
  // won't preview a discount for anyone else, matching the checkout-time rejection.
  const boundReward = await prisma.spinReward.findFirst({ where: { couponCode: coupon.code } });
  if (boundReward && (!body.phone || normalizePhone(boundReward.phone) !== normalizePhone(body.phone))) {
    return NextResponse.json(
      { error: "This reward is linked to the account that won it." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    code: coupon.code,
    discountPercent: coupon.discountPercent,
    description: coupon.description,
    expiresAt: coupon.expiresAt,
    remainingUses: coupon.maxUses === null ? null : Math.max(0, coupon.maxUses - coupon.usedCount)
  });
}
