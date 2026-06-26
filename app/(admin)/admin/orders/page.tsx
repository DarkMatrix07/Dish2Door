import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminOrdersPage() {
  const [orders, total, restaurants, sessions] = await Promise.all([
    prisma.order.findMany({ include: orderInclude, orderBy: { createdAt: "desc" }, take: PAGE_SIZE }),
    prisma.order.count(),
    prisma.restaurant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.orderSession.findMany({ select: { id: true, label: true }, orderBy: { startsAt: "desc" }, take: 60 })
  ]);

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Fulfilment"
        title="Live orders"
        description="Search and filter orders, manage each order's status, and trigger campus or delivery actions."
      />
      <OrdersTable
        initialOrders={orders}
        initialTotal={total}
        pageSize={PAGE_SIZE}
        restaurants={restaurants}
        sessions={sessions}
      />
    </PageContainer>
  );
}
