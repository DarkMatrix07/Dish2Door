import { prisma } from "@/lib/db";
import { isSpinCouponUsable } from "@/lib/spin-wheel";

// Resolve the one outstanding reward for a phone. If its backing coupon is no
// longer usable, close the reward immediately so it cannot block a future day.
export async function getActiveSpinReward(phone: string, now = new Date()) {
  const reward = await prisma.spinReward.findFirst({
    where: { phone, redeemedAt: null, expiredAt: null },
    orderBy: { createdAt: "desc" }
  });
  if (!reward) return null;

  const coupon = await prisma.coupon.findUnique({ where: { code: reward.couponCode } });
  if (isSpinCouponUsable(coupon, now)) return reward;

  await prisma.spinReward.updateMany({
    where: { id: reward.id, redeemedAt: null, expiredAt: null },
    data: { expiredAt: now }
  });
  return null;
}
