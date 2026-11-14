import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaTodaysOrders } from "@/components/admin/PizzaTodaysOrders";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { istTodayRange } from "@/lib/ist-day";
import { GROCERIES_SLUG } from "@/lib/whatsapp-shops";

export const dynamic = "force-dynamic";

export default async function GroceriesTodaysOrdersPage() {
  await requireRole(["ADMIN"]);
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: GROCERIES_SLUG }, select: { id: true, name: true } });
  if (!restaurant) notFound();

  const { start, end, label } = istTodayRange();

  const orders = await prisma.order.findMany({
    where: {
      restaurantId: restaurant.id,
      createdAt: { gte: start, lt: end },
      status: { notIn: ["CANCELLED", "AWAITING_CONFIRMATION"] }
    },
    include: {
      campus: { select: { id: true, code: true, name: true, sortOrder: true } },
      items: { select: { id: true, nameSnapshot: true, quantity: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  const plain = orders.map((order) => ({
    id: order.id,
    trackingCode: order.trackingCode,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryType: order.deliveryType,
    hostelBlock: order.hostelBlock,
    orderSlot: order.orderSlot,
    status: order.status,
    totalPaise: order.totalPaise,
    createdAt: order.createdAt.toISOString(),
    campus: order.campus,
    items: order.items
  }));

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Snacks"
        title="Today's orders"
        description={`Confirmed orders for ${restaurant.name} on ${label}, grouped by delivery slot.`}
      />
      <PizzaTodaysOrders orders={plain} dateLabel={label} restaurantName={restaurant.name} />
    </PageContainer>
  );
}
