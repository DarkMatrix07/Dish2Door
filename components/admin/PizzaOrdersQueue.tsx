"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { formatPaise } from "@/lib/utils";

type Item = { id: string; nameSnapshot: string; quantity: number; pricePaise: number; linePaise: number };
type Campus = { id: string; code: string; name: string; sortOrder: number } | null;

type Order = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  orderSlot: "AFTERNOON" | "NIGHT" | null;
  subtotalPaise: number;
  platformFeePaise: number;
  hostelFeePaise: number;
  couponDiscountPaise: number;
  totalPaise: number;
  createdAt: string;
  campus: Campus;
  items: Item[];
};

function deliveryLabel(order: Order) {
  return order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock ?? ""}`.trim() : "Gate";
}

function slotLabel(slot: Order["orderSlot"]) {
  if (slot === "AFTERNOON") return "Deliver by Afternoon";
  if (slot === "NIGHT") return "Deliver by Night";
  return "No slot set";
}

export function PizzaOrdersQueue({ orders: initialOrders }: { orders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(order: Order, action: "confirm" | "reject") {
    setBusyId(order.id);
    // Optimistic removal: the moment an admin confirms/rejects, this queue is no longer
    // where the order belongs, so pull it before the request even finishes.
    const previous = orders;
    setOrders((current) => current.filter((o) => o.id !== order.id));
    try {
      const response = await fetch("/api/admin/whatsapp-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, action })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update the order");
      toast.success(action === "confirm" ? `Confirmed ${order.trackingCode}` : `Rejected ${order.trackingCode}`);
    } catch (error) {
      setOrders(previous);
      toast.error(error instanceof Error ? error.message : "Could not update the order");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 min-[430px]:grid-cols-1 sm:max-w-xs">
        <StatCard label="Waiting" value={orders.length} helper="orders to confirm or reject" />
      </div>

      {!orders.length ? (
        <SectionCard title="No orders waiting">
          <p className="p-4 text-center text-neutral-500">No WhatsApp orders are waiting for confirmation right now.</p>
        </SectionCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <SectionCard
              key={order.id}
              title={order.customerName}
              description={`${order.customerPhone} · ${order.trackingCode}`}
              actions={<Badge tone="amber">{slotLabel(order.orderSlot)}</Badge>}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CampusBadge campus={order.campus} />
                  <Badge>{deliveryLabel(order)}</Badge>
                </div>

                <ul className="space-y-1 text-sm text-neutral-700">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                      <span>{item.quantity}× {item.nameSnapshot}</span>
                      <span className="tabular-nums text-neutral-500">{formatPaise(item.linePaise)}</span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
                  <div className="flex items-center justify-between text-neutral-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatPaise(order.subtotalPaise)}</span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-500">
                    <span>Platform fee</span>
                    <span className="tabular-nums">{formatPaise(order.platformFeePaise)}</span>
                  </div>
                  {order.hostelFeePaise ? (
                    <div className="flex items-center justify-between text-neutral-500">
                      <span>Hostel delivery fee</span>
                      <span className="tabular-nums">{formatPaise(order.hostelFeePaise)}</span>
                    </div>
                  ) : null}
                  {order.couponDiscountPaise ? (
                    <div className="flex items-center justify-between text-neutral-500">
                      <span>Coupon discount</span>
                      <span className="tabular-nums">-{formatPaise(order.couponDiscountPaise)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-base font-black text-neutral-900">
                    <span>Total</span>
                    <span className="tabular-nums">{formatPaise(order.totalPaise)}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button className="flex-1" disabled={busyId === order.id} onClick={() => act(order, "confirm")}>
                    <Check size={16} className="-ml-1 mr-1" />
                    Confirm
                  </Button>
                  <Button className="flex-1" variant="destructive" disabled={busyId === order.id} onClick={() => act(order, "reject")}>
                    <X size={16} className="-ml-1 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
