import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getActiveSpinReward } from "@/lib/spin-rewards";
import { getIndiaSpinDay, isValidIndianMobile, normalizePhone } from "@/lib/spin-wheel";

const schema = z.object({
  phone: z.string().min(8).max(20)
});

// Called when a customer closes the wheel without spinning. This deliberately uses up
// their chance for this cycle: we set wheelConsumed (blocks the "for everyone" mode
// from re-offering) and move the loyalty baseline up to the current reviewed-order
// count (zeroes the 3-6 count-mode window). A redeemed spin later resets both. If the
// customer already holds an unredeemed reward, do nothing — they keep that coupon.
export async function POST(request: Request) {
  try {
    const { phone: rawPhone } = schema.parse(await request.json());
    const phone = normalizePhone(rawPhone);
    if (!isValidIndianMobile(phone)) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    const spinDay = getIndiaSpinDay();
    const outstanding = await getActiveSpinReward(phone);
    if (outstanding) {
      return NextResponse.json({ ok: true, keptReward: true });
    }

    const reviewedCount = await prisma.order.count({
      where: { customerPhone: phone, rating: { isNot: null } }
    });

    try {
      await prisma.$transaction([
        prisma.spinUsage.create({ data: { phone, spinDay, outcome: "FORFEITED" } }),
        prisma.customerLoyalty.upsert({
          where: { phone },
          create: { phone, spinBaseline: reviewedCount, wheelConsumed: true },
          update: { spinBaseline: reviewedCount, wheelConsumed: true }
        })
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ ok: true, alreadyUsed: true });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const invalid = error instanceof z.ZodError;
    return NextResponse.json(
      { error: invalid ? "Enter a valid phone number." : "Could not give up the spin. Please try again." },
      { status: invalid ? 400 : 500 }
    );
  }
}
