import { AdminPageHeader } from "@/components/admin/AdminShell";
import { OrdersManager } from "@/components/admin/OrdersManager";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const [orders, restaurants] = await Promise.all([
    prisma.order.findMany({
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.restaurant.findMany({
      include: {
        courses: { orderBy: { sortOrder: "asc" } },
        menuItems: { orderBy: { name: "asc" } }
      },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader
        eyebrow="Fulfilment"
        title="Orders"
        description="Create manual orders, filter live orders, see customer contact details, and trigger campus or delivery actions."
      />
      <OrdersManager initialOrders={orders} restaurants={restaurants} />
    </section>
  );
}
