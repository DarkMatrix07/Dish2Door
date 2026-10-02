import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { daysLabel, giftCouponBodySchema, type GiftCouponInput } from "@/lib/admin-rewards";
import { RewardActionError, giveWheelCoupon } from "@/lib/admin-rewards-db";
import { rewardErrorResponse } from "@/lib/admin-rewards-http";

// Admin gives one customer a one-time wheel coupon. Body (strict):
//   { phone, percent: a wheel value, days: 1 | 3 | 7, note?: string (max 200), replace?: boolean }
// 200 { couponCode, percent, expiresAt (ISO), replacedCode | null }
export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: GiftCouponInput | null = null;
  try {
    input = giftCouponBodySchema.parse(await request.json());
    const given = await giveWheelCoupon(prisma, input, user.id);
    // The coupon code itself stays out of the log: it is a live, spendable code.
    const note = input.note?.trim();
    await recordAudit({
      actorId: user.id,
      action: "wheel.gift",
      targetType: "customer",
      targetId: input.phone,
      detail: [
        `Gave a ${given.percent}% wheel coupon, valid for ${daysLabel(input.days)}`,
        given.replacedCode ? "It replaced the customer's earlier unused prize." : null,
        note ? `Note: ${note.slice(0, 100)}` : null
      ]
        .filter(Boolean)
        .join(". ")
    });
    return NextResponse.json({
      couponCode: given.couponCode,
      percent: given.percent,
      expiresAt: given.expiresAt.toISOString(),
      replacedCode: given.replacedCode
    });
  } catch (error) {
    // Only a "no" from the rules is logged (not a mistyped form or a server fault). The
    // server's own wording can include the customer's live code, so the reason is rewritten.
    if (input && error instanceof RewardActionError && error.status < 500) {
      await recordAudit({
        actorId: user.id,
        action: "wheel.gift",
        targetType: "customer",
        targetId: input.phone,
        outcome: "refused",
        detail:
          error.status === 404
            ? "Refused: there is no customer with that phone number."
            : `Refused a ${input.percent}% gift: the customer already has a prize waiting, or a checkout is using it.`
      });
    }
    return rewardErrorResponse(error);
  }
}
