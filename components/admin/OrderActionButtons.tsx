"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PaymentBadge, paymentLabel } from "@/components/admin/OrderBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatIstFull } from "@/lib/ist-day";
import { availableOrderActions, type OrderActionView } from "@/lib/order-views";
import { quietCloseDeliveredAt } from "@/lib/quiet-close";
import { cn, formatPaise } from "@/lib/utils";

type Action = "reached" | "delivered" | "closeQuietly" | "cancel";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2";

// The per-order buttons shared by the order page and the Today board. Which ones show
// comes from availableOrderActions; the server refuses the same invalid moves again, so
// this is guidance, not the only guard.
//
// `earlier` is for a paid order left open from a previous day. Marking it reached or
// delivered would message the customer days late, so those two buttons are replaced by a
// quiet close that records the delivery on the order's own day and sends nothing.
export function OrderActionButtons({
  order,
  size = "md",
  earlier = false,
  onChanged,
  className
}: {
  order: OrderActionView;
  size?: "sm" | "md";
  earlier?: boolean;
  onChanged?: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState<"cancel" | "quiet" | null>(null);
  // State updates are asynchronous, so a fast double click could otherwise send twice.
  const inFlight = useRef(false);

  const run = useCallback(
    async (action: Action) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(action);
      try {
        const response = await fetch(`/api/admin/orders/${order.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The business gives no refunds, so cancelling never asks for one.
          body: JSON.stringify(action === "cancel" ? { action, refund: false } : { action })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not update the order");
        toast.success(
          action === "reached"
            ? `${order.trackingCode} marked reached campus`
            : action === "delivered"
              ? `${order.trackingCode} marked delivered`
              : action === "closeQuietly"
                ? `${order.trackingCode} closed as delivered. No message was sent.`
                : `${order.trackingCode} cancelled`
        );
        if (action === "cancel" || action === "closeQuietly") setConfirming(null);
        onChanged?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update the order");
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [order.id, order.trackingCode, onChanged]
  );

  const closeConfirm = useCallback(() => {
    if (!inFlight.current) setConfirming(null);
  }, []);

  const actions = availableOrderActions(order);
  if (!actions.cancel) return null;

  const paidThroughWebsite = order.paymentStatus === "PAID_ONLINE" || order.paymentStatus === "PAID_MANUALLY";
  const working = (action: Action, label: string) =>
    busy === action ? (
      <>
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        Working...
      </>
    ) : (
      label
    );

  // The moment the quiet close will record, when the row told us when the order was placed.
  const placed = order.createdAt ? new Date(order.createdAt) : null;
  const recordedAs = placed && !Number.isNaN(placed.getTime()) ? formatIstFull(quietCloseDeliveredAt(placed)) : null;

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {actions.unpaidCheckout ? <Badge tone="red">Unpaid checkout</Badge> : null}
        {earlier ? (
          actions.closeQuietly ? (
            <Button
              size={size}
              variant="secondary"
              className={cn("h-auto min-h-9 whitespace-normal py-1.5 text-center", FOCUS)}
              disabled={busy !== null}
              aria-label={`Delivered that day, no message, order ${order.trackingCode}`}
              onClick={() => setConfirming("quiet")}
            >
              {working("closeQuietly", "Delivered that day — no message")}
            </Button>
          ) : null
        ) : (
          <>
            {actions.reached ? (
              <Button
                size={size}
                variant="secondary"
                className={FOCUS}
                disabled={busy !== null}
                aria-label={`Mark reached, order ${order.trackingCode}`}
                onClick={() => run("reached")}
              >
                {working("reached", "Mark reached")}
              </Button>
            ) : null}
            {actions.delivered ? (
              <Button
                size={size}
                variant="secondary"
                className={FOCUS}
                disabled={busy !== null}
                aria-label={`Mark delivered, order ${order.trackingCode}`}
                onClick={() => run("delivered")}
              >
                {working("delivered", "Mark delivered")}
              </Button>
            ) : null}
          </>
        )}
        <Button
          size={size}
          variant="outline"
          className={cn("border-red-200 text-red-600 hover:bg-red-50", FOCUS)}
          disabled={busy !== null}
          aria-label={`Cancel order ${order.trackingCode}`}
          onClick={() => setConfirming("cancel")}
        >
          Cancel
        </Button>
      </div>

      <Modal
        open={confirming === "cancel"}
        onClose={closeConfirm}
        title={`Cancel order ${order.trackingCode}?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="outline" size="sm" className={FOCUS} disabled={busy !== null} onClick={closeConfirm}>
              Keep order
            </Button>
            <Button variant="destructive" size="sm" className={FOCUS} disabled={busy !== null} onClick={() => run("cancel")}>
              {working("cancel", "Cancel order")}
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-neutral-500">Tracking code</dt>
          <dd className="font-mono font-bold">{order.trackingCode}</dd>
          <dt className="text-neutral-500">Customer</dt>
          <dd className="min-w-0 break-words font-semibold">{order.customerName}</dd>
          <dt className="text-neutral-500">Total</dt>
          <dd className="font-semibold tabular-nums">{formatPaise(order.totalPaise)}</dd>
          <dt className="text-neutral-500">Payment</dt>
          <dd>
            <PaymentBadge order={order} />
          </dd>
        </dl>
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800">
          {paidThroughWebsite
            ? `This order is marked "${paymentLabel(order)}". Cancelling it does not refund anything through the website.`
            : actions.unpaidCheckout
              ? "This checkout was never paid. Cancelling closes it and frees any coupon it was holding."
              : "Nothing has been paid on this order yet. Cancelling closes it and frees any coupon it was holding."}
        </p>
      </Modal>

      <Modal
        open={confirming === "quiet"}
        onClose={closeConfirm}
        title={`Close order ${order.trackingCode} as delivered?`}
        description="For an order that was handed over long ago and never marked."
        footer={
          <>
            <Button variant="outline" size="sm" className={FOCUS} disabled={busy !== null} onClick={closeConfirm}>
              Keep order open
            </Button>
            <Button size="sm" className={FOCUS} disabled={busy !== null} onClick={() => run("closeQuietly")}>
              {working("closeQuietly", "Close as delivered")}
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-neutral-500">Tracking code</dt>
          <dd className="font-mono font-bold">{order.trackingCode}</dd>
          <dt className="text-neutral-500">Customer</dt>
          <dd className="min-w-0 break-words font-semibold">{order.customerName}</dd>
          <dt className="text-neutral-500">Total</dt>
          <dd className="font-semibold tabular-nums">{formatPaise(order.totalPaise)}</dd>
          {recordedAs ? (
            <>
              <dt className="text-neutral-500">Recorded as</dt>
              <dd className="font-semibold">Delivered {recordedAs}</dd>
            </>
          ) : null}
        </dl>
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          No message is sent to the customer: no &quot;reached campus&quot;, no &quot;delivered&quot; and no review reminders.
          The delivery is recorded on the order&apos;s own day, not today, so your daily numbers stay right.
        </p>
      </Modal>
    </>
  );
}
