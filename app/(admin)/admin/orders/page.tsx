import { toAdminOrderView } from "@/lib/order-views";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";
import { requireRole } from "@/lib/auth";
import { REAL_ORDER_WHERE } from "@/lib/order-filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminOrdersPage() {
  await requireRole(["ADMIN"]);
  const [orders, total, restaurants, sessions, campuses] = await Promise.all([
    // Unconfirmed WhatsApp orders live on their own page until an admin accepts them,
    // and unpaid online checkouts are hidden unless the "Payment" filter asks for them.
    prisma.order.findMany({ where: REAL_ORDER_WHERE, include: orderInclude, orderBy: { createdAt: "desc" }, take: PAGE_SIZE }),
    prisma.order.count({ where: REAL_ORDER_WHERE }),
    prisma.restaurant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.orderSession.findMany({ select: { id: true, label: true }, orderBy: { startsAt: "desc" }, take: 60 }),
    prisma.campus.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } })
  ]);

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Fulfilment"
        title="Live orders"
        description="Search and filter orders, manage each order's status, and trigger campus or delivery actions."
      />
      <OrdersTable
        initialOrders={orders.map(toAdminOrderView)}
        initialTotal={total}
        pageSize={PAGE_SIZE}
        restaurants={restaurants}
        sessions={sessions}
        campuses={campuses}
      />
    </PageContainer>
  );
}
