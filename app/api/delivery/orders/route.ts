import { NextResponse } from "next/server";
import { DeliveryType, OrderStatus } from "@prisma/client";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";

export async function GET() {
  const user = await requireApiRole(["DELIVERY"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  const [orders, deliveredToday, deliveredThisWeek, deliveredTotal] = await Promise.all([
    prisma.order.findMany({
      where: {
        deliveryType: DeliveryType.HOSTEL,
        deliveryReleased: true,
        status: OrderStatus.REACHED_CAMPUS
      },
      include: orderInclude,
      orderBy: { releasedAt: "asc" }
    }),
    prisma.order.count({
      where: {
        deliveredById: user.id,
        deliveredAt: {
          gte: startOfToday
        }
      }
    }),
    prisma.order.count({
      where: {
        deliveredById: user.id,
        deliveredAt: {
          gte: startOfWeek
        }
      }
    }),
    prisma.order.count({
      where: { deliveredById: user.id }
    })
  ]);

  return NextResponse.json({ orders, stats: { deliveredToday, deliveredThisWeek, deliveredTotal, pending: orders.length } });
}
