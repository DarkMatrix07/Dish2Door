import Link from "next/link";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { SPIN_ORDERS_PER_REWARD } from "@/lib/spin-wheel";
import { formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAID = { in: [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY] };

export default async function CustomersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = (q ?? "").trim();

  const customers = await prisma.customer.findMany({
    where: search
      ? {
          OR: [
            { phone: { contains: search } },
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } }
          ]
        }
      : undefined,
    include: {
      orders: {
        where: { paymentStatus: PAID, status: { not: OrderStatus.CANCELLED } },
        select: { totalPaise: true, createdAt: true, rating: { select: { id: true } } }
      },
      rewards: { select: { id: true, redeemedAt: true } }
    },
    take: 300
  });

  // Counts are derived from orders rather than stored, so they can never go stale.
  const rows = customers
    .map((customer) => {
      const orders = customer.orders.length;
      const reviewed = customer.orders.filter((order) => order.rating).length;
      const spent = customer.orders.reduce((sum, order) => sum + order.totalPaise, 0);
      const lastOrderAt = customer.orders.reduce<Date | null>(
        (latest, order) => (!latest || order.createdAt > latest ? order.createdAt : latest),
        null
      );
      // Progress in the current wheel cycle.
      const cycleReviews = Math.max(0, reviewed - customer.spinBaseline);
      return {
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        orders,
        reviewed,
        spent,
        lastOrderAt,
        cycleReviews: Math.min(cycleReviews, SPIN_ORDERS_PER_REWARD),
        wheelReady: cycleReviews >= SPIN_ORDERS_PER_REWARD,
        rewardsWon: customer.rewards.length,
        rewardsUsed: customer.rewards.filter((reward) => reward.redeemedAt).length
      };
    })
    .sort((a, b) => b.spent - a.spent);

  const withOrders = rows.filter((row) => row.orders > 0);
  const totalSpent = withOrders.reduce((sum, row) => sum + row.spent, 0);
  const totalReviews = rows.reduce((sum, row) => sum + row.reviewed, 0);
  const totalOrders = rows.reduce((sum, row) => sum + row.orders, 0);
  const repeatCustomers = withOrders.filter((row) => row.orders > 1).length;

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Customers"
        title="Customer directory"
        description="Every number that has ordered or spun, what they spent, and how close they are to their next reward."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Customers" value={rows.length} helper={`${withOrders.length} have ordered`} />
        <StatCard label="Repeat customers" value={repeatCustomers} helper={withOrders.length ? `${((repeatCustomers / withOrders.length) * 100).toFixed(0)}% ordered more than once` : "—"} />
        <StatCard label="Lifetime revenue" value={formatPaise(totalSpent)} helper={`${totalOrders} paid orders`} />
        <StatCard label="Reviews given" value={totalReviews} helper={totalOrders ? `${((totalReviews / totalOrders) * 100).toFixed(1)}% of orders rated` : "—"} />
      </div>

      <SectionCard
        title="All customers"
        description="Sorted by lifetime spend. Wheel progress counts only orders rated since the current cycle began."
        actions={
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={search}
              placeholder="Search name, phone, email"
              className="h-9 w-52 rounded-md border border-neutral-200 px-3 text-sm outline-none focus:border-neutral-400"
            />
            <button type="submit" className="h-9 rounded-md bg-neutral-900 px-3 text-sm font-semibold text-white">Search</button>
          </form>
        }
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No customers match that search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3 text-right">Orders</th>
                  <th className="py-2 pr-3 text-right">Spent</th>
                  <th className="py-2 pr-3 text-right">Reviews</th>
                  <th className="py-2 pr-3">Wheel progress</th>
                  <th className="py-2 text-right">Rewards</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.phone} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link href={`/admin/customers/${row.phone}`} className="font-semibold text-neutral-900 hover:underline">
                        {row.name ?? "Unknown"}
                      </Link>
                      <span className="block text-xs tabular-nums text-neutral-500">
                        {row.phone}
                        {row.email ? ` · ${row.email}` : ""}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.orders}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatPaise(row.spent)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.reviewed}</td>
                    <td className="py-2.5 pr-3">
                      {row.wheelReady ? (
                        <Badge tone="green">Spin ready</Badge>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="flex gap-1">
                            {Array.from({ length: SPIN_ORDERS_PER_REWARD }).map((_, step) => (
                              <span
                                key={step}
                                className={`h-1.5 w-6 rounded-full ${step < row.cycleReviews ? "bg-amber-400" : "bg-neutral-200"}`}
                              />
                            ))}
                          </span>
                          <span className="text-xs tabular-nums text-neutral-500">
                            {row.cycleReviews}/{SPIN_ORDERS_PER_REWARD}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-xs tabular-nums text-neutral-600">
                      {row.rewardsWon ? `${row.rewardsWon} won · ${row.rewardsUsed} used` : "—"}
                    </td>
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
