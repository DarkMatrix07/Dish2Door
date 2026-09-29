import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { orderStatusLabel, paymentLabel, paymentTone, slotLabel, sourceLabel, statusTone } from "@/lib/order-labels";

// The label helpers are re-exported so a screen that needs plain text (a title, a
// dialog) gets the same wording as its badges.
export { deliveryLabel, itemsSummary, orderStatusLabel, paymentLabel, slotLabel, sourceLabel, statusLabel } from "@/lib/order-labels";

// Takes the whole order (not just the status) so an unpaid online checkout is not
// labelled "Confirmed".
export function StatusBadge({
  order,
  className
}: {
  order: { status: string; paymentStatus: string; source: string };
  className?: string;
}) {
  return (
    <Badge tone={statusTone(order.status)} className={cn("whitespace-nowrap", className)}>
      {orderStatusLabel(order)}
    </Badge>
  );
}

export function PaymentBadge({ order, className }: { order: { paymentStatus: string; source: string }; className?: string }) {
  return (
    <Badge tone={paymentTone(order)} className={cn("whitespace-nowrap", className)}>
      {paymentLabel(order)}
    </Badge>
  );
}

// Renders nothing for orders with no slot (older orders, counter orders).
export function SlotBadge({ slot, className }: { slot: string | null | undefined; className?: string }) {
  if (!slot) return null;
  return (
    <Badge tone="amber" className={cn("whitespace-nowrap", className)}>
      {slotLabel(slot)}
    </Badge>
  );
}

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  return <Badge className={cn("whitespace-nowrap", className)}>{sourceLabel(source)}</Badge>;
}
