import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { TodaysOrders } from "@/components/admin/TodaysOrders";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { istTodayRange } from "@/lib/ist-day";
import { FULFILLABLE_PAYMENT_STATUSES } from "@/lib/order-filters";

export const dynamic = "force-dynamic";

export default async function TodaysOrdersPage() {
  await requireRole(["ADMIN"]);
  const { start, end, label } = istTodayRange();

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      status: { notIn: ["CANCELLED", "AWAITING_CONFIRMATION"] },
      // Exclude abandoned unpaid online checkouts; keep paid + manual orders.
      paymentStatus: { in: FULFILLABLE_PAYMENT_STATUSES }
    },
    include: {
      restaurant: { select: { name: true } },
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
    paymentStatus: order.paymentStatus,
    totalPaise: order.totalPaise,
    createdAt: order.createdAt.toISOString(),
    restaurant: order.restaurant,
    campus: order.campus,
    items: order.items
  }));

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Orders"
        title="Today's orders"
        description={`Orders for ${label}, grouped by campus, delivery slot, and restaurant.`}
      />
      <TodaysOrders orders={plain} dateLabel={label} />
    </PageContainer>
  );
}
