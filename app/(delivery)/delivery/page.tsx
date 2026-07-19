import { DeliveryType, OrderStatus } from "@prisma/client";
import { DeliveryDashboard } from "@/components/delivery/DeliveryDashboard";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const user = await getCurrentUser();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  const [orders, deliveredToday, deliveredThisWeek, deliveredTotal] = await Promise.all([
    prisma.order.findMany({
      where: {
        deliveryType: DeliveryType.HOSTEL,
        hostelBlock: { in: user?.assignedHostelBlocks ?? [] },
        deliveryReleased: true,
        status: { in: [OrderStatus.ORDER_CONFIRMED, OrderStatus.REACHED_CAMPUS] }
      },
      include: orderInclude,
      orderBy: { releasedAt: "asc" }
    }),
    prisma.order.count({
      where: {
        deliveredById: user?.id,
        deliveredAt: { gte: startOfToday }
      }
    }),
    prisma.order.count({
      where: {
        deliveredById: user?.id,
        deliveredAt: { gte: startOfWeek }
      }
    }),
    prisma.order.count({ where: { deliveredById: user?.id } })
  ]);

  return <DeliveryDashboard initialOrders={orders} assignedHostelBlocks={user?.assignedHostelBlocks ?? []} stats={{ deliveredToday, deliveredThisWeek, deliveredTotal, pending: orders.length }} />;
}
