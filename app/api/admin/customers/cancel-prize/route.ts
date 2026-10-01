import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cancelPrizeBodySchema } from "@/lib/admin-rewards";
import { cancelPrize } from "@/lib/admin-rewards-db";
import { rewardErrorResponse } from "@/lib/admin-rewards-http";

// Admin closes a prize the customer has not used yet (won or given). Body (strict):
//   { phone, rewardId }
// 200 { ok: true, couponCode }. Refused with 409 while a checkout is holding the code.
export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = cancelPrizeBodySchema.parse(await request.json());
    const { couponCode } = await cancelPrize(prisma, input);
    return NextResponse.json({ ok: true, couponCode });
  } catch (error) {
    return rewardErrorResponse(error);
  }
}
