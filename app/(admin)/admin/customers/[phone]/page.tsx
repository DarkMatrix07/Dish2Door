import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatus, PaymentStatus, SpinOutcome } from "@prisma/client";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatIstDateTime } from "@/lib/ist-day";
import { SPIN_ORDERS_PER_REWARD } from "@/lib/spin-wheel";
import { formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAID_STATUSES: PaymentStatus[] = [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY];

export default async function CustomerDetailPage({ params }: { params: Promise<{ phone: string }> }) {
  const { phone } = await params;

  const customer = await prisma.customer.findUnique({
    where: { phone },
    include: {
      orders: {
        include: {
          restaurant: { select: { name: true } },
          items: { select: { nameSnapshot: true, quantity: true, linePaise: true } },
          rating: { select: { foodRating: true, deliveryRating: true, review: true, createdAt: true } }
        },
        orderBy: { createdAt: "desc" }
      },
      rewards: {
        include: { order: { select: { trackingCode: true, couponDiscountPaise: true } } },
        orderBy: { createdAt: "desc" }
      },
      spins: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!customer) notFound();

  const paidOrders = customer.orders.filter(
    (order) => PAID_STATUSES.includes(order.paymentStatus) && order.status !== OrderStatus.CANCELLED
  );
  const spent = paidOrders.reduce((sum, order) => sum + order.totalPaise, 0);
  const reviewed = paidOrders.filter((order) => order.rating).length;
  const discountReceived = paidOrders.reduce((sum, order) => sum + order.couponDiscountPaise, 0);
  const cycleReviews = Math.max(0, reviewed - customer.spinBaseline);

  // What they order most, across all paid orders.
  const itemCounts = new Map<string, { qty: number; spend: number }>();
  for (const order of paidOrders) {
    for (const item of order.items) {
      const entry = itemCounts.get(item.nameSnapshot) ?? { qty: 0, spend: 0 };
      entry.qty += item.quantity;
      entry.spend += item.linePaise;
      itemCounts.set(item.nameSnapshot, entry);
    }
  }
  const favourites = [...itemCounts.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 8);

  return (
    <PageContainer>
      <Link href="/admin/customers" className="text-sm font-semibold text-neutral-500 hover:underline">
        ← All customers
      </Link>
      <AdminPageHeader
        eyebrow="Customer"
        title={customer.name ?? customer.phone}
        description={`${customer.phone}${customer.email ? ` · ${customer.email}` : ""} · first seen ${formatIstDateTime(customer.firstSeenAt)}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Paid orders" value={paidOrders.length} helper={`${customer.orders.length} total incl. cancelled`} />
        <StatCard label="Lifetime spend" value={formatPaise(spent)} helper={paidOrders.length ? `Avg ${formatPaise(Math.round(spent / paidOrders.length))}` : "—"} />
        <StatCard label="Reviews given" value={reviewed} helper={paidOrders.length ? `${((reviewed / paidOrders.length) * 100).toFixed(0)}% of orders rated` : "—"} />
        <StatCard label="Discount received" value={formatPaise(discountReceived)} helper={`${customer.rewards.length} wheel rewards won`} />
      </div>

      <SectionCard title="Wheel status" description="Progress towards the next spin in the current cycle.">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex gap-1.5">
            {Array.from({ length: SPIN_ORDERS_PER_REWARD }).map((_, step) => (
              <span key={step} className={`h-2.5 w-14 rounded-full ${step < cycleReviews ? "bg-amber-400" : "bg-neutral-200"}`} />
            ))}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {Math.min(cycleReviews, SPIN_ORDERS_PER_REWARD)} of {SPIN_ORDERS_PER_REWARD} reviews this cycle
          </span>
          {cycleReviews >= SPIN_ORDERS_PER_REWARD ? <Badge tone="green">Spin ready</Badge> : null}
          <span className="text-xs text-neutral-500">
            {reviewed} reviews all time · counter rebased at {customer.spinBaseline}
          </span>
        </div>
      </SectionCard>

      <SectionCard title="Wheel rewards" description="Every spin this number has won and whether it was spent.">
        {customer.rewards.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No rewards won yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Won</th>
                  <th className="py-2 pr-3">Coupon</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Used on</th>
                  <th className="py-2 pr-3 text-right">Discount</th>
                  <th className="py-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {customer.rewards.map((reward) => (
                  <tr key={reward.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2.5 pr-3 font-black tabular-nums">{reward.discountPercent}%</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{reward.couponCode}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={reward.redeemedAt ? "green" : reward.expiredAt ? "neutral" : "amber"}>
                        {reward.redeemedAt ? "Redeemed" : reward.expiredAt ? "Expired" : "Live"}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-neutral-600">{reward.order?.trackingCode ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {reward.order?.couponDiscountPaise ? formatPaise(reward.order.couponDiscountPaise) : "—"}
                    </td>
                    <td className="py-2.5 text-right text-xs text-neutral-500">{formatIstDateTime(reward.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Favourite items" description="Most ordered, by quantity.">
          {favourites.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">No paid orders yet.</p>
          ) : (
            <div className="space-y-2">
              {favourites.map(([name, value]) => (
                <div key={name} className="flex items-center justify-between border-b border-neutral-100 pb-2 text-sm last:border-0">
                  <span className="truncate pr-3">{name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-neutral-600">×{value.qty} · {formatPaise(value.spend)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Spin history" description="Daily wheel decisions, including days they gave it up.">
          {customer.spins.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">No spins recorded.</p>
          ) : (
            <div className="space-y-2">
              {customer.spins.map((spin) => (
                <div key={spin.id} className="flex items-center justify-between border-b border-neutral-100 pb-2 text-sm last:border-0">
                  <span className="tabular-nums">{spin.spinDay}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={spin.outcome === SpinOutcome.SPUN ? "green" : "neutral"}>
                      {spin.outcome === SpinOutcome.SPUN ? "Spun" : "Gave up"}
                    </Badge>
                    <span className="text-xs text-neutral-500">{spin.mode === "EVERYONE" ? "Promo" : "Loyalty"}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Order history" description="Every order placed by this number.">
        {customer.orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Items</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Rating</th>
                  <th className="py-2 pr-3 text-right">Discount</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {customer.orders.map((order) => (
                  <tr key={order.id} className="border-b border-neutral-100 last:border-0 align-top">
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-xs font-bold">{order.trackingCode}</span>
                      <span className="block text-xs text-neutral-500">{order.restaurant.name}</span>
                      <span className="block text-xs text-neutral-400">{formatIstDateTime(order.createdAt)}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-neutral-600">
                      {order.items.map((item) => `${item.nameSnapshot} ×${item.quantity}`).join(", ")}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={order.status === OrderStatus.CANCELLED ? "red" : order.status === OrderStatus.DELIVERED ? "green" : "amber"}>
                        {order.status.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {order.rating ? (
                        <>
                          <span className="font-semibold">food {order.rating.foodRating}★ · delivery {order.rating.deliveryRating}★</span>
                          {order.rating.review ? <span className="block text-neutral-500">“{order.rating.review}”</span> : null}
                        </>
                      ) : (
                        <span className="text-neutral-400">Not rated</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-emerald-700">
                      {order.couponDiscountPaise ? `-${formatPaise(order.couponDiscountPaise)}` : "—"}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{formatPaise(order.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );
}
