import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaOrdersQueue } from "@/components/admin/PizzaOrdersQueue";
import { prisma } from "@/lib/db";
import { cleanupStaleWhatsAppOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

const RESTAURANT_SLUG = "dominos-pizza";

export default async function PizzaOrdersPage() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: RESTAURANT_SLUG }, select: { id: true, name: true } });
  if (!restaurant) notFound();

  // Drop orders the customer started but never sent on WhatsApp before listing the
  // queue, so the admin only ever sees messages that could still be waiting.
  await cleanupStaleWhatsAppOrders().catch(() => null);

  const orders = await prisma.order.findMany({
    where: { restaurantId: restaurant.id, status: "AWAITING_CONFIRMATION" },
    include: {
      campus: { select: { id: true, code: true, name: true, sortOrder: true } },
      items: { select: { id: true, nameSnapshot: true, quantity: true, pricePaise: true, linePaise: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  const plain = orders.map((order) => ({
    id: order.id,
    trackingCode: order.trackingCode,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryType: order.deliveryType,
    hostelBlock: order.hostelBlock,
    orderSlot: order.orderSlot,
    subtotalPaise: order.subtotalPaise,
    platformFeePaise: order.platformFeePaise,
    hostelFeePaise: order.hostelFeePaise,
    taxPaise: order.taxPaise,
    couponDiscountPaise: order.couponDiscountPaise,
    totalPaise: order.totalPaise,
    createdAt: order.createdAt.toISOString(),
    campus: order.campus,
    items: order.items
  }));

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Domino's Pizza"
        title="Orders generated"
        description={`Orders sent over WhatsApp for ${restaurant.name}, waiting for confirmation. Confirm to move an order into the normal pipeline, or reject to cancel it.`}
      />
      <PizzaOrdersQueue orders={plain} />
    </PageContainer>
  );
}
