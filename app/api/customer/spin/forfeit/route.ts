import { NextResponse } from "next/server";
import { Prisma, SpinMode, SpinOutcome } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getActiveSpinReward } from "@/lib/spin-rewards";
import { getIndiaSpinDay, isValidIndianMobile, normalizePhone } from "@/lib/spin-wheel";

const schema = z.object({
  phone: z.string().min(8).max(20)
});

// Called when a customer closes the wheel without spinning. This deliberately uses up
// their chance: we record a FORFEITED SpinUsage row for today (the authoritative daily
// cap) and move the loyalty baseline up to the current reviewed-order count, which
// zeroes the 3-6 regulars window so they must earn it again. wheelConsumed is written
// only as an audit breadcrumb — no eligibility check reads it. If the customer already
// holds an un-redeemed reward, do nothing: they keep that coupon.
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

    const settings = await getSettings();
    const mode = settings.spinWheelForEveryone ? SpinMode.EVERYONE : SpinMode.REGULARS;

    try {
      await prisma.$transaction([
        // Customer first: SpinUsage references it.
        prisma.customer.upsert({
          where: { phone },
          create: { phone, spinBaseline: reviewedCount, wheelConsumed: true },
          update: { spinBaseline: reviewedCount, wheelConsumed: true }
        }),
        prisma.spinUsage.create({ data: { phone, spinDay, outcome: SpinOutcome.FORFEITED, mode } })
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
