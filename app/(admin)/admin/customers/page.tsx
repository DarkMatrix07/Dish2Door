import Link from "next/link";
import { Prisma } from "@prisma/client";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Pager, readPage } from "@/components/admin/Pager";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatIstDateTime } from "@/lib/ist-day";
import { SPIN_ORDERS_PER_REWARD } from "@/lib/spin-wheel";
import { formatPaise } from "@/lib/utils";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const SORTS = {
  spend: { label: "Top spenders", order: Prisma.sql`spent DESC, orders DESC, phone` },
  orders: { label: "Most orders", order: Prisma.sql`orders DESC, spent DESC, phone` },
  recent: { label: "Ordered recently", order: Prisma.sql`"lastOrderAt" DESC NULLS LAST, phone` },
  new: { label: "Newest customers", order: Prisma.sql`"firstSeenAt" DESC, phone` }
} as const;
type SortKey = keyof typeof SORTS;

type CustomerRow = {
  phone: string;
  name: string | null;
  email: string | null;
  spinBaseline: number;
  firstSeenAt: Date;
  orders: number;
  spent: number;
  reviewed: number;
  lastOrderAt: Date | null;
  rewardsActive: number;
  rewardsUsed: number;
};

type Totals = { customers: number; withOrders: number; repeat: number; spent: number; orders: number; reviewed: number };

// Escape LIKE wildcards so a search for "50%" matches that text literally.
function likePattern(search: string) {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export default async function CustomersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 80);
  const sort: SortKey = params.sort && params.sort in SORTS ? (params.sort as SortKey) : "spend";
  const page = readPage(params.page);

  // Everything is counted in the database over every customer. This page used to load
  // 300 customers in no particular order and total them in memory, so with more
  // customers than that the totals were short and "sorted by spend" missed people.
  // Only paid, non-cancelled orders count, the same revenue rule as Analytics.
  const where = search
    ? Prisma.sql`WHERE c.phone ILIKE ${likePattern(search)} OR c.name ILIKE ${likePattern(search)} OR c.email ILIKE ${likePattern(search)}`
    : Prisma.empty;
  const stats = Prisma.sql`
    SELECT c.phone, c.name, c.email, c."spinBaseline", c."firstSeenAt",
           COUNT(o.id)::int AS orders,
           COALESCE(SUM(o."totalPaise"), 0)::int AS spent,
           COUNT(r.id)::int AS reviewed,
           MAX(o."createdAt") AS "lastOrderAt"
    FROM "Customer" c
    LEFT JOIN "Order" o ON o."customerId" = c.phone
      AND o."paymentStatus" IN ('PAID_ONLINE', 'PAID_MANUALLY')
      AND o.status <> 'CANCELLED'
    LEFT JOIN "Rating" r ON r."orderId" = o.id
    ${where}
    GROUP BY c.phone`;

  const [rows, [totals]] = await Promise.all([
    prisma.$queryRaw<CustomerRow[]>`
      WITH stats AS (${stats})
      SELECT stats.*,
             (SELECT COUNT(*)::int FROM "SpinReward" s WHERE s.phone = stats.phone AND s."redeemedAt" IS NULL AND s."expiredAt" IS NULL) AS "rewardsActive",
             (SELECT COUNT(*)::int FROM "SpinReward" s WHERE s.phone = stats.phone AND s."redeemedAt" IS NOT NULL) AS "rewardsUsed"
      FROM stats
      ORDER BY ${SORTS[sort].order}
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    prisma.$queryRaw<Totals[]>`
      WITH stats AS (${stats})
      SELECT COUNT(*)::int AS customers,
             COUNT(*) FILTER (WHERE orders > 0)::int AS "withOrders",
             COUNT(*) FILTER (WHERE orders > 1)::int AS repeat,
             COALESCE(SUM(spent), 0)::float8 AS spent,
             COALESCE(SUM(orders), 0)::int AS orders,
             COALESCE(SUM(reviewed), 0)::int AS reviewed
      FROM stats`
  ]);

  const totalPages = Math.max(1, Math.ceil(totals.customers / PAGE_SIZE));
  const view = rows.map((row) => {
    // Progress in the current wheel cycle.
    const cycleReviews = Math.max(0, row.reviewed - row.spinBaseline);
    return {
      ...row,
      cycleReviews: Math.min(cycleReviews, SPIN_ORDERS_PER_REWARD),
      wheelReady: cycleReviews >= SPIN_ORDERS_PER_REWARD
    };
  });

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Customers"
        title="Customer directory"
        description="Every number that has ordered or spun, what they spent, and how close they are to their next reward."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={search ? "Matching customers" : "Customers"} value={totals.customers} helper={`${totals.withOrders} have a paid order`} />
        <StatCard label="Repeat customers" value={totals.repeat} helper={totals.withOrders ? `${((totals.repeat / totals.withOrders) * 100).toFixed(0)}% ordered more than once` : "—"} />
        <StatCard label="Lifetime revenue" value={formatPaise(totals.spent)} helper={`${totals.orders} paid orders`} />
        <StatCard label="Reviews given" value={totals.reviewed} helper={totals.orders ? `${((totals.reviewed / totals.orders) * 100).toFixed(1)}% of orders rated` : "—"} />
      </div>

      <SectionCard
        title="All customers"
        description={`${SORTS[sort].label}. Wheel progress counts only orders rated since the current cycle began.`}
        actions={
          <form className="flex w-full flex-wrap gap-2 sm:w-auto">
            <input
              name="q"
              defaultValue={search}
              placeholder="Search name, phone, email"
              className="h-9 w-full rounded-md border border-neutral-200 px-3 text-sm outline-none focus:border-neutral-400 sm:w-52"
            />
            <select
              name="sort"
              defaultValue={sort}
              aria-label="Sort customers"
              className="h-9 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none focus:border-neutral-400 sm:flex-none"
            >
              {(Object.keys(SORTS) as SortKey[]).map((key) => (
                <option key={key} value={key}>{SORTS[key].label}</option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-md bg-neutral-900 px-3 text-sm font-semibold text-white">Apply</button>
          </form>
        }
      >
        {view.length === 0 ? (
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
                  <th className="py-2 pr-3">Last order</th>
                  <th className="py-2 pr-3">Wheel progress</th>
                  <th className="py-2 text-right">Rewards</th>
                </tr>
              </thead>
              <tbody>
                {view.map((row) => (
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
                    <td className="py-2.5 pr-3 text-xs tabular-nums text-neutral-600">{row.lastOrderAt ? formatIstDateTime(new Date(row.lastOrderAt)) : "—"}</td>
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
                      {row.rewardsUsed || row.rewardsActive ? [row.rewardsUsed ? `${row.rewardsUsed} used` : null, row.rewardsActive ? `${row.rewardsActive} active` : null].filter(Boolean).join(" · ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          basePath="/admin/customers"
          params={{ q: search || undefined, sort: sort === "spend" ? undefined : sort }}
          page={page}
          totalPages={totalPages}
          total={totals.customers}
          shown={view.length}
          noun="customers"
        />
      </SectionCard>
    </PageContainer>
  );
}
