import { OrderStatus, PaymentStatus } from "@prisma/client";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { prisma } from "@/lib/db";
import { formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDayKey(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function istDayStartUtc(daysAgo: number) {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate() - daysAgo;
  return new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);
}

// Paid, non-cancelled orders count as revenue.
const PAID_WHERE = {
  paymentStatus: { in: [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY] },
  status: { not: OrderStatus.CANCELLED }
};

export default async function AnalyticsPage() {
  const todayStart = istDayStartUtc(0);
  const last7Start = istDayStartUtc(6);
  const last30Start = istDayStartUtc(29);

  const [allTime, orders] = await Promise.all([
    prisma.order.aggregate({ where: PAID_WHERE, _sum: { totalPaise: true }, _count: true }),
    prisma.order.findMany({
      where: { ...PAID_WHERE, createdAt: { gte: last30Start } },
      select: {
        totalPaise: true,
        createdAt: true,
        orderSlot: true,
        restaurant: { select: { name: true } },
        items: { select: { nameSnapshot: true, quantity: true, linePaise: true } }
      }
    })
  ]);

  const allTimeRevenue = allTime._sum.totalPaise ?? 0;
  const allTimeOrders = allTime._count;
  const avgOrder = allTimeOrders ? Math.round(allTimeRevenue / allTimeOrders) : 0;

  let revenueToday = 0;
  let ordersToday = 0;
  let revenue7 = 0;
  let orders7 = 0;
  const dayMap = new Map<string, { revenue: number; orders: number }>();
  const restaurantMap = new Map<string, { revenue: number; orders: number }>();
  const slotMap = { AFTERNOON: { revenue: 0, orders: 0 }, NIGHT: { revenue: 0, orders: 0 } };
  const itemMap = new Map<string, { qty: number; revenue: number }>();

  for (const order of orders) {
    if (order.createdAt >= todayStart) {
      revenueToday += order.totalPaise;
      ordersToday += 1;
    }
    if (order.createdAt >= last7Start) {
      revenue7 += order.totalPaise;
      orders7 += 1;
    }

    const dayKey = istDayKey(order.createdAt);
    const day = dayMap.get(dayKey) ?? { revenue: 0, orders: 0 };
    day.revenue += order.totalPaise;
    day.orders += 1;
    dayMap.set(dayKey, day);

    const rName = order.restaurant.name;
    const r = restaurantMap.get(rName) ?? { revenue: 0, orders: 0 };
    r.revenue += order.totalPaise;
    r.orders += 1;
    restaurantMap.set(rName, r);

    if (order.orderSlot === "AFTERNOON" || order.orderSlot === "NIGHT") {
      slotMap[order.orderSlot].revenue += order.totalPaise;
      slotMap[order.orderSlot].orders += 1;
    }

    for (const item of order.items) {
      const it = itemMap.get(item.nameSnapshot) ?? { qty: 0, revenue: 0 };
      it.qty += item.quantity;
      it.revenue += item.linePaise;
      itemMap.set(item.nameSnapshot, it);
    }
  }

  // Last 14 days trend (oldest -> newest).
  const days: { key: string; label: string; revenue: number; orders: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = istDayStartUtc(i);
    const key = istDayKey(start);
    const entry = dayMap.get(key) ?? { revenue: 0, orders: 0 };
    days.push({ key, label: key.slice(5), revenue: entry.revenue, orders: entry.orders });
  }
  const maxDayRevenue = Math.max(1, ...days.map((d) => d.revenue));

  const byRestaurant = [...restaurantMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
  const maxRestaurantRevenue = Math.max(1, ...byRestaurant.map((r) => r.revenue));

  const topItems = [...itemMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  return (
    <PageContainer>
      <AdminPageHeader eyebrow="Insights" title="Analytics" description="Revenue and order trends. Paid orders only; last 30 days for the breakdowns." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Revenue (all time)" value={formatPaise(allTimeRevenue)} helper={`${allTimeOrders} orders`} />
        <StatCard label="Avg order value" value={formatPaise(avgOrder)} />
        <StatCard label="Revenue today" value={formatPaise(revenueToday)} helper={`${ordersToday} orders`} />
        <StatCard label="Revenue last 7 days" value={formatPaise(revenue7)} helper={`${orders7} orders`} />
      </div>

      <SectionCard title="Revenue — last 14 days" description="Paid orders per day (IST)." bodyClassName="p-4 sm:p-6">
        <div className="flex h-48 items-end gap-1.5 sm:gap-2">
          {days.map((day) => (
            <div key={day.key} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-amber-400 transition-all"
                  style={{ height: `${Math.max(2, Math.round((day.revenue / maxDayRevenue) * 100))}%` }}
                  title={`${day.label}: ${formatPaise(day.revenue)} · ${day.orders} orders`}
                />
              </div>
              <span className="text-[10px] tabular-nums text-neutral-400">{day.label}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Revenue by restaurant" description="Last 30 days.">
          <div className="space-y-3">
            {byRestaurant.map((r) => (
              <div key={r.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-neutral-800">{r.name}</span>
                  <span className="tabular-nums text-neutral-600">{formatPaise(r.revenue)} · {r.orders}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-neutral-100">
                  <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.round((r.revenue / maxRestaurantRevenue) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!byRestaurant.length ? <p className="text-sm text-neutral-500">No paid orders in the last 30 days.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="By delivery slot" description="Last 30 days.">
          <div className="grid grid-cols-2 gap-4">
            {(["AFTERNOON", "NIGHT"] as const).map((slot) => (
              <div key={slot} className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="text-sm font-semibold text-neutral-500">{slot === "AFTERNOON" ? "Afternoon" : "Night"}</p>
                <p className="mt-2 text-2xl font-black text-neutral-950">{formatPaise(slotMap[slot].revenue)}</p>
                <p className="mt-1 text-xs text-neutral-500">{slotMap[slot].orders} orders</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Top items" description="Most-ordered dishes in the last 30 days." bodyClassName="p-0">
        <div className="divide-y divide-neutral-100">
          {topItems.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 text-sm font-black text-neutral-400">{index + 1}</span>
                <span className="truncate font-semibold text-neutral-800">{item.name}</span>
              </div>
              <div className="shrink-0 text-right text-sm">
                <span className="font-black text-neutral-950">{item.qty} sold</span>
                <span className="ml-3 tabular-nums text-neutral-500">{formatPaise(item.revenue)}</span>
              </div>
            </div>
          ))}
          {!topItems.length ? <p className="p-6 text-center text-sm text-neutral-500">No items sold in the last 30 days.</p> : null}
        </div>
      </SectionCard>
    </PageContainer>
  );
}
