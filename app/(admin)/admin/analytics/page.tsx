import Link from "next/link";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { requireRole } from "@/lib/auth";
import {
  PERIOD_KEYS,
  PERIOD_LABELS,
  RANGE_CHOICES,
  averageOrderPaise,
  barPercent,
  parseRange,
  totalDiscountPaise
} from "@/lib/analytics";
import { loadAnalytics } from "@/lib/analytics-data";
import { cn, formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-1";

function orderCount(count: number) {
  return `${count} ${count === 1 ? "order" : "orders"}`;
}

export default async function AnalyticsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const range = parseRange((await searchParams).range);
  const data = await loadAnalytics(range);
  const { main, dominos } = data;

  const maxDayRevenue = Math.max(0, ...data.days.map((day) => day.revenuePaise));
  const maxRestaurantRevenue = Math.max(0, ...data.restaurants.main.map((row) => row.revenuePaise));
  const hasDominos = dominos.all.orders > 0;

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Every money figure lives here. Paid orders that were not cancelled, for the main store, so the numbers match the dashboard and the Today board. Domino's is shown separately at the bottom."
      >
        <nav aria-label="Time range" className="flex flex-wrap gap-2">
          {RANGE_CHOICES.map((choice) => {
            const active = choice === range;
            return (
              <Link
                key={choice}
                href={choice === 30 ? "/admin/analytics" : `/admin/analytics?range=${choice}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition",
                  active ? "border-neutral-950 bg-neutral-950 text-white!" : "border-neutral-300 bg-white text-neutral-700! hover:bg-neutral-50",
                  FOCUS
                )}
              >
                {choice} days
              </Link>
            );
          })}
        </nav>
      </AdminPageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" role="group" aria-label="Revenue totals">
        {PERIOD_KEYS.map((key) => (
          <StatCard
            key={key}
            label={key === "today" ? "Revenue today" : key === "all" ? "Revenue, all time" : `Revenue, ${PERIOD_LABELS[key].toLowerCase()}`}
            value={formatPaise(main[key].revenuePaise)}
            helper={`${orderCount(main[key].orders)} · average ${main[key].orders > 0 ? formatPaise(averageOrderPaise(main[key].revenuePaise, main[key].orders)) : "none yet"}`}
          />
        ))}
      </div>

      <SectionCard
        title={`Day by day, last ${range} days`}
        description="Revenue and orders for each day, newest first. Quiet days show as zero."
        bodyClassName="p-0"
      >
        <ul className={cn("divide-y divide-neutral-100", range > 30 && "max-h-[32rem] overflow-y-auto")}>
          {data.days.map((day) => (
            <li key={day.key} className="px-4 py-2.5 sm:px-5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-neutral-800">{day.label}</span>
                <span className="text-right tabular-nums text-neutral-600">
                  <span className="font-bold text-neutral-950">{formatPaise(day.revenuePaise)}</span>
                  <span className="text-neutral-500"> · {orderCount(day.orders)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-neutral-100">
                <div className="h-2 rounded-full bg-amber-400" style={{ width: `${barPercent(day.revenuePaise, maxDayRevenue)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="By campus" description="Revenue and orders at each campus, for every period.">
        {data.campuses.length > 0 ? (
          <div className="space-y-3">
            {data.campuses.map((campus) => (
              <div key={campus.key} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <CampusBadge campus={campus.code ? { code: campus.code, name: campus.name } : null} />
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {PERIOD_KEYS.map((key) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-xs font-semibold text-neutral-500">{PERIOD_LABELS[key]}</dt>
                      <dd className="mt-1 truncate text-lg font-bold tabular-nums text-neutral-900">{formatPaise(campus.totals[key].revenuePaise)}</dd>
                      <dd className="text-xs text-neutral-500">{orderCount(campus.totals[key].orders)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No paid orders yet" />
        )}
      </SectionCard>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <SectionCard title="By restaurant" description={`Last ${range} days.`}>
          {data.restaurants.main.length > 0 ? (
            <ul className="space-y-3">
              {data.restaurants.main.map((row) => (
                <li key={row.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold text-neutral-800">{row.name}</span>
                    <span className="shrink-0 tabular-nums text-neutral-600">
                      {formatPaise(row.revenuePaise)} · {orderCount(row.orders)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-neutral-100">
                    <div className="h-2 rounded-full bg-amber-400" style={{ width: `${barPercent(row.revenuePaise, maxRestaurantRevenue)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={`No paid orders in the last ${range} days`} />
          )}
        </SectionCard>

        <SectionCard title="By delivery slot" description={`Last ${range} days.`}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {data.slots.map((slot) => (
              <div key={slot.slot} className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4">
                <p className="text-sm font-semibold text-neutral-500">
                  {slot.slot === "AFTERNOON" ? "Afternoon" : slot.slot === "NIGHT" ? "Night" : "No slot"}
                </p>
                <p className="mt-2 truncate text-2xl font-black tabular-nums text-neutral-950">{formatPaise(slot.revenuePaise)}</p>
                <p className="mt-1 text-xs text-neutral-500">{orderCount(slot.orders)}</p>
              </div>
            ))}
          </div>
          {data.slots.some((slot) => slot.slot === "NONE") ? (
            <p className="mt-3 text-xs text-neutral-500">&ldquo;No slot&rdquo; is counter orders and older orders placed before slots existed.</p>
          ) : null}
        </SectionCard>
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <SectionCard title="Most ordered dishes" description={`By number sold, last ${range} days.`} bodyClassName="p-0">
          <DishList
            rows={data.topByQuantity}
            emptyTitle={`No dishes sold in the last ${range} days`}
            figure={(dish) => `${dish.quantity} sold`}
            secondary={(dish) => formatPaise(dish.revenuePaise)}
          />
        </SectionCard>

        <SectionCard title="Top earning dishes" description={`By food sales, last ${range} days. Before fees and coupons.`} bodyClassName="p-0">
          <DishList
            rows={data.topByRevenue}
            emptyTitle={`No dishes sold in the last ${range} days`}
            figure={(dish) => formatPaise(dish.revenuePaise)}
            secondary={(dish) => `${dish.quantity} sold`}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Discounts given"
        description="Money taken off orders by coupons. The revenue figures above are already after these discounts."
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-semibold text-neutral-500">
                <th scope="col" className="px-4 py-3 sm:px-5">Period</th>
                <th scope="col" className="px-2 py-3 text-right">Wheel prizes</th>
                <th scope="col" className="px-2 py-3 text-right">Other coupons</th>
                <th scope="col" className="px-4 py-3 text-right sm:px-5">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 tabular-nums">
              {PERIOD_KEYS.map((key) => (
                <tr key={key}>
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-neutral-800 sm:px-5">{PERIOD_LABELS[key]}</th>
                  <td className="px-2 py-3 text-right text-neutral-600">{formatPaise(main[key].wheelDiscountPaise)}</td>
                  <td className="px-2 py-3 text-right text-neutral-600">{formatPaise(main[key].otherDiscountPaise)}</td>
                  <td className="px-4 py-3 text-right font-bold text-neutral-950 sm:px-5">{formatPaise(totalDiscountPaise(main[key]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Domino's, counted separately"
        description="Domino's takes orders on WhatsApp. It is not in any number above."
      >
        {hasDominos ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PERIOD_KEYS.map((key) => (
                <div key={key} className="min-w-0 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <dt className="text-xs font-semibold text-neutral-500">{PERIOD_LABELS[key]}</dt>
                  <dd className="mt-1 truncate text-lg font-bold tabular-nums text-neutral-900">{formatPaise(dominos[key].revenuePaise)}</dd>
                  <dd className="text-xs text-neutral-500">{orderCount(dominos[key].orders)}</dd>
                </div>
              ))}
            </dl>
            {data.restaurants.whatsapp.length > 0 ? (
              <ul className="mt-4 divide-y divide-neutral-100 text-sm">
                {data.restaurants.whatsapp.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 truncate font-semibold text-neutral-800">{row.name}</span>
                    <span className="shrink-0 tabular-nums text-neutral-600">
                      {formatPaise(row.revenuePaise)} · {orderCount(row.orders)}
                      <span className="text-neutral-400"> (last {range} days)</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-neutral-500">No paid Domino&apos;s orders yet.</p>
        )}
      </SectionCard>
    </PageContainer>
  );
}

function DishList({
  rows,
  emptyTitle,
  figure,
  secondary
}: {
  rows: { name: string; quantity: number; revenuePaise: number }[];
  emptyTitle: string;
  figure: (dish: { name: string; quantity: number; revenuePaise: number }) => string;
  secondary: (dish: { name: string; quantity: number; revenuePaise: number }) => string;
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <ol className="divide-y divide-neutral-100">
      {rows.map((dish, index) => (
        <li key={dish.name} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="w-5 shrink-0 text-sm font-black text-neutral-400">{index + 1}</span>
            <span className="min-w-0 truncate font-semibold text-neutral-800">{dish.name}</span>
          </div>
          <div className="shrink-0 text-right text-sm tabular-nums">
            <span className="font-black text-neutral-950">{figure(dish)}</span>
            <span className="ml-2 text-neutral-500 sm:ml-3">{secondary(dish)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
