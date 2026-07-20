import Link from "next/link";
import { OrderStatus, PaymentStatus, SpinMode, SpinOutcome } from "@prisma/client";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatIstDateTime, istDayKey, istDayStartUtc } from "@/lib/ist-day";
import { WHEEL_SEGMENTS } from "@/lib/spin-wheel";
import { formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAID = { in: [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY] };

type RewardState = "Redeemed" | "Live" | "Expired";

function rewardState(reward: { redeemedAt: Date | null; expiredAt: Date | null }): RewardState {
  if (reward.redeemedAt) return "Redeemed";
  if (reward.expiredAt) return "Expired";
  return "Live";
}

export default async function RewardsPage() {
  const todayStart = istDayStartUtc(0);
  const todayKey = istDayKey(new Date());

  const [todaysRewards, todaysSpins, paidOrdersToday, allRewards, liveRewards] = await Promise.all([
    prisma.spinReward.findMany({
      where: { createdAt: { gte: todayStart } },
      include: {
        customer: { select: { name: true, email: true } },
        order: { select: { trackingCode: true, couponDiscountPaise: true, totalPaise: true, paymentStatus: true, status: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.spinUsage.findMany({ where: { spinDay: todayKey } }),
    // Every paid order today, so discount given can be split into wheel vs other coupons.
    prisma.order.findMany({
      where: { createdAt: { gte: todayStart }, paymentStatus: PAID, status: { not: OrderStatus.CANCELLED } },
      select: { couponCode: true, couponDiscountPaise: true, totalPaise: true }
    }),
    prisma.spinReward.findMany({ select: { discountPercent: true, redeemedAt: true, phone: true } }),
    prisma.spinReward.count({ where: { redeemedAt: null, expiredAt: null } })
  ]);

  const spunToday = todaysSpins.filter((spin) => spin.outcome === SpinOutcome.SPUN).length;
  const forfeitedToday = todaysSpins.filter((spin) => spin.outcome === SpinOutcome.FORFEITED).length;
  const everyoneToday = todaysSpins.filter((spin) => spin.mode === SpinMode.EVERYONE).length;

  // Money actually given away today, split by source.
  let wheelDiscountToday = 0;
  let otherDiscountToday = 0;
  let revenueToday = 0;
  for (const order of paidOrdersToday) {
    revenueToday += order.totalPaise;
    if (!order.couponDiscountPaise) continue;
    if (order.couponCode?.startsWith("WHEEL")) wheelDiscountToday += order.couponDiscountPaise;
    else otherDiscountToday += order.couponDiscountPaise;
  }
  const totalDiscountToday = wheelDiscountToday + otherDiscountToday;

  const redeemedToday = todaysRewards.filter((reward) => reward.redeemedAt).length;
  const issuedToday = todaysRewards.length;

  // Win distribution across all time, to confirm the odds behave as designed.
  const distribution = WHEEL_SEGMENTS.map((segment) => {
    const won = allRewards.filter((reward) => reward.discountPercent === segment.percent).length;
    const redeemed = allRewards.filter((r) => r.discountPercent === segment.percent && r.redeemedAt).length;
    return { percent: segment.percent, won, redeemed, share: allRewards.length ? (won / allRewards.length) * 100 : 0 };
  });

  // How many rewards each number has ever won — "who got how many".
  const perCustomer = new Map<string, { won: number; redeemed: number }>();
  for (const reward of allRewards) {
    const entry = perCustomer.get(reward.phone) ?? { won: 0, redeemed: 0 };
    entry.won += 1;
    if (reward.redeemedAt) entry.redeemed += 1;
    perCustomer.set(reward.phone, entry);
  }
  const repeatWinners = [...perCustomer.entries()]
    .filter(([, value]) => value.won > 1)
    .sort((a, b) => b[1].won - a[1].won)
    .slice(0, 10);

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Discount wheel"
        title="Rewards & discounts"
        description="Every spin, who won what, whether it was claimed, and exactly how much discount that cost today."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Discount given today" value={formatPaise(totalDiscountToday)} helper={`Wheel ${formatPaise(wheelDiscountToday)} · Other coupons ${formatPaise(otherDiscountToday)}`} />
        <StatCard label="Revenue today" value={formatPaise(revenueToday)} helper={revenueToday ? `Discount is ${((totalDiscountToday / (revenueToday + totalDiscountToday)) * 100).toFixed(1)}% of order value` : "No paid orders yet"} />
        <StatCard label="Spins today" value={spunToday} helper={`${forfeitedToday} gave up · ${everyoneToday} from promo mode`} />
        <StatCard label="Claimed today" value={`${redeemedToday} / ${issuedToday}`} helper={`${liveRewards} coupons still unclaimed overall`} />
      </div>

      <SectionCard
        title="Today's spins"
        description="Each reward issued today, who won it, and the order it was spent on."
        actions={<Badge tone="neutral">{issuedToday} issued</Badge>}
      >
        {todaysRewards.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No spins yet today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Won</th>
                  <th className="py-2 pr-3">Coupon</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Used on</th>
                  <th className="py-2 pr-3 text-right">Discount</th>
                  <th className="py-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {todaysRewards.map((reward) => {
                  const state = rewardState(reward);
                  return (
                    <tr key={reward.id} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2.5 pr-3">
                        <Link href={`/admin/customers/${reward.phone}`} className="font-semibold text-neutral-900 hover:underline">
                          {reward.customer?.name ?? reward.name ?? "Unknown"}
                        </Link>
                        <span className="block text-xs tabular-nums text-neutral-500">{reward.phone}</span>
                      </td>
                      <td className="py-2.5 pr-3 font-black tabular-nums">{reward.discountPercent}%</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{reward.couponCode}</td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={state === "Redeemed" ? "green" : state === "Live" ? "amber" : "neutral"}>{state}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-neutral-600">
                        {reward.order ? `${reward.order.trackingCode} · ${formatPaise(reward.order.totalPaise)}` : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {reward.order?.couponDiscountPaise ? formatPaise(reward.order.couponDiscountPaise) : "—"}
                      </td>
                      <td className="py-2.5 text-right text-xs text-neutral-500">{formatIstDateTime(reward.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Win distribution (all time)" description="Actual results against the configured odds.">
          <div className="space-y-2">
            {distribution.map((row) => (
              <div key={row.percent} className="flex items-center gap-3 text-sm">
                <span className="w-12 font-black tabular-nums">{row.percent}%</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, row.share)}%` }} />
                </div>
                <span className="w-28 text-right text-xs tabular-nums text-neutral-500">
                  {row.won} won · {row.redeemed} used
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Repeat winners" description="Numbers that have won more than once, all time.">
          {repeatWinners.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">Nobody has won twice yet.</p>
          ) : (
            <div className="space-y-2">
              {repeatWinners.map(([phone, value]) => (
                <div key={phone} className="flex items-center justify-between border-b border-neutral-100 pb-2 text-sm last:border-0">
                  <Link href={`/admin/customers/${phone}`} className="font-semibold tabular-nums hover:underline">{phone}</Link>
                  <span className="text-xs text-neutral-600">{value.won} won · {value.redeemed} used</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </PageContainer>
  );
}
