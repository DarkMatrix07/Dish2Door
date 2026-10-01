import { Prisma, type PrismaClient } from "@prisma/client";
import { giftCouponDescription, giftExpiry, type CancelPrizeInput, type GiftCouponInput } from "@/lib/admin-rewards";
import { findFreeWheelCouponCode, getActiveSpinReward } from "@/lib/spin-rewards";

// Database side of the admin "Give wheel coupon" and "Cancel prize" buttons. Each action is
// one transaction, so a prize is never half given or half closed.

export class RewardActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RewardActionError";
  }
}

const HELD_MESSAGE =
  "The customer has started a checkout with this code and has not finished paying. Once that order is paid or cancelled, try again.";
const GONE_MESSAGE = "That prize was just used or closed. Reload the page to see where it stands.";

// Closes a live prize: the reward is ended and its coupon switched off. The coupon update
// only matches while no open checkout holds it. That is a single guarded statement, and a
// checkout takes its hold with a matching "active" guard, so one of the two always wins
// cleanly instead of a customer paying with a code that was just taken away.
async function closeLiveReward(tx: Prisma.TransactionClient, reward: { id: string; couponCode: string }, now: Date) {
  const coupon = await tx.coupon.findUnique({ where: { code: reward.couponCode }, select: { id: true } });
  if (coupon) {
    const closed = await tx.coupon.updateMany({ where: { id: coupon.id, heldCount: 0 }, data: { active: false } });
    if (closed.count === 0) throw new RewardActionError(HELD_MESSAGE, 409);
  }
  const ended = await tx.spinReward.updateMany({
    where: { id: reward.id, redeemedAt: null, expiredAt: null },
    data: { expiredAt: now }
  });
  if (ended.count === 0) throw new RewardActionError(GONE_MESSAGE, 409);
}

export type GivenPrize = { rewardId: string; couponCode: string; percent: number; expiresAt: Date; replacedCode: string | null };

// One attempt. Throws RewardActionError for anything the admin can understand and fix.
export async function giveWheelCouponTx(
  tx: Prisma.TransactionClient,
  input: GiftCouponInput,
  adminId: string,
  now = new Date()
): Promise<GivenPrize> {
  const customer = await tx.customer.findUnique({ where: { phone: input.phone } });
  if (!customer) throw new RewardActionError("There is no customer with that phone number.", 404);

  // getActiveSpinReward also closes a leftover prize whose coupon has already run out, so
  // only a prize the customer can really still use is in the way.
  let replacedCode: string | null = null;
  const live = await getActiveSpinReward(input.phone, now, tx);
  if (live) {
    if (!input.replace) {
      throw new RewardActionError(
        `This customer already has a ${live.discountPercent}% prize waiting (${live.couponCode}). Choose to replace it, or cancel it first.`,
        409
      );
    }
    await closeLiveReward(tx, live, now);
    replacedCode = live.couponCode;
  }

  const couponCode = await findFreeWheelCouponCode(tx);
  if (!couponCode) throw new RewardActionError("Could not make a new code. Please try again.", 500);

  const expiresAt = giftExpiry(input.days, now);
  await tx.coupon.create({
    data: {
      code: couponCode,
      description: giftCouponDescription(input.percent),
      discountPercent: input.percent,
      active: true,
      maxUses: 1,
      expiresAt
    }
  });
  // No SpinUsage row: a gift must not use up the customer's spin for the day.
  const reward = await tx.spinReward.create({
    data: {
      phone: input.phone,
      name: customer.name,
      email: customer.email,
      discountPercent: input.percent,
      couponCode,
      issuedById: adminId,
      issuedNote: input.note?.trim() || null
    }
  });
  return { rewardId: reward.id, couponCode, percent: input.percent, expiresAt, replacedCode };
}

// Retries when the insert hits a unique constraint. Two different constraints can cause
// that: the one-live-prize-per-phone index (another prize appeared a moment ago, so stop
// and say so) or, very rarely, the coupon code clashing (pick a new code and go again).
// Telling them apart by looking is more dependable than reading the driver's error text.
export async function giveWheelCoupon(db: PrismaClient, input: GiftCouponInput, adminId: string): Promise<GivenPrize> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction((tx) => giveWheelCouponTx(tx, input, adminId));
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const raced = await db.spinReward.findFirst({ where: { phone: input.phone, redeemedAt: null, expiredAt: null } });
      if (raced) {
        throw new RewardActionError(
          "This customer just got another prize at the same moment. Reload the page and check before giving a new one.",
          409
        );
      }
    }
  }
  throw new RewardActionError("Could not make a new code. Please try again.", 500);
}

export async function cancelPrizeTx(tx: Prisma.TransactionClient, input: CancelPrizeInput, now = new Date()) {
  const reward = await tx.spinReward.findFirst({ where: { id: input.rewardId, phone: input.phone } });
  if (!reward) throw new RewardActionError("That prize was not found.", 404);
  if (reward.redeemedAt) throw new RewardActionError("That prize has already been used on an order, so it cannot be cancelled.", 409);
  if (reward.expiredAt) throw new RewardActionError("That prize is already closed.", 409);
  await closeLiveReward(tx, reward, now);
  return { couponCode: reward.couponCode };
}

export function cancelPrize(db: PrismaClient, input: CancelPrizeInput) {
  return db.$transaction((tx) => cancelPrizeTx(tx, input));
}
