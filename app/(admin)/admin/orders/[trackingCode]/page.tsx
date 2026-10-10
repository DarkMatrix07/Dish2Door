import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle, Phone, Star } from "lucide-react";
import { AdminPageHeader, PageContainer, SectionCard } from "@/components/admin/AdminShell";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { CopyButton } from "@/components/admin/CopyButton";
import { OrderDetailActions } from "@/components/admin/OrderDetailActions";
import {
  PaymentBadge,
  SlotBadge,
  SourceBadge,
  StatusBadge,
  deliveryLabel,
  sourceLabel
} from "@/components/admin/OrderBadges";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatAgo, formatElapsed, formatIstFull, istTodayRange } from "@/lib/ist-day";
import { REVENUE_ORDER_WHERE, isUnpaidCheckout } from "@/lib/order-filters";
import { toOrderActionView } from "@/lib/order-views";
import { quietCloseDecision } from "@/lib/quiet-close";
import { cn, formatPaise, formatPaiseExact } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Tracking codes are 7 uppercase letters and digits; anything else cannot exist, so it
// skips the database.
const TRACKING_CODE = /^[A-Za-z0-9]{4,12}$/;

const CHANNEL_LABELS: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp", TELEGRAM: "Telegram" };
const EVENT_LABELS: Record<string, string> = {
  ORDER_CREATED: "Order confirmation",
  REACHED_CAMPUS: "Reached campus",
  DELIVERED: "Delivered",
  REVIEW_REMINDER: "Review reminder"
};
const NOTIFICATION_TONES = { SUCCESS: "green", FAILED: "red", SKIPPED: "neutral" } as const;
const RESERVATION_LABELS: Record<string, string> = {
  HELD: "Held (checkout still open)",
  CONSUMED: "Used by this order",
  RELEASED: "Released back to the customer pool"
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function MonoId({ value, label }: { value: string | null; label: string }) {
  if (!value) return <span className="text-neutral-400">Not recorded</span>;
  return (
    <span className="flex items-center gap-1">
      <code className="min-w-0 break-all font-mono text-xs">{value}</code>
      <CopyButton value={value} label={label} />
    </span>
  );
}

function MoneyRow({ label, value, tone, strong }: { label: React.ReactNode; value: string; tone?: "green"; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", strong && "border-t border-neutral-200 pt-3 text-base font-black")}>
      <dt className={cn(!strong && "text-neutral-600")}>{label}</dt>
      <dd className={cn("shrink-0 tabular-nums", tone === "green" && "text-emerald-700")}>{value}</dd>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={16} className={index < value ? "fill-amber-400 text-amber-400" : "text-neutral-300"} aria-hidden="true" />
      ))}
    </span>
  );
}

type Step = { key: string; label: string; at: Date | null; note?: string; state: "done" | "pending" | "cancelled" };

type TimelineOrder = {
  status: string;
  source: string;
  paymentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  reachedCampusAt: Date | null;
  deliveredAt: Date | null;
  deliveredBy: { name: string } | null;
  payment: { captureState: string; updatedAt: Date } | null;
};

