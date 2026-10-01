import { prisma } from "@/lib/db";
import type { CouponRow } from "@/lib/coupon-admin";

type CouponRecord = {
  id: string;
  code: string;
  description: string | null;
  discountPercent: number;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  heldCount: number;
  expiresAt: Date | null;
  createdAt: Date;
};

export function toCouponRow(coupon: CouponRecord, orderCount: number): CouponRow {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    discountPercent: coupon.discountPercent,
    active: coupon.active,
    maxUses: coupon.maxUses,
    usedCount: coupon.usedCount,
    heldCount: coupon.heldCount,
    expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
    createdAt: coupon.createdAt.toISOString(),
    orderCount
  };
}

export async function countOrdersByCode(codes: string[]) {
  if (!codes.length) return new Map<string, number>();
  const groups = await prisma.order.groupBy({
    by: ["couponCode"],
    where: { couponCode: { in: codes } },
    _count: { _all: true }
  });
  return new Map(groups.map((group) => [group.couponCode, group._count._all]));
}

// Coupons the owner made. A wheel prize is any coupon some spin reward points at, so the
// split is done in the database instead of loading every reward into memory.
export async function loadOwnerCoupons(limit = 500): Promise<CouponRow[]> {
  const ids = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c.id FROM "Coupon" c
    WHERE NOT EXISTS (SELECT 1 FROM "SpinReward" s WHERE s."couponCode" = c.code)
    ORDER BY c."createdAt" DESC
    LIMIT ${limit}`;
  if (!ids.length) return [];
  const coupons = await prisma.coupon.findMany({
    where: { id: { in: ids.map((row) => row.id) } },
    orderBy: { createdAt: "desc" }
  });
  const orderCounts = await countOrdersByCode(coupons.map((coupon) => coupon.code));
  return coupons.map((coupon) => toCouponRow(coupon, orderCounts.get(coupon.code) ?? 0));
}
