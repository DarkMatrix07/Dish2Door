"use client";

import Link from "next/link";
import { MessageCircle, Phone, Ticket } from "lucide-react";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { OrderActionButtons } from "@/components/admin/OrderActionButtons";
import { PaymentBadge, SlotBadge, StatusBadge, itemsSummary } from "@/components/admin/OrderBadges";
import { formatAgo, formatIstFull, formatIstTime } from "@/lib/ist-day";
import { boardDeliveryLabel, phoneLinks, type BoardOrder } from "@/lib/today-board";
import { cn, formatPaiseExact } from "@/lib/utils";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-1";

const ROW_TONE: Record<string, string> = {
  REACHED_CAMPUS: "bg-amber-50/50",
  DELIVERED: "bg-neutral-50/70",
  CANCELLED: "bg-neutral-50/70"
};

// One order on the Today board. It is a single layout that reflows (a card on phones, a
// compact row from md up) rather than two copies hidden with CSS, so each order mounts
// one set of action buttons and one cancel dialog.
// `loose` is for orders shown outside the slot/campus/restaurant groups (earlier days,
// cancelled): they carry their own date, campus and restaurant.
export function BoardOrderRow({
  order,
  nowMs,
  onChanged,
  loose = false,
  earlier = false
}: {
  order: BoardOrder;
  nowMs: number;
  onChanged: () => void;
  loose?: boolean;
  // A paid order left open from a previous day: quiet close instead of the messaging moves.
  earlier?: boolean;
}) {
  const created = new Date(order.createdAt);
  const contact = phoneLinks(order.customerPhone);
  const items = itemsSummary(order.items);

  return (
    <li className={cn("flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-start md:gap-5", ROW_TONE[order.status])}>
      <div className="min-w-0 md:w-44 md:shrink-0">
        <Link
          href={`/admin/orders/${order.trackingCode}`}
          prefetch={false}
          className={cn("rounded font-mono text-sm font-black underline-offset-2 hover:underline", FOCUS)}
        >
          {order.trackingCode}
        </Link>
        <p className="mt-0.5 text-xs tabular-nums text-neutral-500">
          <time dateTime={order.createdAt}>{loose ? formatIstFull(created) : formatIstTime(created)}</time>
          {" · "}
          {formatAgo(nowMs - created.getTime())}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge order={order} />
          <PaymentBadge order={order} />
          <SlotBadge slot={order.orderSlot} />
          {loose ? <CampusBadge campus={order.campus} /> : null}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 break-words text-sm font-semibold">{order.customerName}</span>
          <span className="flex items-center gap-1">
            {contact.tel ? (
              <a
                href={contact.tel}
                aria-label={`Call ${order.customerName} on ${order.customerPhone}`}
                className={cn("inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-xs font-semibold tabular-nums text-neutral-700 hover:bg-neutral-100", FOCUS)}
              >
                <Phone size={13} aria-hidden="true" />
                {order.customerPhone}
              </a>
            ) : (
              <span className="text-xs tabular-nums text-neutral-500">{order.customerPhone}</span>
            )}
            {contact.whatsapp ? (
              <a
                href={contact.whatsapp}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`WhatsApp ${order.customerName}`}
                className={cn("grid h-9 w-9 place-items-center rounded-md text-emerald-700 hover:bg-emerald-50", FOCUS)}
              >
                <MessageCircle size={16} aria-hidden="true" />
              </a>
            ) : null}
          </span>
        </div>
        <p className="break-words text-sm text-neutral-800">{items}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span>{boardDeliveryLabel(order)}</span>
          {order.couponCode ? (
            <span className="inline-flex items-center gap-1 font-semibold text-neutral-600">
              <Ticket size={12} aria-hidden="true" />
              <span className="sr-only">Coupon </span>
              {order.couponCode}
            </span>
          ) : null}
          {loose ? <span>{order.restaurant.name}</span> : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 md:shrink-0 md:flex-col md:items-end">
        <p className="text-base font-black tabular-nums">{formatPaiseExact(order.totalPaise)}</p>
        {/* Nothing renders for delivered and cancelled orders. */}
        <OrderActionButtons order={order} size="sm" earlier={earlier} onChanged={onChanged} className="md:justify-end" />
      </div>
    </li>
  );
}
