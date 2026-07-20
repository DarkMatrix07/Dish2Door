import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/spin-wheel";

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
    if (phone.length < 8) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    const outstanding = await prisma.spinReward.findFirst({ where: { phone, redeemedAt: null } });
    if (outstanding) {
      return NextResponse.json({ ok: true, keptReward: true });
    }

    const reviewedCount = await prisma.order.count({
      where: { customerPhone: { contains: phone }, rating: { isNot: null } }
    });

    await prisma.customerLoyalty.upsert({
      where: { phone },
      create: { phone, spinBaseline: reviewedCount, wheelConsumed: true },
      update: { spinBaseline: reviewedCount, wheelConsumed: true }
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Forfeiting is best-effort; never surface an error that would trap the modal open.
    return NextResponse.json({ ok: true });
  }
}
