import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaTodaysOrders } from "@/components/admin/PizzaTodaysOrders";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RESTAURANT_SLUG = "dominos-pizza";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Start/end of "today" in IST, expressed as UTC instants for the createdAt filter.
// Copied from app/(admin)/admin/orders/today/page.tsx rather than shared, per instructions.
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

export default async function PizzaTodaysOrdersPage() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: RESTAURANT_SLUG }, select: { id: true, name: true } });
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
        eyebrow="Domino's Pizza"
        title="Today's orders"
        description={`Confirmed orders for ${restaurant.name} on ${label}, grouped by delivery slot.`}
      />
      <PizzaTodaysOrders orders={plain} dateLabel={label} restaurantName={restaurant.name} />
    </PageContainer>
  );
}
