import Link from "next/link";
import { Settings2 } from "lucide-react";
import { SpinMode, SpinOutcome } from "@prisma/client";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { CopyButton } from "@/components/admin/CopyButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { Pager, readPage } from "@/components/admin/Pager";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { linkButtonClasses } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatIstDateTime, istDayKey, istDayStartUtc } from "@/lib/ist-day";
import { REVENUE_ORDER_WHERE } from "@/lib/order-filters";
import { DEFAULT_SETTINGS_ID } from "@/lib/settings";
import {
  MIN_SPINS_TO_JUDGE,
  PRIZE_STATUS_LABELS,
  WHEEL_PAGE_SIZE,
  buildOddsReport,
  formatChance,
  parsePrizeSearch,
  prizeSearchToParams,
  prizeSourceLabel,
  type PrizeStatus
} from "@/lib/wheel-stats";
import { loadPrizeStatusCounts, loadPrizes, type PrizeRow } from "@/lib/wheel-data";
import { cn, formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BASE_PATH = "/admin/rewards";
const STATUS_TONE: Record<PrizeStatus, "amber" | "green" | "neutral"> = { waiting: "amber", used: "green", expired: "neutral" };
// Wheel prizes are rewards the customer spun for; gifts from an admin have issuedById set.
const SPUN = { issuedById: null };

function PrizeStatusBadge({ status }: { status: PrizeStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{PRIZE_STATUS_LABELS[status]}</Badge>;
}

function Customer({ prize }: { prize: PrizeRow }) {
  return (
    <>
      <Link href={`/admin/customers/${prize.phone}`} className="font-semibold text-neutral-900 hover:underline">
        {prize.customerName || "Unknown"}
      </Link>
      <span className="block text-xs tabular-nums text-neutral-500">{prize.phone}</span>
    </>
  );
}

function Source({ prize }: { prize: PrizeRow }) {
  const given = Boolean(prize.issuedById);
  return (
    <>
      <span className={given ? "font-semibold text-neutral-800" : "text-neutral-600"}>{prizeSourceLabel(prize)}</span>
      {given && prize.issuedNote ? <span className="block text-xs text-neutral-500">{prize.issuedNote}</span> : null}
    </>
  );
}

function OrderLink({ code }: { code: string | null }) {
  if (!code) return <span className="text-neutral-400">—</span>;
  return (
    <Link href={`/admin/orders/${code}`} className="font-mono text-xs font-bold hover:underline">
      {code}
    </Link>
  );
}

export default async function RewardsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const search = parsePrizeSearch({ get: (name) => first(raw[name]) });
  const now = new Date();
  const todayStart = istDayStartUtc(0, now);
  const todayKey = istDayKey(now);
  const last30Start = istDayStartUtc(29, now);

  // Everything is counted in the database. The odds check only looks at prizes the wheel
  // picked (SPUN); prizes an admin gave by hand never went through the wheel.
  const [
    settings,
    spinsToday,
    wonToday,
    givenToday,
    usedToday,
    waitingTotal,
    discountToday,
    wheelDiscountToday,
    allTimeGroups,
    last30Groups,
    repeatGroups,
    statusCounts
  ] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { id: DEFAULT_SETTINGS_ID }, select: { spinWheelForEveryone: true } }),
    prisma.spinUsage.groupBy({ by: ["outcome", "mode"], where: { spinDay: todayKey }, _count: { _all: true } }),
    prisma.spinReward.count({ where: { createdAt: { gte: todayStart }, ...SPUN } }),
    prisma.spinReward.count({ where: { createdAt: { gte: todayStart }, issuedById: { not: null } } }),
    prisma.spinReward.count({ where: { redeemedAt: { gte: todayStart } } }),
    prisma.spinReward.count({ where: { redeemedAt: null, expiredAt: null } }),
    prisma.order.aggregate({ where: { ...REVENUE_ORDER_WHERE, createdAt: { gte: todayStart } }, _sum: { couponDiscountPaise: true } }),
    prisma.order.aggregate({
      where: { ...REVENUE_ORDER_WHERE, createdAt: { gte: todayStart }, spinRewards: { some: {} } },
      _sum: { couponDiscountPaise: true }
    }),
    prisma.spinReward.groupBy({ by: ["discountPercent"], where: SPUN, _count: { _all: true } }),
    prisma.spinReward.groupBy({ by: ["discountPercent"], where: { ...SPUN, createdAt: { gte: last30Start } }, _count: { _all: true } }),
    prisma.spinReward.groupBy({
      by: ["phone"],
      where: SPUN,
      _count: { _all: true },
      having: { phone: { _count: { gte: 2 } } },
      orderBy: [{ _count: { phone: "desc" } }, { phone: "asc" }],
      take: 10
    }),
    loadPrizeStatusCounts(now)
  ]);

  const countsOf = (groups: Array<{ discountPercent: number; _count: { _all: number } }>) =>
    new Map(groups.map((group) => [group.discountPercent, group._count._all]));
  const allTime = buildOddsReport(countsOf(allTimeGroups));
  const last30 = buildOddsReport(countsOf(last30Groups));

  const sum = (outcome: SpinOutcome, mode?: SpinMode) =>
    spinsToday.filter((row) => row.outcome === outcome && (!mode || row.mode === mode)).reduce((total, row) => total + row._count._all, 0);
  const spunToday = sum(SpinOutcome.SPUN);
  const gaveUpToday = sum(SpinOutcome.FORFEITED);
  const promoSpinsToday = sum(SpinOutcome.SPUN, SpinMode.EVERYONE);

  const wheelDiscount = wheelDiscountToday._sum.couponDiscountPaise ?? 0;
  const totalDiscount = discountToday._sum.couponDiscountPaise ?? 0;
  const promoOn = settings?.spinWheelForEveryone ?? false;

  // Names and "used" counts for the repeat winners, in two small lookups.
  const repeatPhones = repeatGroups.map((group) => group.phone);
  const [repeatCustomers, repeatUsed] = repeatPhones.length
    ? await Promise.all([
        prisma.customer.findMany({ where: { phone: { in: repeatPhones } }, select: { phone: true, name: true } }),
        prisma.spinReward.groupBy({ by: ["phone"], where: { ...SPUN, phone: { in: repeatPhones }, redeemedAt: { not: null } }, _count: { _all: true } })
      ])
    : [[], []];
  const nameOf = new Map(repeatCustomers.map((customer) => [customer.phone, customer.name]));
  const usedOf = new Map(repeatUsed.map((group) => [group.phone, group._count._all]));

  const totalPrizes = statusCounts.waiting + statusCounts.used + statusCounts.expired;
  let page = readPage(first(raw.page));
  let listed = await loadPrizes(search, page, WHEEL_PAGE_SIZE, now);
  const totalPages = Math.max(1, Math.ceil(listed.total / WHEEL_PAGE_SIZE));
  // A stale link to a page that no longer exists shows the last page instead of nothing.
  if (page > totalPages) {
    page = totalPages;
    listed = await loadPrizes(search, page, WHEEL_PAGE_SIZE, now);
  }
  const pagerParams = prizeSearchToParams(search);
  const filtered = Object.keys(pagerParams).length > 0;

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Offers"
        title="Discount wheel"
        description="How the wheel is doing today, whether it is giving prizes at the chances you set, and every prize that has been handed out."
      >
        <Link href="/admin/settings#wheel" className={linkButtonClasses("outline", "sm")}>
          <Settings2 size={15} />
          Spin for everyone: {promoOn ? "On" : "Off"}
        </Link>
      </AdminPageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Spins today"
          value={spunToday}
          helper={`${gaveUpToday} gave up${promoSpinsToday ? ` · ${promoSpinsToday} from the everyone promo` : ""}`}
        />
        <StatCard label="Prizes issued today" value={wonToday + givenToday} helper={`${wonToday} won on the wheel · ${givenToday} given by you`} />
        <StatCard label="Prizes used today" value={usedToday} helper={`${waitingTotal} still waiting to be used`} />
        <StatCard
          label="Discount given today"
          value={formatPaise(totalDiscount)}
          helper={`Wheel prizes ${formatPaise(wheelDiscount)} · Other coupons ${formatPaise(Math.max(0, totalDiscount - wheelDiscount))}`}
        />
      </div>

      <SectionCard
        title="Is the wheel fair?"
        description="The chance you set for each prize against how often it really came up. Only prizes the customer spun for are counted, not ones you gave."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          {[
            { title: "All time", report: allTime },
            { title: "Last 30 days", report: last30 }
          ].map(({ title, report }) => (
            <div key={title} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-black">{title}</h3>
                <span className="text-xs tabular-nums text-neutral-500">{report.total} {report.total === 1 ? "spin" : "spins"}</span>
              </div>
              <table className="mt-2 w-full min-w-0! table-fixed text-sm">
                {/* Widths picked so "higher than set" stays on one line in the last column on a 320px phone. */}
                <colgroup>
                  <col className="w-[17%]" />
                  <col className="w-[27%]" />
                  <col className="w-[22%]" />
                  <col className="w-[34%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-bold text-neutral-500">
                    <th className="py-1.5 pr-2">Prize</th>
                    <th className="py-1.5 pr-2 text-right">Set chance</th>
                    <th className="py-1.5 pr-2 text-right">Came up</th>
                    <th className="py-1.5 text-right">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.percent} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2 pr-2 font-black tabular-nums">{row.percent}%</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-neutral-600">{formatChance(row.setChance)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{row.count}</td>
                      <td className="py-2 text-right tabular-nums">
                        <span className={row.verdict === "more" || row.verdict === "less" ? "font-bold text-amber-700" : undefined}>
                          {formatChance(row.actualChance)}
                        </span>
                        {row.verdict === "more" || row.verdict === "less" ? (
                          <span className="block text-[11px] font-semibold text-amber-700">{row.verdict === "more" ? "higher than set" : "lower than set"}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${report.enough ? "bg-neutral-50 text-neutral-700" : "bg-amber-50 text-amber-900"}`}>{report.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-neutral-400">Judging starts at {MIN_SPINS_TO_JUDGE} spins.</p>
      </SectionCard>

      <SectionCard title="Repeat winners" description="Customers who have won from the wheel more than once. Prizes you gave are not counted.">
        {repeatGroups.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">Nobody has won twice yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {repeatGroups.map((group) => (
              <li key={group.phone} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <Link href={`/admin/customers/${group.phone}`} className="min-w-0 font-semibold hover:underline">
                  {nameOf.get(group.phone) || "Unknown"}
                  <span className="ml-2 text-xs font-normal tabular-nums text-neutral-500">{group.phone}</span>
                </Link>
                <span className="text-xs text-neutral-600">
                  {group._count._all} won · {usedOf.get(group.phone) ?? 0} used
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Every wheel prize"
        description="Newest first. A prize turns Expired once its coupon runs out, even if the customer never tried it."
        actions={<Badge tone="neutral">{totalPrizes} in total</Badge>}
        bodyClassName="p-0"
      >
        <form action={BASE_PATH} className="grid grid-cols-1 gap-3 border-b border-black/8 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-end">
          <label className="block text-xs font-semibold text-neutral-500">
            Search
            <input
              name="q"
              defaultValue={search.search}
              maxLength={80}
              placeholder="Phone, name or code"
              className="mt-1 h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-900 outline-none focus:border-neutral-950"
            />
          </label>
          <Dropdown
            name="status"
            label="Status"
            defaultValue={search.status ?? ""}
            options={[
              { value: "", label: `All (${totalPrizes})` },
              ...(Object.keys(PRIZE_STATUS_LABELS) as PrizeStatus[]).map((status) => ({ value: status, label: `${PRIZE_STATUS_LABELS[status]} (${statusCounts[status]})` }))
            ]}
          />
          <Dropdown
            name="source"
            label="Where it came from"
            defaultValue={search.source ?? ""}
            options={[
              { value: "", label: "Won and given" },
              { value: "won", label: "Won on wheel" },
              { value: "given", label: "Given by admin" }
            ]}
          />
          <div className="flex gap-2">
            <button type="submit" className="h-11 flex-1 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white lg:flex-none">
              Show prizes
            </button>
            {filtered ? (
              <Link href={BASE_PATH} className={cn(linkButtonClasses("outline", "sm"), "h-11")}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        {listed.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No prizes match these filters" : "No prizes yet"}
            description={filtered ? "Try a different search or clear the filters." : "Prizes appear here once a customer spins the wheel or you give one."}
          />
        ) : (
          <>
            {/* Phones get a card per prize; wider screens get one table. */}
            <ul className="divide-y divide-neutral-100 md:hidden">
              {listed.rows.map((prize) => (
                <li key={prize.id} className="space-y-2 p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Customer prize={prize} />
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-lg font-black tabular-nums">{prize.discountPercent}%</span>
                      <PrizeStatusBadge status={prize.status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs">{prize.couponCode}</span>
                    <CopyButton value={prize.couponCode} label={`code ${prize.couponCode}`} />
                  </div>
                  <p>
                    <Source prize={prize} />
                  </p>
                  <p className="text-xs text-neutral-500">
                    Issued {formatIstDateTime(prize.createdAt)} · {prize.couponExpiresAt ? `expires ${formatIstDateTime(prize.couponExpiresAt)}` : "no expiry"}
                  </p>
                  {prize.orderCode ? (
                    <p className="text-xs text-neutral-500">
                      Used on order <OrderLink code={prize.orderCode} />
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pl-5 pr-3">Customer</th>
                    <th className="py-2 pr-3">Prize</th>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">From</th>
                    <th className="py-2 pr-3">Issued</th>
                    <th className="py-2 pr-3">Expires</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-5">Used on</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.rows.map((prize) => (
                    <tr key={prize.id} className="border-b border-neutral-100 align-top last:border-0">
                      <td className="py-2.5 pl-5 pr-3">
                        <Customer prize={prize} />
                      </td>
                      <td className="py-2.5 pr-3 font-black tabular-nums">{prize.discountPercent}%</td>
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex items-center gap-0.5">
                          <span className="font-mono text-xs">{prize.couponCode}</span>
                          <CopyButton value={prize.couponCode} label={`code ${prize.couponCode}`} />
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Source prize={prize} />
                      </td>
                      <td className="py-2.5 pr-3 text-xs tabular-nums text-neutral-600">{formatIstDateTime(prize.createdAt)}</td>
                      <td className="py-2.5 pr-3 text-xs tabular-nums text-neutral-600">{prize.couponExpiresAt ? formatIstDateTime(prize.couponExpiresAt) : "—"}</td>
                      <td className="py-2.5 pr-3">
                        <PrizeStatusBadge status={prize.status} />
                      </td>
                      <td className="py-2.5 pr-5">
                        <OrderLink code={prize.orderCode} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <Pager basePath={BASE_PATH} params={pagerParams} page={page} totalPages={totalPages} total={listed.total} shown={listed.rows.length} noun="prizes" />
        </div>
      </SectionCard>
    </PageContainer>
  );
}
