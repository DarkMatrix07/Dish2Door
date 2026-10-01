import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import {
  MAX_COUPON_PERCENT,
  COUPON_IN_USE_MESSAGE,
  MAX_COUPON_USES,
  WHEEL_CODE_MESSAGE,
  couponDeleteBlock,
  expiryFromDay,
  expiryProblem,
  expiryToDay,
  isWheelCode,
  maxUsesProblem
} from "@/lib/coupon-admin";
import { countOrdersByCode, toCouponRow } from "@/lib/coupon-data";
import { prisma } from "@/lib/db";

// Coupon screen actions. They used to live in /api/admin/menu (which still has them, and
// still works); this route adds the rules the Coupons screen needs: no deleting a coupon
// that was used, no limit below what is already claimed, and no touching wheel prizes.

const percent = z.number().int().min(1).max(MAX_COUPON_PERCENT);
const maxUses = z.number().int().min(1).max(MAX_COUPON_USES).nullable();
// A calendar day (India time). The server turns it into the end of that day.
const expiresOn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a real date for the expiry.").nullable();
const description = z.string().trim().max(200).nullable();

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("coupon.create"),
    code: z.string().trim().min(3).max(24),
    description: description.optional(),
    discountPercent: percent,
    maxUses: maxUses.optional(),
    expiresOn: expiresOn.optional()
  }),
  z.object({
    action: z.literal("coupon.update"),
    id: z.string().min(1),
    description: description.optional(),
    discountPercent: percent.optional(),
    maxUses: maxUses.optional(),
    expiresOn: expiresOn.optional()
  }),
  z.object({ action: z.literal("coupon.active"), id: z.string().min(1), active: z.boolean() }),
  z.object({ action: z.literal("coupon.delete"), id: z.string().min(1) })
]);

class Refusal extends Error {
  constructor(message: string, readonly status = 400, readonly reason?: string) {
    super(message);
  }
}

function refuse(body: { error: string; reason?: string }, status: number) {
  return NextResponse.json(body, { status });
}

// A prize the wheel handed out is not the owner's coupon to edit here.
async function assertOwnerCoupon(code: string) {
  if (await prisma.spinReward.count({ where: { couponCode: code } })) {
    throw new Refusal("That is a discount wheel prize. It is managed on the Discount wheel page.", 403);
  }
}

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = schema.parse(await request.json());

    if (body.action === "coupon.create") {
      const code = body.code.toUpperCase();
      if (isWheelCode(code)) throw new Refusal(WHEEL_CODE_MESSAGE);
      const problem = expiryProblem(body.expiresOn);
      if (problem) throw new Refusal(problem);
      const coupon = await prisma.coupon.create({
        data: {
          code,
          description: body.description || null,
          discountPercent: body.discountPercent,
          maxUses: body.maxUses ?? null,
          expiresAt: body.expiresOn ? expiryFromDay(body.expiresOn) : null
        }
      });
      return NextResponse.json({ coupon: toCouponRow(coupon, 0) });
    }

    if (body.action === "coupon.active") {
      const existing = await prisma.coupon.findUnique({ where: { id: body.id }, select: { code: true } });
      if (!existing) throw new Refusal("That coupon no longer exists. Refresh the page.", 404);
      await assertOwnerCoupon(existing.code);
      const coupon = await prisma.coupon.update({ where: { id: body.id }, data: { active: body.active } });
      const counts = await countOrdersByCode([coupon.code]);
      return NextResponse.json({ coupon: toCouponRow(coupon, counts.get(coupon.code) ?? 0) });
    }

    if (body.action === "coupon.update") {
      // Lock the row so a checkout claiming a use at the same moment waits for this check.
      const coupon = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Coupon" WHERE id = ${body.id} FOR UPDATE`;
        const current = await tx.coupon.findUnique({ where: { id: body.id } });
        if (!current) throw new Refusal("That coupon no longer exists. Refresh the page.", 404);
        if (await tx.spinReward.count({ where: { couponCode: current.code } })) {
          throw new Refusal("That is a discount wheel prize. It is managed on the Discount wheel page.", 403);
        }
        if (body.maxUses !== undefined) {
          const problem = maxUsesProblem(body.maxUses, current.usedCount, current.heldCount);
          if (problem) throw new Refusal(problem);
        }
        // Keeping an old past date is fine; moving it to another past day is not.
        if (body.expiresOn && body.expiresOn !== expiryToDay(current.expiresAt)) {
          const problem = expiryProblem(body.expiresOn);
          if (problem) throw new Refusal(problem);
        }
        return tx.coupon.update({
          where: { id: body.id },
          data: {
            description: body.description === undefined ? undefined : body.description || null,
            discountPercent: body.discountPercent,
            maxUses: body.maxUses,
            expiresAt: body.expiresOn === undefined ? undefined : body.expiresOn ? expiryFromDay(body.expiresOn) : null
          }
        });
      });
      const counts = await countOrdersByCode([coupon.code]);
      return NextResponse.json({ coupon: toCouponRow(coupon, counts.get(coupon.code) ?? 0) });
    }

    // coupon.delete
    const existing = await prisma.coupon.findUnique({ where: { id: body.id } });
    if (!existing) throw new Refusal("That coupon was already removed. Refresh the page.", 404);
    await assertOwnerCoupon(existing.code);
    const [counts, reservations] = await Promise.all([
      countOrdersByCode([existing.code]),
      prisma.couponReservation.count({ where: { couponId: existing.id } })
    ]);
    const block = couponDeleteBlock({ ...existing, orderCount: counts.get(existing.code) ?? 0 }, reservations);
    if (block) throw new Refusal(block, 409, "IN_USE");
    // The counts are checked again in the delete itself, in case a checkout claimed it a
    // moment ago.
    const removed = await prisma.coupon.deleteMany({ where: { id: existing.id, usedCount: 0, heldCount: 0 } });
    if (!removed.count) throw new Refusal(COUPON_IN_USE_MESSAGE, 409, "IN_USE");
    return NextResponse.json({ coupon: toCouponRow(existing, 0) });
  } catch (error) {
    if (error instanceof Refusal) return refuse({ error: error.message, reason: error.reason }, error.status);
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const field = issue?.path.join(".") || "input";
      return refuse({ error: issue ? `${field}: ${issue.message}` : "Invalid input" }, 400);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return refuse({ error: "A coupon with that code already exists. Pick a different code." }, 409);
      if (error.code === "P2003") return refuse({ error: "This coupon is tied to orders and cannot be deleted. Pause it instead." }, 409);
      if (error.code === "P2025") return refuse({ error: "That coupon no longer exists. Refresh the page." }, 404);
    }
    console.error("Coupon action failed", error);
    return refuse({ error: "Could not save the coupon. Please try again." }, 500);
  }
}
