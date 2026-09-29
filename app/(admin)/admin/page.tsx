import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { AdminActions } from "@/components/admin/AdminActions";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { StatusBadge, itemsSummary } from "@/components/admin/OrderBadges";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { boardCampusHref, groupSoldOut, plural, soldOutItemsHref, unpaidCheckoutsHref } from "@/lib/dashboard";
import { loadDashboard } from "@/lib/dashboard-data";
import { FEATURES } from "@/lib/features";
import { formatIstTime } from "@/lib/ist-day";
import { cn, formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-1";

export default async function AdminDashboardPage() {
  await requireRole(["ADMIN"]);
  const { settings, dayLabel, dayKey, today, latest, soldOutItems, nudges } = await loadDashboard();
  const { totals } = today;
  const soldOut = groupSoldOut(soldOutItems);

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow={dayLabel}
        title="Dashboard"
        description={FEATURES.deliveryPortal
          ? "How today is going, and the controls for ordering, campus arrival and delivery release. Sales history is under Analytics."
          : "How today is going, and the controls for ordering and campus arrival. Sales history is under Analytics."}
      >
        <Badge tone={settings.ordersOpen ? "green" : "red"}>{settings.ordersOpen ? "Orders open" : "Orders closed"}</Badge>
      </AdminPageHeader>

      <SectionCard
        title="Quick actions"
        description={FEATURES.deliveryPortal
          ? "Open or close ordering, mark today's orders as reached campus, and release hostel deliveries."
          : "Open or close ordering and mark today's orders as reached campus."}
      >
        <AdminActions ordersOpen={settings.ordersOpen} toPrepare={totals.toPrepare} />
      </SectionCard>

      {nudges.openEarlier > 0 || nudges.unpaidCheckouts > 0 ? (
        <div className="space-y-2">
          {nudges.openEarlier > 0 ? (
            <Link
              href="/admin/orders"
              className={cn("flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950! transition hover:bg-amber-100", FOCUS)}
            >
              <AlertTriangle size={18} className="shrink-0 text-amber-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <strong className="font-bold">{plural(nudges.openEarlier, "order")}</strong> from earlier days {nudges.openEarlier === 1 ? "is" : "are"} still open.
                <span className="text-amber-900/80"> Open the Today board to finish {nudges.openEarlier === 1 ? "it" : "them"}.</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-amber-700" aria-hidden />
            </Link>
          ) : null}
          {nudges.unpaidCheckouts > 0 ? (
            <Link
              href={unpaidCheckoutsHref(dayKey)}
              className={cn("flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-800! transition hover:bg-neutral-50", FOCUS)}
            >
              <AlertTriangle size={18} className="shrink-0 text-neutral-500" aria-hidden />
              <span className="min-w-0 flex-1">
                <strong className="font-bold">{plural(nudges.unpaidCheckouts, "unpaid checkout")}</strong> today.
                <span className="text-neutral-500"> These are not orders: the customer never finished paying.</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-neutral-400" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" role="group" aria-label="Today's totals">
        <StatCard label="To prepare" value={totals.toPrepare} helper="Confirmed, not yet at campus" />
        <StatCard label="Today's revenue" value={formatPaise(totals.revenuePaise)} helper="Paid, not cancelled · Domino's not included" />
        <StatCard label="Orders today" value={totals.orders} helper="Cancelled not counted" />
        <StatCard
          label="Average order"
          value={totals.paidOrders > 0 ? formatPaise(totals.averagePaise) : "—"}
          helper={totals.paidOrders > 0 ? `Across ${plural(totals.paidOrders, "paid order")}` : "No paid orders yet"}
        />
      </div>

      <SectionCard title="Today by campus" description="Tap a campus to see its orders on the Today board.">
        {today.campuses.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {today.campuses.map((row) => (
              <li key={row.key}>
                <Link
                  href={boardCampusHref(row.key)}
                  className={cn("block rounded-xl border border-neutral-200 bg-neutral-50 p-4 transition hover:border-neutral-300 hover:bg-white", FOCUS)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <CampusBadge campus={row.campus} />
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-neutral-500">
                      Open board <ChevronRight size={14} aria-hidden />
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <CampusFigure label="To prepare" value={row.toPrepare} strong={row.toPrepare > 0} />
                    <CampusFigure label="Reached campus" value={row.reached} />
                    <CampusFigure label="Delivered" value={row.delivered} />
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No campuses yet" description="Add a campus under Settings to see today's orders here." />
        )}
      </SectionCard>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1fr_380px]">
        <SectionCard
          title="Latest orders today"
          description="Newest first. Open one to see the details."
          actions={
            <Link href="/admin/orders" className={cn("rounded text-sm font-semibold text-neutral-700! underline-offset-2 hover:underline", FOCUS)}>
              Today board →
            </Link>
          }
          bodyClassName="p-0"
        >
          {latest.length > 0 ? (
            <ul className="divide-y divide-neutral-100">
              {latest.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.trackingCode}`}
                    prefetch={false}
                    className="flex flex-col gap-2 p-4 outline-none transition hover:bg-neutral-50 focus-visible:bg-amber-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-950 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{order.customerName}</p>
                        <Badge>{order.trackingCode}</Badge>
                        <StatusBadge order={order} />
                        {order.campus ? <CampusBadge campus={order.campus} /> : null}
                      </div>
                      <p className="mt-1 text-sm text-neutral-500">
                        {order.restaurant.name} · {formatIstTime(order.createdAt)}
                      </p>
                      <p className="mt-1 line-clamp-1 text-sm text-neutral-600">{itemsSummary(order.items)}</p>
                    </div>
                    <p className="shrink-0 text-lg font-bold tabular-nums">{formatPaise(order.totalPaise)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No orders yet today" description="New orders show up here as they come in." />
          )}
        </SectionCard>

        <div className="grid content-start gap-4 sm:gap-6">
          <SectionCard title="Sold out" description="Dishes customers cannot order right now.">
            {soldOut.groups.length > 0 ? (
              <div className="space-y-4">
                {soldOut.groups.map((group) => (
                  <div key={group.restaurantId}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-bold text-neutral-900">{group.restaurantName}</p>
                      <Link
                        href={soldOutItemsHref(group.restaurantId)}
                        className={cn("shrink-0 rounded text-xs font-semibold text-neutral-600! underline-offset-2 hover:underline", FOCUS)}
                      >
                        Manage items →
                      </Link>
                    </div>
                    {group.shown.length > 0 ? (
                      <ul className="mt-1.5 space-y-1 text-sm text-neutral-600">
                        {group.shown.map((label, index) => (
                          <li key={`${label}-${index}`} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" aria-hidden />
                            <span className="min-w-0 break-words">{label}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {group.hidden > 0 ? (
                      <p className="mt-1.5 text-sm text-neutral-500">
                        {group.shown.length > 0 ? `+${group.hidden} more` : plural(group.total, "dish", "dishes")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Everything on the menu is available.</p>
            )}
          </SectionCard>

          <Link
            href="/admin/orders/new"
            className={cn("rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-center text-sm font-semibold text-neutral-600! transition hover:border-neutral-400 hover:bg-neutral-50", FOCUS)}
          >
            + Create a manual counter order
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}

function CampusFigure({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-2 py-2.5 ring-1 ring-black/5">
      <dd className={cn("text-2xl font-black tabular-nums", strong ? "text-neutral-950" : "text-neutral-700")}>{value}</dd>
      <dt className="mt-0.5 text-[11px] font-semibold leading-tight text-neutral-500">{label}</dt>
    </div>
  );
}
