import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isSpinCouponUsable } from "@/lib/spin-wheel";
import { generateWheelCouponCode } from "@/lib/wheel-coupon-code";

// Either the shared client or a transaction, so the admin "give a prize" flow can run the
// same lookup inside its own transaction.
type RewardDb = Pick<Prisma.TransactionClient, "spinReward" | "coupon">;

// Resolve the one outstanding reward for a phone. If its backing coupon is no longer
// usable, close the reward immediately so it cannot block a future day.
export async function getActiveSpinReward(phone: string, now = new Date(), db: RewardDb = prisma) {
  const reward = await db.spinReward.findFirst({
    where: { phone, redeemedAt: null, expiredAt: null },
    orderBy: { createdAt: "desc" }
  });
  if (!reward) return null;

  const coupon = await db.coupon.findUnique({ where: { code: reward.couponCode } });
  if (isSpinCouponUsable(coupon, now)) return reward;

  await db.spinReward.updateMany({
    where: { id: reward.id, redeemedAt: null, expiredAt: null },
    data: { expiredAt: now }
  });
  return null;
}

// A wheel code nobody has used yet, or null after a few unlucky clashes. A clash is a
// 1-in-a-billion event, so this is a safety net rather than a loop that ever runs long.
export async function findFreeWheelCouponCode(db: Pick<Prisma.TransactionClient, "coupon"> = prisma) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateWheelCouponCode();
    const clash = await db.coupon.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return null;
}
