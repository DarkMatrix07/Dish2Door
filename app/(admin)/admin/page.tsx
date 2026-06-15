import { AdminActions } from "@/components/admin/AdminActions";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    prisma.order.findMany({ include: orderInclude, orderBy: { createdAt: "desc" }, take: 5 })
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="Control public ordering, campus arrival, delivery release, revenue, and menu availability from one premium command view."
      >
        <Badge tone={settings.ordersOpen ? "green" : "red"}>{settings.ordersOpen ? "Orders open" : "Orders closed"}</Badge>
      </AdminPageHeader>

      <Card className="overflow-hidden border border-amber-200 bg-[#fffaf1] text-neutral-950 shadow-xl shadow-amber-900/5">
        <div className="grid gap-6 p-6 2xl:grid-cols-[1fr_520px] xl:p-8">
          <div>
            <p className="text-sm font-bold text-amber-700">Today&apos;s control panel</p>
            <h3 className="mt-3 text-3xl font-black tracking-tight">Move the entire campus flow with one tap.</h3>
            <p className="mt-3 max-w-2xl leading-7 text-neutral-600">
              Open or close ordering, mark all active paid/manual orders as reached campus, and release hostel deliveries without duplicate assignment.
            </p>
          </div>
          <AdminActions ordersOpen={settings.ordersOpen} />
        </div>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total orders", totalOrders, "All customer and manual orders"],
          ["Confirmed", confirmed, "Waiting for campus arrival"],
          ["Reached campus", reachedCampus, "Ready for gate or hostel flow"],
          ["Paid revenue", formatPaise(revenue._sum.totalPaise ?? 0), "Online and manual paid orders"]
        ].map(([label, value, helper]) => (
          <Card key={label} className="border-0 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-neutral-500">{label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
            <p className="mt-2 text-xs leading-5 text-neutral-400">{helper}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden border-0 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5">
            <h3 className="text-xl font-black">Latest orders</h3>
            <p className="mt-1 text-sm text-neutral-500">Quick scan of customer, phone, items, and current status.</p>
          </div>
          <div className="divide-y divide-neutral-100">
            {recentOrders.map((order) => (
              <div key={order.id} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black">{order.customerName}</p>
                    <Badge>{order.trackingCode}</Badge>
                    <Badge tone={order.status === "DELIVERED" ? "green" : order.status === "REACHED_CAMPUS" ? "amber" : "neutral"}>
                      {order.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {order.restaurant.name} - {order.customerPhone} - {order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Gate"}
                  </p>
                  <p className="mt-1 line-clamp-1 text-sm text-neutral-700">
                    {order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}
                  </p>
                </div>
                <p className="font-black">{formatPaise(order.totalPaise)}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="border-0 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-neutral-500">Restaurant health</p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-neutral-50 p-4"><p className="text-2xl font-black">{restaurants}</p><p className="text-xs text-neutral-500">Active</p></div>
              <div className="rounded-2xl bg-neutral-50 p-4"><p className="text-2xl font-black">{activeItems}</p><p className="text-xs text-neutral-500">Items live</p></div>
              <div className="rounded-2xl bg-neutral-50 p-4"><p className="text-2xl font-black">{outOfStock}</p><p className="text-xs text-neutral-500">Out</p></div>
            </div>
          </Card>
          <Card className="border-0 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-neutral-500">Delivery snapshot</p>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between rounded-2xl bg-amber-50 p-4"><span>Hostel pending</span><strong>{hostelPending}</strong></div>
              <div className="flex justify-between rounded-2xl bg-emerald-50 p-4"><span>Delivered total</span><strong>{delivered}</strong></div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
