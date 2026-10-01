import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { giftCouponBodySchema } from "@/lib/admin-rewards";
import { giveWheelCoupon } from "@/lib/admin-rewards-db";
import { rewardErrorResponse } from "@/lib/admin-rewards-http";

// Admin gives one customer a one-time wheel coupon. Body (strict):
//   { phone, percent: a wheel value, days: 1 | 3 | 7, note?: string (max 200), replace?: boolean }
// 200 { couponCode, percent, expiresAt (ISO), replacedCode | null }
export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = giftCouponBodySchema.parse(await request.json());
    const given = await giveWheelCoupon(prisma, input, user.id);
    return NextResponse.json({
      couponCode: given.couponCode,
      percent: given.percent,
      expiresAt: given.expiresAt.toISOString(),
      replacedCode: given.replacedCode
    });
  } catch (error) {
    return rewardErrorResponse(error);
  }
}
