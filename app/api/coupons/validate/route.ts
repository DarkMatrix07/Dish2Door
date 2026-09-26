import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/spin-wheel";

const schema = z.object({
  code: z.string().trim().min(3).max(24),
  phone: z.string().optional()
});

export async function POST(request: Request) {
  // A short or malformed code is an ordinary "not valid", not a server error. Parsing
  // outside a try made every such request throw and return a 500.
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid coupon code." }, { status: 400 });
  }
  const body = parsed.data;

  const coupon = await prisma.coupon.findUnique({
    where: { code: body.code.toUpperCase() }
  });

  // Capacity counts checkouts that already hold the coupon, exactly as
  // createPendingOnlineOrder does. Previewing a coupon the payment step will then
  // refuse only moves the disappointment to a worse moment.
  if (
    !coupon ||
    !coupon.active ||
    (coupon.expiresAt && coupon.expiresAt < new Date()) ||
    (coupon.maxUses !== null && coupon.usedCount + coupon.heldCount >= coupon.maxUses)
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
    remainingUses: coupon.maxUses === null ? null : Math.max(0, coupon.maxUses - coupon.usedCount - coupon.heldCount)
  });
}
