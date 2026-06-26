import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const [orders, restaurants] = await Promise.all([
    prisma.order.findMany({ include: orderInclude, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.restaurant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
  ]);

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Fulfilment"
        title="Live orders"
        description="Filter live orders, see customer contact details, and trigger campus or delivery actions."
      />
      <OrdersTable initialOrders={orders} restaurants={restaurants} />
    </PageContainer>
  );
}
