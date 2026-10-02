import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { cancelPrizeBodySchema, type CancelPrizeInput } from "@/lib/admin-rewards";
import { RewardActionError, cancelPrize } from "@/lib/admin-rewards-db";
import { rewardErrorResponse } from "@/lib/admin-rewards-http";

// Admin closes a prize the customer has not used yet (won or given). Body (strict):
//   { phone, rewardId }
// 200 { ok: true, couponCode }. Refused with 409 while a checkout is holding the code.
export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: CancelPrizeInput | null = null;
  try {
    input = cancelPrizeBodySchema.parse(await request.json());
    const { couponCode } = await cancelPrize(prisma, input);
    await recordAudit({
      actorId: user.id,
      action: "wheel.cancel",
      targetType: "customer",
      targetId: input.phone,
      detail: "Cancelled the customer's unused wheel prize. Its coupon was switched off."
    });
    return NextResponse.json({ ok: true, couponCode });
  } catch (error) {
    if (input && error instanceof RewardActionError && error.status < 500) {
      await recordAudit({
        actorId: user.id,
        action: "wheel.cancel",
        targetType: "customer",
        targetId: input.phone,
        outcome: "refused",
        detail: "Refused to cancel a prize: it was not found, was already used or closed, or a checkout is using it."
      });
    }
    return rewardErrorResponse(error);
  }
}
