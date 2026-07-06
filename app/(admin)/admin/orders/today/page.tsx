import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { TodaysOrders } from "@/components/admin/TodaysOrders";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Start/end of "today" in IST, expressed as UTC instants for the createdAt filter.
function istTodayRange() {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();
  const start = new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, d + 1) - IST_OFFSET_MS);
  const label = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m, d))
  );
  return { start, end, label };
}

export default async function TodaysOrdersPage() {
  const { start, end, label } = istTodayRange();

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      status: { not: "CANCELLED" },
      // Exclude abandoned unpaid online checkouts; keep paid + manual orders.
      paymentStatus: { in: ["PAID_ONLINE", "PAID_MANUALLY", "UNPAID"] }
    },
    include: {
      restaurant: { select: { name: true } },
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
    items: order.items
  }));

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Orders"
        title="Today's orders"
        description={`Orders for ${label}, grouped by delivery slot and restaurant.`}
      />
      <TodaysOrders orders={plain} dateLabel={label} />
    </PageContainer>
  );
}
