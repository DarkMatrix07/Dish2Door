import Link from "next/link";
import { Prisma } from "@prisma/client";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Pager, readPage } from "@/components/admin/Pager";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
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
const SORT_OPTIONS = (Object.keys(SORTS) as SortKey[]).map((key) => ({ value: key, label: SORTS[key].label }));

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

  // "Active" rewards only count prizes whose code can still be used, so a leftover one that has
  // run out does not show as a prize waiting.
  const [rows, [totals]] = await Promise.all([
    prisma.$queryRaw<CustomerRow[]>`
      WITH stats AS (${stats})
      SELECT stats.*,
             (SELECT COUNT(*)::int FROM "SpinReward" s JOIN "Coupon" cp ON cp.code = s."couponCode"
                WHERE s.phone = stats.phone AND s."redeemedAt" IS NULL AND s."expiredAt" IS NULL
                  AND cp.active AND (cp."expiresAt" IS NULL OR cp."expiresAt" > NOW())
                  AND (cp."maxUses" IS NULL OR cp."usedCount" < cp."maxUses")) AS "rewardsActive",
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
          <form className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-end">
            <label className="block sm:w-52">
              <span className="mb-1 block text-xs font-semibold text-neutral-500">Search</span>
              <input
                name="q"
                defaultValue={search}
                placeholder="Name, phone or email"
                className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-amber-200"
              />
            </label>
            <Dropdown name="sort" defaultValue={sort} label="Sort by" options={SORT_OPTIONS} className="sm:w-48" />
            <button type="submit" className="h-11 rounded-xl bg-neutral-900 px-5 text-sm font-semibold text-white sm:px-4">Apply</button>
          </form>
        }
      >
        {view.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No customers match that search.</p>
        ) : (
          <>
          {/* Phones get one card per customer: the seven-column table below needs 900px. */}
          <ul className="divide-y divide-neutral-100 md:hidden">
            {view.map((row) => (
              <li key={row.phone} className="py-3.5 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={`/admin/customers/${row.phone}`} className="min-w-0 break-words font-semibold text-neutral-900 hover:underline">
                    {row.name ?? "Unknown"}
                  </Link>
                  {row.rewardsActive > 0 ? <Badge tone="amber" className="px-2 py-0.5 text-[11px]">Prize waiting</Badge> : null}
                </div>
                <p className="mt-0.5 break-all text-xs tabular-nums text-neutral-500">
                  {row.phone}
                  {row.email ? ` · ${row.email}` : ""}
                </p>
                <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                  <div className="min-w-0 rounded-lg bg-neutral-50 px-1 py-2">
                    <dt className="text-xs font-medium text-neutral-500">Orders</dt>
                    <dd className="mt-0.5 font-bold tabular-nums">{row.orders}</dd>
                  </div>
                  <div className="min-w-0 rounded-lg bg-neutral-50 px-1 py-2">
                    <dt className="text-xs font-medium text-neutral-500">Spent</dt>
                    <dd className="mt-0.5 truncate font-bold tabular-nums">{formatPaise(row.spent)}</dd>
                  </div>
                  <div className="min-w-0 rounded-lg bg-neutral-50 px-1 py-2">
                    <dt className="text-xs font-medium text-neutral-500">Reviews</dt>
                    <dd className="mt-0.5 font-bold tabular-nums">{row.reviewed}</dd>
                  </div>
                </dl>
                <dl className="mt-2.5 space-y-1 text-xs text-neutral-600">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <dt className="text-neutral-500">Last order</dt>
                    <dd className="tabular-nums">{row.lastOrderAt ? formatIstDateTime(new Date(row.lastOrderAt)) : "—"}</dd>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <dt className="text-neutral-500">Wheel progress</dt>
                    <dd><WheelProgress ready={row.wheelReady} done={row.cycleReviews} /></dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <dt className="text-neutral-500">Rewards</dt>
                    <dd className="tabular-nums">{rewardsText(row)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
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
                      {row.rewardsActive > 0 ? <Badge tone="amber" className="ml-2 px-2 py-0.5 align-middle text-[11px]">Prize waiting</Badge> : null}
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
                      <WheelProgress ready={row.wheelReady} done={row.cycleReviews} />
                    </td>
                    <td className="py-2.5 text-right text-xs tabular-nums text-neutral-600">
                      {rewardsText(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
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

function rewardsText(row: { rewardsUsed: number; rewardsActive: number }) {
  if (!row.rewardsUsed && !row.rewardsActive) return "—";
  return [row.rewardsUsed ? `${row.rewardsUsed} used` : null, row.rewardsActive ? `${row.rewardsActive} active` : null].filter(Boolean).join(" · ");
}

function WheelProgress({ ready, done }: { ready: boolean; done: number }) {
  if (ready) return <Badge tone="green">Spin ready</Badge>;
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-1">
        {Array.from({ length: SPIN_ORDERS_PER_REWARD }).map((_, step) => (
          <span key={step} className={`h-1.5 w-6 rounded-full ${step < done ? "bg-amber-400" : "bg-neutral-200"}`} />
        ))}
      </span>
      <span className="text-xs tabular-nums text-neutral-500">
        {done}/{SPIN_ORDERS_PER_REWARD}
      </span>
    </span>
  );
}
