import Link from "next/link";
import { AdminActions } from "@/components/admin/AdminActions";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";
import { getSettings } from "@/lib/settings";
import { formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [
    settings,
    totalOrders,
    confirmed,
    reachedCampus,
    hostelPending,
    delivered,
    revenue,
    restaurants,
    activeItems,
    outOfStock,
    recentOrders
  ] = await Promise.all([
    getSettings(),
    prisma.order.count(),
    prisma.order.count({ where: { status: "ORDER_CONFIRMED" } }),
    prisma.order.count({ where: { status: "REACHED_CAMPUS" } }),
    prisma.order.count({ where: { deliveryType: "HOSTEL", deliveryReleased: true, status: "REACHED_CAMPUS" } }),
    prisma.order.count({ where: { status: "DELIVERED" } }),
    prisma.order.aggregate({ _sum: { totalPaise: true }, where: { paymentStatus: { in: ["PAID_ONLINE", "PAID_MANUALLY"] } } }),
    prisma.restaurant.count({ where: { active: true } }),
    prisma.menuItem.count({ where: { available: true, restaurant: { active: true } } }),
    prisma.menuItem.count({ where: { available: false } }),
    prisma.order.findMany({ include: orderInclude, orderBy: { createdAt: "desc" }, take: 6 })
  ]);

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="Control public ordering, campus arrival, delivery release, revenue, and menu availability from one place."
      >
        <Badge tone={settings.ordersOpen ? "green" : "red"}>{settings.ordersOpen ? "Orders open" : "Orders closed"}</Badge>
      </AdminPageHeader>

      <SectionCard
        title="Quick actions"
        description="Open or close ordering, mark active orders as reached campus, and release hostel deliveries."
      >
        <AdminActions ordersOpen={settings.ordersOpen} />
      </SectionCard>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total orders" value={totalOrders} helper="All customer and manual orders" />
        <StatCard label="Confirmed" value={confirmed} helper="Waiting for campus arrival" />
        <StatCard label="Reached campus" value={reachedCampus} helper="Ready for gate or hostel flow" />
        <StatCard label="Paid revenue" value={formatPaise(revenue._sum.totalPaise ?? 0)} helper="Online + manual paid orders" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
        <SectionCard title="Latest orders" description="Recent customer and counter orders." bodyClassName="p-0">
          <div className="divide-y divide-neutral-100">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{order.customerName}</p>
                    <Badge>{order.trackingCode}</Badge>
                    <Badge tone={order.status === "DELIVERED" ? "green" : order.status === "REACHED_CAMPUS" ? "amber" : "neutral"}>
                      {order.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {order.restaurant.name} · {order.customerPhone} · {order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Gate"}
                  </p>
                  <p className="mt-1 line-clamp-1 text-sm text-neutral-600">
                    {order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold">{formatPaise(order.totalPaise)}</p>
              </div>
            ))}
            {!recentOrders.length ? <div className="p-8 text-center text-neutral-500">No orders yet.</div> : null}
          </div>
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="Restaurant health">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-neutral-50 p-4">
                <p className="text-2xl font-bold">{restaurants}</p>
                <p className="text-xs text-neutral-500">Active</p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-4">
                <p className="text-2xl font-bold">{activeItems}</p>
                <p className="text-xs text-neutral-500">Items live</p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-4">
                <p className="text-2xl font-bold">{outOfStock}</p>
                <p className="text-xs text-neutral-500">Out</p>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Delivery snapshot">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm">
                <span className="text-neutral-600">Hostel pending</span>
                <strong className="text-neutral-900">{hostelPending}</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm">
                <span className="text-neutral-600">Delivered total</span>
                <strong className="text-neutral-900">{delivered}</strong>
              </div>
            </div>
          </SectionCard>
          <Link
            href="/admin/orders/new"
            className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-center text-sm font-semibold text-neutral-600 transition hover:border-neutral-400 hover:bg-neutral-50"
          >
            + Create a manual counter order
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