// What happened to the order and when. Steps that have not happened yet show as pending
// so an admin can see what is still to come.
function buildTimeline(order: TimelineOrder, nowMs: number) {
  const placedMs = order.createdAt.getTime();
  const after = (at: Date) => `${formatElapsed(at.getTime() - placedMs)} after order`;
  const unpaidCheckout = isUnpaidCheckout(order);
  const cancelled = order.status === "CANCELLED";

  const steps: Step[] = [{ key: "placed", label: "Order placed", at: order.createdAt, state: "done", note: formatAgo(nowMs - placedMs) }];

  if (order.paymentStatus === "PAID_ONLINE" || order.paymentStatus === "REFUNDED") {
    const capturedAt = order.payment?.captureState === "CAPTURED" ? order.payment.updatedAt : null;
    steps.push({
      key: "paid",
      label: order.paymentStatus === "REFUNDED" ? "Paid online, since refunded" : "Paid online",
      at: capturedAt,
      note: capturedAt ? after(capturedAt) : "Time not recorded",
      state: "done"
    });
  } else if (order.paymentStatus === "PAID_MANUALLY") {
    steps.push({ key: "paid", label: "Paid manually", at: null, note: "Marked paid by an admin; time not recorded", state: "done" });
  } else if (order.paymentStatus === "UNPAID") {
    steps.push({ key: "paid", label: "Pay later", at: null, note: "Settled at handover, not yet marked paid", state: "pending" });
  } else {
    steps.push({
      key: "paid",
      label: order.paymentStatus === "FAILED" ? "Payment failed" : "Payment not received",
      at: null,
      note: unpaidCheckout ? "Never paid, so not a real order" : undefined,
      state: "pending"
    });
  }

  if (order.status === "AWAITING_CONFIRMATION") {
    steps.push({ key: "confirm", label: "Awaiting confirmation", at: null, note: "Not yet accepted by an admin", state: "pending" });
  }
  if (!unpaidCheckout && order.status !== "AWAITING_CONFIRMATION") {
    if (order.reachedCampusAt) {
      steps.push({ key: "reached", label: "Reached campus", at: order.reachedCampusAt, note: after(order.reachedCampusAt), state: "done" });
    } else if (!cancelled) {
      steps.push({ key: "reached", label: "Reached campus", at: null, note: "Not yet", state: "pending" });
    }
    if (order.deliveredAt) {
      steps.push({
        key: "delivered",
        label: order.deliveredBy ? `Delivered by ${order.deliveredBy.name}` : "Delivered",
        at: order.deliveredAt,
        note: after(order.deliveredAt),
        state: "done"
      });
    } else if (!cancelled) {
      steps.push({ key: "delivered", label: "Delivered", at: null, note: "Not yet", state: "pending" });
    }
  }
  if (cancelled) {
    // There is no dedicated cancellation timestamp, so updatedAt is the best proxy.
    steps.push({ key: "cancelled", label: "Cancelled", at: order.updatedAt, note: `Last updated ${after(order.updatedAt)}`, state: "cancelled" });
  }
  return steps;
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ trackingCode: string }> }) {
  await requireRole(["ADMIN"]);
  const { trackingCode: rawCode } = await params;
  if (!TRACKING_CODE.test(rawCode)) notFound();

  // Explicit selects everywhere: the passcode hash, gateway signature and review tokens
  // are never read here, so they cannot end up in the page.
  const order = await prisma.order.findUnique({
    where: { trackingCode: rawCode.toUpperCase() },
    select: {
      id: true,
      trackingCode: true,
      customerId: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      deliveryType: true,
      hostelBlock: true,
      status: true,
      source: true,
      orderSlot: true,
      paymentStatus: true,
      subtotalPaise: true,
      platformFeePaise: true,
      hostelFeePaise: true,
      couponCode: true,
      couponDiscountPaise: true,
      paymentFeePaise: true,
      taxPaise: true,
      totalPaise: true,
      checkoutState: true,
      reachedCampusAt: true,
      deliveredAt: true,
      receivedBy: true,
      deliveryNote: true,
      createdAt: true,
      updatedAt: true,
      restaurant: { select: { name: true } },
      session: { select: { label: true } },
      campus: { select: { code: true, name: true } },
      deliveredBy: { select: { name: true } },
      items: { select: { id: true, nameSnapshot: true, pricePaise: true, quantity: true, linePaise: true } },
      payment: {
        select: {
          provider: true,
          razorpayOrderId: true,
          razorpayPaymentId: true,
          status: true,
          amountPaise: true,
          captureState: true,
          refundState: true,
          refundAmountPaise: true,
          refundReference: true,
          updatedAt: true
        }
      },
      paymentEvents: {
        select: { id: true, eventType: true, matched: true, processedAt: true, createdAt: true, lastError: true, attempts: true },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      couponReservations: { select: { status: true, expiresAt: true, consumedAt: true, releasedAt: true, coupon: { select: { code: true } } } },
      spinRewards: { select: { id: true, discountPercent: true, couponCode: true, redeemedAt: true } },
      rating: { select: { foodRating: true, deliveryRating: true, review: true, createdAt: true } },
      notificationLogs: {
        select: { id: true, channel: true, event: true, status: true, errorMessage: true, sentAt: true, retryCount: true, resolvedAt: true },
        orderBy: { sentAt: "desc" },
        take: 50
      }
    }
  });
  if (!order) notFound();

  // Same revenue rule as every other admin screen, so this agrees with the customer page.
  const history = await prisma.order.aggregate({
    where: { AND: [order.customerId ? { customerId: order.customerId } : { customerPhone: order.customerPhone }, REVENUE_ORDER_WHERE] },
    _count: { _all: true },
    _sum: { totalPaise: true }
  });

  // Read after the queries above so "ago" is measured from the moment the page is built.
  const steps = buildTimeline(order, new Date().getTime());
  const unpaidCheckout = isUnpaidCheckout(order);
  // A paid order still open from before today: marking it reached or delivered would message
  // the customer days late, so the page offers the quiet close instead (same rule the server
  // enforces).
  const closeQuietly = quietCloseDecision(order, istTodayRange().start).ok;

  const digits = order.customerPhone.replace(/\D/g, "");
  const whatsappHref = digits.length >= 10 ? `https://wa.me/91${digits.slice(-10)}` : null;
  const reservation = order.couponReservations[0] ?? null;
  const paidOrders = history._count._all;
  const lifetimePaise = history._sum.totalPaise ?? 0;
  const payment = order.payment;

  return (
    <PageContainer>
      <Link href="/admin/orders/all" className="inline-flex min-h-10 items-center text-sm font-semibold text-neutral-500 hover:underline">
        ← All orders
      </Link>
      <AdminPageHeader
        eyebrow="Order"
        title={order.trackingCode}
        description={`${order.restaurant.name} · placed ${formatIstFull(order.createdAt)} IST`}
      >
        <OrderDetailActions order={{ ...toOrderActionView(order), createdAt: order.createdAt.toISOString() }} earlier={closeQuietly} />
      </AdminPageHeader>

      {closeQuietly ? (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          Placed on {formatIstFull(order.createdAt)}. It is closed without messaging the customer.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge order={order} />
        <PaymentBadge order={order} />
        <SlotBadge slot={order.orderSlot} />
        <CampusBadge campus={order.campus} />
        <SourceBadge source={order.source} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Below lg the two columns dissolve into one grid so the Customer card (the thing an
            admin usually opens an order for) can be ordered up to the top. */}
        <div className="contents min-w-0 lg:col-span-2 lg:block lg:space-y-6">
          <SectionCard title="Timeline" description="Times are in IST.">
            <ol className="space-y-0">
              {steps.map((step, index) => (
                <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < steps.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-neutral-200" aria-hidden="true" /> : null}
                  <span
                    className={cn(
                      "relative mt-1 h-4 w-4 shrink-0 rounded-full border-2 bg-white",
                      step.state === "done" && "border-emerald-500 bg-emerald-500",
                      step.state === "pending" && "border-neutral-300",
                      step.state === "cancelled" && "border-red-500 bg-red-500"
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className={cn("text-sm font-semibold", step.state === "pending" && "text-neutral-500")}>{step.label}</p>
                    <p className="text-sm tabular-nums text-neutral-600">{step.at ? formatIstFull(step.at) : null}</p>
                    {step.note ? <p className="text-xs text-neutral-500">{step.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Items and bill">
            {/* Phones get one stacked line per item; from sm up a fixed-layout table keeps all
                four columns inside the card and lets long names wrap. */}
            <ul className="divide-y divide-neutral-100 sm:hidden">
              {order.items.map((item) => (
                <li key={item.id} className="py-2.5 first:pt-0">
                  <p className="text-sm font-semibold [overflow-wrap:anywhere]">{item.nameSnapshot}</p>
                  <p className="mt-0.5 text-right text-sm tabular-nums text-neutral-600">
                    {item.quantity} × {formatPaiseExact(item.pricePaise)} = <span className="font-semibold text-neutral-900">{formatPaiseExact(item.linePaise)}</span>
                  </p>
                </li>
              ))}
            </ul>
            <table className="hidden w-full min-w-0! table-fixed text-sm sm:table">
              <colgroup>
                <col />
                <col className="w-16" />
                <col className="w-28" />
                <col className="w-28" />
              </colgroup>
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                  <th scope="col" className="py-2 pr-3">Item</th>
                  <th scope="col" className="py-2 pr-3 text-right">Qty</th>
                  <th scope="col" className="py-2 pr-3 text-right">Price</th>
                  <th scope="col" className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-neutral-100 align-top last:border-0">
                    <td className="py-2.5 pr-3 [overflow-wrap:anywhere]">{item.nameSnapshot}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{item.quantity}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatPaiseExact(item.pricePaise)}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{formatPaiseExact(item.linePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 border-t border-neutral-200 pt-2">
              <MoneyRow label="Subtotal" value={formatPaiseExact(order.subtotalPaise)} />
              {order.couponDiscountPaise > 0 || order.couponCode ? (
                <MoneyRow
                  label={<>Coupon{order.couponCode ? <code className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{order.couponCode}</code> : null}</>}
                  value={order.couponDiscountPaise > 0 ? `-${formatPaiseExact(order.couponDiscountPaise)}` : formatPaiseExact(0)}
                  tone={order.couponDiscountPaise > 0 ? "green" : undefined}
                />
              ) : null}
              <MoneyRow label="Platform fee" value={formatPaiseExact(order.platformFeePaise)} />
              {order.hostelFeePaise > 0 ? <MoneyRow label="Hostel delivery fee" value={formatPaiseExact(order.hostelFeePaise)} /> : null}
              {order.taxPaise > 0 ? <MoneyRow label="GST" value={formatPaiseExact(order.taxPaise)} /> : null}
              <MoneyRow label="Payment fee" value={formatPaiseExact(order.paymentFeePaise)} />
              <MoneyRow label="Total" value={formatPaiseExact(order.totalPaise)} strong />
            </dl>
          </SectionCard>

          <SectionCard title="Notifications sent" description="Messages the system sent the customer about this order, newest first.">
            {order.notificationLogs.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-500">No notifications were logged for this order.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                    <th scope="col" className="py-2 pr-3">Event</th>
                    <th scope="col" className="hidden py-2 pr-3 sm:table-cell">Channel</th>
                    <th scope="col" className="py-2 pr-3">Status</th>
                    <th scope="col" className="py-2 pr-3">Sent (IST)</th>
                    <th scope="col" className="hidden py-2 text-right sm:table-cell">Retries</th>
                  </tr>
                </thead>
                <tbody>
                  {order.notificationLogs.map((log) => (
                    <tr key={log.id} className="border-b border-neutral-100 align-top last:border-0">
                      <td className="py-2.5 pr-3">
                        <span className="font-semibold">{EVENT_LABELS[log.event] ?? log.event}</span>
                        {/* Phones drop the Channel and Retries columns, so fold them in here. */}
                        <span className="block text-xs text-neutral-500 sm:hidden">
                          {CHANNEL_LABELS[log.channel] ?? log.channel}
                          {log.retryCount > 0 ? ` · ${log.retryCount} ${log.retryCount === 1 ? "retry" : "retries"}` : ""}
                        </span>
                        {log.errorMessage ? <span className="mt-1 block text-xs text-red-700 [overflow-wrap:anywhere]">{log.errorMessage}</span> : null}
                      </td>
                      <td className="hidden py-2.5 pr-3 sm:table-cell">{CHANNEL_LABELS[log.channel] ?? log.channel}</td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={NOTIFICATION_TONES[log.status]}>{log.status.toLowerCase()}</Badge>
                        {log.resolvedAt ? <span className="mt-1 block text-xs text-neutral-500">Resolved</span> : null}
                      </td>
                      <td className="py-2.5 pr-3 text-xs tabular-nums text-neutral-600">{formatIstFull(log.sentAt)}</td>
                      <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{log.retryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        <div className="contents min-w-0 lg:block lg:space-y-6">
          <SectionCard title="Customer" className="order-first lg:order-none">
            <dl className="space-y-3">
              <Field label="Name">{order.customerName}</Field>
              <Field label="Phone">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {digits ? (
                    <a href={`tel:${digits}`} className="inline-flex items-center gap-1.5 font-semibold tabular-nums hover:underline">
                      <Phone size={14} aria-hidden="true" />
                      {order.customerPhone}
                    </a>
                  ) : (
                    <span className="tabular-nums">{order.customerPhone}</span>
                  )}
                  {whatsappHref ? (
                    <a href={whatsappHref} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline">
                      <MessageCircle size={14} aria-hidden="true" />
                      WhatsApp
                    </a>
                  ) : null}
                </span>
              </Field>
              <Field label="Email">
                {order.customerEmail ? (
                  <a href={`mailto:${encodeURIComponent(order.customerEmail).replace("%40", "@")}`} className="inline-flex items-center gap-1.5 hover:underline">
                    <Mail size={14} className="shrink-0" aria-hidden="true" />
                    {order.customerEmail}
                  </a>
                ) : (
                  <span className="text-neutral-400">Not given</span>
                )}
              </Field>
              <Field label="Campus">
                <CampusBadge campus={order.campus} />
              </Field>
              <Field label="Delivery">{deliveryLabel(order)}</Field>
              <Field label="History">
                {paidOrders > 0
                  ? `${paidOrders} paid order${paidOrders === 1 ? "" : "s"} · ${formatPaise(lifetimePaise)} lifetime spend`
                  : "No paid orders yet"}
              </Field>
            </dl>
            {order.customerId ? (
              <Link href={`/admin/customers/${order.customerId}`} className="mt-3 inline-block text-sm font-semibold text-[#b65a20] hover:underline">
                View customer profile →
              </Link>
            ) : null}
          </SectionCard>

          <SectionCard title="Payment">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <PaymentBadge order={order} />
              </Field>
              <Field label="Amount">{formatPaiseExact(payment?.amountPaise ?? order.totalPaise)}</Field>
              {payment ? (
                <>
                  <Field label="Provider" className="capitalize">{payment.provider}</Field>
                  <Field label="Capture">{payment.captureState.toLowerCase()}</Field>
                  <Field label="Refund">
                    {payment.refundState === "NONE"
                      ? "None"
                      : `${payment.refundState.toLowerCase()}${payment.refundAmountPaise > 0 ? ` · ${formatPaiseExact(payment.refundAmountPaise)}` : ""}`}
                  </Field>
                  {payment.refundReference ? <Field label="Refund reference"><MonoId value={payment.refundReference} label="refund reference" /></Field> : null}
                  <Field label="Razorpay order id" className="col-span-2">
                    <MonoId value={payment.razorpayOrderId} label="Razorpay order id" />
                  </Field>
                  <Field label="Razorpay payment id" className="col-span-2">
                    <MonoId value={payment.razorpayPaymentId} label="Razorpay payment id" />
                  </Field>
                </>
              ) : (
                <div className="col-span-2 text-sm text-neutral-500">No online payment record. This is a counter or WhatsApp order settled outside the website.</div>
              )}
            </dl>

            {order.paymentEvents.length > 0 ? (
              <div className="mt-5 border-t border-neutral-100 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Payment events</h3>
                <ul className="mt-2 divide-y divide-neutral-100">
                  {order.paymentEvents.map((event) => (
                    <li key={event.id} className="py-2 text-sm first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <code className="min-w-0 break-all font-mono text-xs font-semibold">{event.eventType}</code>
                        <span className="flex items-center gap-2">
                          <Badge tone={event.matched ? "green" : "amber"}>{event.matched ? "matched" : "unmatched"}</Badge>
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs tabular-nums text-neutral-500">
                        {event.processedAt ? `Processed ${formatIstFull(event.processedAt)}` : `Received ${formatIstFull(event.createdAt)}, not processed yet`}
                        {event.attempts > 1 ? ` · ${event.attempts} attempts` : ""}
                      </p>
                      {event.lastError ? <p className="mt-0.5 break-words text-xs text-red-700">{event.lastError}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {reservation || order.spinRewards.length > 0 ? (
              <div className="mt-5 space-y-2 border-t border-neutral-100 pt-4 text-sm">
                {reservation ? (
                  <p>
                    <span className="font-semibold">Coupon {reservation.coupon.code}:</span> {RESERVATION_LABELS[reservation.status] ?? reservation.status.toLowerCase()}
                    {reservation.status === "HELD" ? <span className="block text-xs text-neutral-500">Hold expires {formatIstFull(reservation.expiresAt)}</span> : null}
                    {reservation.status === "CONSUMED" && reservation.consumedAt ? <span className="block text-xs text-neutral-500">Used {formatIstFull(reservation.consumedAt)}</span> : null}
                    {reservation.status === "RELEASED" && reservation.releasedAt ? <span className="block text-xs text-neutral-500">Released {formatIstFull(reservation.releasedAt)}</span> : null}
                  </p>
                ) : null}
                {order.spinRewards.map((reward) => (
                  <p key={reward.id}>
                    <span className="font-semibold">Spin reward used:</span> {reward.discountPercent}% off
                    <code className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{reward.couponCode}</code>
                  </p>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Rating">
            {order.rating ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-600">Food</span>
                  <Stars value={order.rating.foodRating} />
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-600">Delivery</span>
                  <Stars value={order.rating.deliveryRating} />
                </div>
                {order.rating.review ? <p className="break-words rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">&ldquo;{order.rating.review}&rdquo;</p> : null}
                <p className="text-xs text-neutral-500">Rated {formatIstFull(order.rating.createdAt)}</p>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Not rated yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Order details">
            <dl className="space-y-3">
              <Field label="Source">{sourceLabel(order.source)}</Field>
              <Field label="Session">{order.session.label}</Field>
              {order.source === "CUSTOMER_ONLINE" ? <Field label="Checkout">{order.checkoutState.toLowerCase()}</Field> : null}
              {order.receivedBy ? <Field label="Received by">{order.receivedBy}</Field> : null}
              {order.deliveryNote ? <Field label="Handover note">{order.deliveryNote}</Field> : null}
              <Field label="Internal id">
                <span className="font-mono text-xs text-neutral-400">{order.id}</span>
              </Field>
            </dl>
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  );
}
