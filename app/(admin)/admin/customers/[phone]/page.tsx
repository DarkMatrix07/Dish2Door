import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { CancelPrizeButton } from "@/components/admin/CancelPrizeButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { CustomerTimeline } from "@/components/admin/CustomerTimeline";
import { GiveWheelCoupon } from "@/components/admin/GiveWheelCoupon";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import {
  buildCustomerTimeline,
  loyaltyProgress,
  parseTimelineFilter,
  parseTimelineLimit,
  timelineSources
} from "@/lib/customer-timeline";
import { prisma } from "@/lib/db";
import { formatAgo, formatIstFull } from "@/lib/ist-day";
import { REAL_ORDER_WHERE, REVENUE_ORDER_WHERE } from "@/lib/order-filters";
import { getActiveSpinReward } from "@/lib/spin-rewards";
import { SPIN_ORDERS_PER_REWARD } from "@/lib/spin-wheel";
import { cn, formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Customer keys are normalized phone numbers; anything else cannot exist, so it skips the
// database.
const PHONE_KEY = /^\d{6,15}$/;

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ phone: string }>;
  searchParams: Promise<{ show?: string; limit?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { phone } = await params;
  if (!PHONE_KEY.test(phone)) notFound();
  const query = await searchParams;
  const filter = parseTimelineFilter(query.show);
  const limit = parseTimelineLimit(query.limit);
  const sources = timelineSources(filter);

  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) notFound();

  // Before anything lists prizes: this closes a prize whose code has run out, so a dead
  // one is neither shown as waiting nor blocks the next gift.
  const waitingReward = await getActiveSpinReward(phone);

  const ownOrders = { customerId: phone };
  const take = limit + 1;
  const [revenue, reviewCount, campusGroups, waitingExtras, orders, reviews, prizes, spins] = await Promise.all([
    prisma.order.aggregate({
      where: { ...ownOrders, ...REVENUE_ORDER_WHERE },
      _count: { _all: true },
      _sum: { totalPaise: true },
      _max: { createdAt: true }
    }),
    prisma.rating.count({ where: { order: ownOrders } }),
    prisma.order.groupBy({
      by: ["campusId"],
      where: { ...ownOrders, ...REVENUE_ORDER_WHERE, campusId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { campusId: "desc" } },
      take: 1
    }),
    waitingReward
      ? Promise.all([
          prisma.coupon.findUnique({ where: { code: waitingReward.couponCode }, select: { expiresAt: true, heldCount: true } }),
          waitingReward.issuedById
            ? prisma.user.findUnique({ where: { id: waitingReward.issuedById }, select: { name: true } })
            : null
        ])
      : null,
    sources.orders
      ? prisma.order.findMany({
          where: { ...ownOrders, ...REAL_ORDER_WHERE },
          select: {
            id: true,
            createdAt: true,
            trackingCode: true,
            status: true,
            paymentStatus: true,
            source: true,
            totalPaise: true,
            couponCode: true,
            couponDiscountPaise: true,
            restaurant: { select: { name: true } },
            items: { select: { nameSnapshot: true, quantity: true } }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take
        })
      : [],
    sources.reviews
      ? prisma.rating.findMany({
          where: { order: ownOrders },
          select: {
            id: true,
            createdAt: true,
            foodRating: true,
            deliveryRating: true,
            review: true,
            order: { select: { trackingCode: true, restaurant: { select: { name: true } } } }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take
        })
      : [],
    // Only prizes still waiting or already used. Closed and expired ones are never listed.
    sources.prizes
      ? prisma.spinReward.findMany({
          where: { phone, expiredAt: null },
          select: {
            id: true,
            createdAt: true,
            discountPercent: true,
            couponCode: true,
            redeemedAt: true,
            issuedNote: true,
            issuedById: true,
            issuedBy: { select: { name: true } },
            order: { select: { trackingCode: true, couponDiscountPaise: true } }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take
        })
      : [],
    sources.prizes
      ? prisma.spinUsage.findMany({
          where: { phone },
          select: { id: true, createdAt: true, spinDay: true, outcome: true, mode: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take
        })
      : []
  ]);

  const campus = campusGroups[0]?.campusId
    ? await prisma.campus.findUnique({ where: { id: campusGroups[0].campusId }, select: { code: true, name: true } })
    : null;

  // Prizes still waiting need their coupon's expiry and hold state; the rest do not.
  const waitingCodes = prizes.filter((prize) => !prize.redeemedAt).map((prize) => prize.couponCode);
  const coupons = waitingCodes.length
    ? await prisma.coupon.findMany({ where: { code: { in: waitingCodes } }, select: { code: true, expiresAt: true, heldCount: true } })
    : [];
  const couponByCode = new Map(coupons.map((coupon) => [coupon.code, coupon]));

  const { events, hasMore } = buildCustomerTimeline(
    {
      orders,
      reviews,
      prizes: prizes.map((prize) => ({ ...prize, coupon: prize.redeemedAt ? null : couponByCode.get(prize.couponCode) ?? null })),
      spins
    },
    limit
  );

  const orderCount = revenue._count._all;
  const spent = revenue._sum.totalPaise ?? 0;
  const lastOrderAt = revenue._max.createdAt;
  const loyalty = loyaltyProgress(reviewCount, customer.spinBaseline, SPIN_ORDERS_PER_REWARD);
  const [waitingCoupon, waitingAdmin] = waitingExtras ?? [null, null];

  const digits = customer.phone.replace(/\D/g, "");
  const whatsappHref = digits.length >= 10 ? `https://wa.me/91${digits.slice(-10)}` : null;

  return (
    <PageContainer>
      <Link href="/admin/customers" className="inline-flex min-h-10 items-center text-sm font-semibold text-neutral-500 hover:underline">
        ← All customers
      </Link>
      <AdminPageHeader
        eyebrow="Customer"
        title={customer.name ?? customer.phone}
        description={`First seen ${formatIstFull(customer.firstSeenAt)} IST. Everything this number has ordered, reviewed and won, newest first.`}
      >
        <GiveWheelCoupon
          phone={customer.phone}
          name={customer.name}
          waiting={
            waitingReward
              ? {
                  percent: waitingReward.discountPercent,
                  code: waitingReward.couponCode,
                  expiresAt: waitingCoupon?.expiresAt?.toISOString() ?? null,
                  held: (waitingCoupon?.heldCount ?? 0) > 0
                }
              : null
          }
        />
      </AdminPageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total spent" value={formatPaise(spent)} helper={orderCount ? `Across ${orderCount} paid ${orderCount === 1 ? "order" : "orders"}` : "No paid orders yet"} />
        <StatCard label="Orders" value={orderCount} helper={lastOrderAt ? `Last ${formatAgo(new Date().getTime() - lastOrderAt.getTime())}` : "—"} />
        <StatCard label="Average order" value={orderCount ? formatPaise(Math.round(spent / orderCount)) : "—"} helper="Paid orders only" />
        <StatCard label="Reviews left" value={reviewCount} helper={orderCount ? `${Math.min(100, Math.round((reviewCount / orderCount) * 100))}% of orders rated` : "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* The side cards come first on a phone: contact details and the waiting prize are
            what an admin opens this page for. */}
        <div className="min-w-0 space-y-4 lg:order-2 lg:space-y-6">
          <SectionCard title="Contact">
            <dl className="space-y-3">
              <Field label="Phone">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a href={`tel:${digits}`} className="inline-flex items-center gap-1.5 font-semibold tabular-nums hover:underline">
                    <Phone size={14} aria-hidden="true" />
                    {customer.phone}
                  </a>
                  {whatsappHref ? (
                    <a href={whatsappHref} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline">
                      <MessageCircle size={14} aria-hidden="true" />
                      WhatsApp
                    </a>
                  ) : null}
                </span>
              </Field>
              <Field label="Email">
                {customer.email ? (
                  <a href={`mailto:${encodeURIComponent(customer.email).replace("%40", "@")}`} className="inline-flex items-center gap-1.5 hover:underline">
                    <Mail size={14} className="shrink-0" aria-hidden="true" />
                    {customer.email}
                  </a>
                ) : (
                  <span className="text-neutral-400">Not given</span>
                )}
              </Field>
              <Field label="First seen">{formatIstFull(customer.firstSeenAt)} IST</Field>
              <Field label="Last paid order">{lastOrderAt ? `${formatIstFull(lastOrderAt)} IST` : "No paid orders yet"}</Field>
              <Field label="Orders most from">{campus ? <CampusBadge campus={campus} /> : <span className="text-neutral-400">Not known yet</span>}</Field>
            </dl>
          </SectionCard>

          <SectionCard title="Wheel" description="Progress towards the next spin, and any prize waiting.">
            <div>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: SPIN_ORDERS_PER_REWARD }).map((_, step) => (
                  <span key={step} className={cn("h-2.5 flex-1 rounded-full", step < loyalty.done ? "bg-amber-400" : "bg-neutral-200")} />
                ))}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold tabular-nums">
                {loyalty.done} of {loyalty.perReward} reviewed orders towards the next spin
                {loyalty.ready ? <Badge tone="green">Spin ready</Badge> : null}
              </p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">Prizes you give by hand do not restart this count.</p>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-4">
              {waitingReward ? (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black">{waitingReward.discountPercent}% prize waiting</p>
                    <Badge tone="amber">{waitingReward.issuedById ? "Given by an admin" : "Won on the wheel"}</Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1">
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{waitingReward.couponCode}</code>
                    <CopyButton value={waitingReward.couponCode} label="coupon code" />
                  </p>
                  {waitingReward.issuedById ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      Given by {waitingAdmin?.name ?? "an admin"}
                      {waitingReward.issuedNote ? ` · ${waitingReward.issuedNote}` : ""}
                    </p>
                  ) : null}
                  {waitingCoupon?.expiresAt ? <p className="mt-1 text-xs text-neutral-500">Works until {formatIstFull(waitingCoupon.expiresAt)} IST</p> : null}
                  {(waitingCoupon?.heldCount ?? 0) > 0 ? (
                    <p className="mt-1 text-xs font-semibold text-amber-800">
                      In a checkout that is not paid yet, so it cannot be cancelled until that order is paid or cancelled.
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <CancelPrizeButton phone={customer.phone} rewardId={waitingReward.id} percent={waitingReward.discountPercent} code={waitingReward.couponCode} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">No prize waiting.</p>
              )}
            </div>
          </SectionCard>
        </div>

        <SectionCard id="timeline" title="Timeline" description="Orders, reviews and wheel prizes, newest first. Times are in IST." className="lg:order-1 lg:col-span-2">
          <CustomerTimeline phone={customer.phone} events={events} filter={filter} limit={limit} hasMore={hasMore} />
        </SectionCard>
      </div>
    </PageContainer>
  );
}
