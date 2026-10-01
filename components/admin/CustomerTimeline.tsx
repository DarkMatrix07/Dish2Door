import Link from "next/link";
import { Gift, ReceiptText, RotateCw, Star } from "lucide-react";
import { CopyButton } from "@/components/admin/CopyButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { PaymentBadge, StatusBadge } from "@/components/admin/OrderBadges";
import { Badge } from "@/components/ui/badge";
import {
  TIMELINE_FILTERS,
  TIMELINE_MAX,
  nextTimelineLimit,
  timelineHref,
  type TimelineEvent,
  type TimelineFilter
} from "@/lib/customer-timeline";
import { formatIstFull } from "@/lib/ist-day";
import { cn, formatPaise } from "@/lib/utils";

const ICONS = {
  order: { Icon: ReceiptText, tone: "bg-neutral-100 text-neutral-700" },
  review: { Icon: Star, tone: "bg-amber-100 text-amber-700" },
  prize: { Icon: Gift, tone: "bg-emerald-100 text-emerald-700" },
  spin: { Icon: RotateCw, tone: "bg-neutral-100 text-neutral-500" }
} as const;

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={14} className={index < value ? "fill-amber-400 text-amber-400" : "text-neutral-300"} aria-hidden="true" />
      ))}
    </span>
  );
}

function OrderLink({ code }: { code: string }) {
  return (
    <Link href={`/admin/orders/${code}`} className="font-mono font-bold hover:underline">
      {code}
    </Link>
  );
}

function EventBody({ event }: { event: TimelineEvent }) {
  if (event.kind === "order") {
    const { order } = event;
    return (
      <>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <OrderLink code={order.trackingCode} />
          <StatusBadge order={order} />
          <PaymentBadge order={order} />
        </div>
        <p className="mt-1 text-sm text-neutral-600 [overflow-wrap:anywhere]">
          {order.restaurant.name} · {order.items}
        </p>
        {order.couponCode ? (
          <p className="mt-0.5 text-xs text-neutral-500">
            Coupon <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono">{order.couponCode}</code>
            {order.couponDiscountPaise > 0 ? <span className="text-emerald-700"> · saved {formatPaise(order.couponDiscountPaise)}</span> : null}
          </p>
        ) : null}
      </>
    );
  }

  if (event.kind === "review") {
    const { review } = event;
    return (
      <>
        <p className="text-sm font-semibold">
          Left a review on <OrderLink code={review.order.trackingCode} />
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
          <span className="inline-flex items-center gap-1.5">Food <Stars value={review.foodRating} /></span>
          <span className="inline-flex items-center gap-1.5">Delivery <Stars value={review.deliveryRating} /></span>
        </p>
        {review.review ? <p className="mt-1 text-sm text-neutral-700 [overflow-wrap:anywhere]">“{review.review}”</p> : null}
      </>
    );
  }

  if (event.kind === "prize") {
    const { prize } = event;
    return (
      <>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold">
            {prize.gift ? `${prize.percent}% off given${prize.givenBy ? ` by ${prize.givenBy}` : " by an admin"}` : `Won ${prize.percent}% off on the wheel`}
          </p>
          <Badge tone={prize.used ? "green" : "amber"}>{prize.used ? "Used" : "Waiting"}</Badge>
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-neutral-600">
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{prize.code}</code>
          <CopyButton value={prize.code} label="coupon code" />
        </p>
        {prize.note ? <p className="mt-0.5 text-sm text-neutral-600 [overflow-wrap:anywhere]">Note: {prize.note}</p> : null}
        {prize.usedOn ? (
          <p className="mt-0.5 text-xs text-neutral-500">
            Used on <OrderLink code={prize.usedOn.trackingCode} />
            {prize.usedOn.discountPaise > 0 ? <span className="text-emerald-700"> · saved {formatPaise(prize.usedOn.discountPaise)}</span> : null}
          </p>
        ) : null}
        {!prize.used && prize.expiresAt ? <p className="mt-0.5 text-xs text-neutral-500">Works until {formatIstFull(prize.expiresAt)} IST</p> : null}
        {!prize.used && prize.held ? <p className="mt-0.5 text-xs font-semibold text-amber-800">In a checkout that is not paid yet</p> : null}
      </>
    );
  }

  const { spin } = event;
  return (
    <p className="text-sm text-neutral-600">
      {spin.spun ? "Spun the wheel" : "Closed the wheel without spinning"}
      <span className="text-xs text-neutral-500"> · {spin.promo ? "everyone promo" : "loyalty spin"}</span>
    </p>
  );
}

// The customer's whole story, newest first. The chips and "Show more" are plain links, so
// the page stays server-rendered and "Show more" is a real older slice, not a client trim.
export function CustomerTimeline({
  phone,
  events,
  filter,
  limit,
  hasMore
}: {
  phone: string;
  events: TimelineEvent[];
  filter: TimelineFilter;
  limit: number;
  hasMore: boolean;
}) {
  const next = nextTimelineLimit(limit);
  return (
    <div>
      <nav aria-label="Filter the timeline" className="mb-4 flex flex-wrap gap-2">
        {TIMELINE_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={timelineHref(phone, option.key, 0)}
            scroll={false}
            aria-current={option.key === filter ? "true" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition",
              option.key === filter ? "border-neutral-950 bg-neutral-950 text-white!" : "border-neutral-200 bg-white hover:bg-neutral-50"
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {events.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description={filter === "all" ? "Orders, reviews and wheel prizes will show up here." : "Nothing of this kind yet. Try another filter."}
        />
      ) : (
        <ol>
          {events.map((event, index) => {
            const { Icon, tone } = ICONS[event.kind];
            return (
              <li key={`${event.kind}-${event.id}`} className="relative flex gap-3 pb-5 last:pb-0">
                {index < events.length - 1 ? <span className="absolute bottom-0 left-[15px] top-8 w-px bg-neutral-200" aria-hidden="true" /> : null}
                <span className={cn("relative grid h-8 w-8 shrink-0 place-items-center rounded-full", tone)} aria-hidden="true">
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs tabular-nums text-neutral-500">{formatIstFull(event.at)}</p>
                    {event.kind === "order" ? <p className="shrink-0 text-sm font-black tabular-nums">{formatPaise(event.order.totalPaise)}</p> : null}
                  </div>
                  <div className="mt-0.5">
                    <EventBody event={event} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {hasMore ? (
        <div className="mt-5 flex justify-center border-t border-neutral-100 pt-4">
          {next > limit ? (
            <Link
              href={timelineHref(phone, filter, next)}
              scroll={false}
              className="inline-flex h-9 items-center rounded-md border border-neutral-200 px-4 text-sm font-semibold hover:bg-neutral-50"
            >
              Show more
            </Link>
          ) : (
            <p className="text-sm text-neutral-500">Showing the latest {TIMELINE_MAX}. Older history is not listed here.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
