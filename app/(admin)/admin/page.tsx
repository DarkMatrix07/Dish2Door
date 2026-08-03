import Link from "next/link";
import { AdminActions } from "@/components/admin/AdminActions";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { CampusBadge, campusLabel } from "@/components/admin/CampusBadge";
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
    recentOrders,
    campuses,
    campusOrderCounts,
    campusConfirmed,
    campusReachedCampus,
    campusRevenue
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
    prisma.order.findMany({ include: orderInclude, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.campus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.order.groupBy({
      by: ["campusId"],
      _count: { id: true }
    }),
    prisma.order.groupBy({
      by: ["campusId"],
      where: { status: "ORDER_CONFIRMED" },
      _count: { id: true }
    }),
    prisma.order.groupBy({
      by: ["campusId"],
      where: { status: "REACHED_CAMPUS" },
      _count: { id: true }
    }),
    prisma.order.groupBy({
      by: ["campusId"],
      where: { paymentStatus: { in: ["PAID_ONLINE", "PAID_MANUALLY"] } },
      _sum: { totalPaise: true }
    })
  ]);

  const campusMap = new Map(campuses.map((c) => [c.id, c]));
  const ordersPerCampus = new Map(campusOrderCounts.map((c) => [c.campusId, c._count.id]));
  const confirmedPerCampus = new Map(campusConfirmed.map((c) => [c.campusId, c._count.id]));
  const reachedPerCampus = new Map(campusReachedCampus.map((c) => [c.campusId, c._count.id]));
  const revenuePerCampus = new Map(campusRevenue.map((c) => [c.campusId, c._sum.totalPaise ?? 0]));

  const allCampusIds = new Set<string | null>();
  campusOrderCounts.forEach((c) => allCampusIds.add(c.campusId));
  campusConfirmed.forEach((c) => allCampusIds.add(c.campusId));
  campusReachedCampus.forEach((c) => allCampusIds.add(c.campusId));
  campusRevenue.forEach((c) => allCampusIds.add(c.campusId));

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

      <div className="mt-6 grid gap-3 min-[430px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total orders" value={totalOrders} helper="All customer and manual orders" />
        <StatCard label="Confirmed" value={confirmed} helper="Waiting for campus arrival" />
        <StatCard label="Reached campus" value={reachedCampus} helper="Ready for gate or hostel flow" />
        <StatCard label="Paid revenue" value={formatPaise(revenue._sum.totalPaise ?? 0)} helper="Online + manual paid orders" />
      </div>

      <SectionCard
        title="Orders by campus"
        description="Breakdown across locations: total orders, confirmed, reached campus, and paid revenue."
      >
        <div className="space-y-4">
          {Array.from(allCampusIds).map((campusId) => {
            const campus = campusId ? campusMap.get(campusId) : null;
            const orders = ordersPerCampus.get(campusId) ?? 0;
            const conf = confirmedPerCampus.get(campusId) ?? 0;
            const reached = reachedPerCampus.get(campusId) ?? 0;
            const rev = revenuePerCampus.get(campusId) ?? 0;

            return (
              <div key={campusId || "unassigned"} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CampusBadge campus={campus} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-semibold text-neutral-500">Total orders</p>
                    <p className="mt-1 text-xl font-bold text-neutral-900">{orders}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-neutral-500">Confirmed</p>
                    <p className="mt-1 text-xl font-bold text-neutral-900">{conf}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-neutral-500">Reached campus</p>
                    <p className="mt-1 text-xl font-bold text-neutral-900">{reached}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-neutral-500">Paid revenue</p>
                    <p className="mt-1 text-xl font-bold text-neutral-900 tabular-nums">{formatPaise(rev)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {allCampusIds.size === 0 ? <p className="text-sm text-neutral-500">No orders yet.</p> : null}
        </div>
      </SectionCard>

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
              <div className="rounded-lg bg-[#f3f4f6] p-3 sm:p-4">
                <p className="text-2xl font-bold">{restaurants}</p>
                <p className="text-xs text-neutral-500">Active</p>
              </div>
              <div className="rounded-lg bg-[#f3f4f6] p-3 sm:p-4">
                <p className="text-2xl font-bold">{activeItems}</p>
                <p className="text-xs text-neutral-500">Items live</p>
              </div>
              <div className="rounded-lg bg-[#f3f4f6] p-3 sm:p-4">
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
