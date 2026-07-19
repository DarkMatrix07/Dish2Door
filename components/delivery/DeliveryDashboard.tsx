"use client";

import { Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPaise } from "@/lib/utils";

type Order = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  hostelBlock: string | null;
  status: string;
  totalPaise: number;
  restaurant: { name: string };
  items: { id: string; nameSnapshot: string; quantity: number }[];
};

type GroupBy = "none" | "restaurant" | "hostel" | "phone";

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "none", label: "None" },
  { key: "restaurant", label: "Restaurant" },
  { key: "hostel", label: "Hostel block" },
  { key: "phone", label: "Number" }
];

function groupKey(order: Order, by: GroupBy) {
  if (by === "restaurant") return order.restaurant.name;
  if (by === "hostel") return order.hostelBlock ? `Hostel ${order.hostelBlock}` : "No block";
  if (by === "phone") return order.customerPhone;
  return "";
}

export function DeliveryDashboard({
  initialOrders,
  stats,
  assignedHostelBlocks
}: {
  initialOrders: Order[];
  assignedHostelBlocks: string[];
  stats: { deliveredToday: number; deliveredThisWeek: number; deliveredTotal: number; pending: number };
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [currentStats, setCurrentStats] = useState(stats);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      const key = groupKey(order, groupBy);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders, groupBy]);

  async function markReached(id: string) {
    try {
      const response = await fetch(`/api/delivery/orders/${id}/reached`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not mark reached");
      setOrders((current) => current.map((order) => (order.id === id ? { ...order, status: "REACHED_CAMPUS" } : order)));
      toast.success("Marked reached campus");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark reached");
    }
  }

  async function delivered(id: string) {
    try {
      const response = await fetch(`/api/delivery/orders/${id}/delivered`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not mark delivered");
      setOrders((current) => current.filter((order) => order.id !== id));
      setCurrentStats((current) => ({
        pending: Math.max(0, current.pending - 1),
        deliveredToday: current.deliveredToday + 1,
        deliveredThisWeek: current.deliveredThisWeek + 1,
        deliveredTotal: current.deliveredTotal + 1
      }));
      toast.success("Marked delivered");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark delivered");
    }
  }

  function orderCard(order: Order) {
    return (
      <Card key={order.id} className="border-white/10 bg-white/10 p-5 text-white backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-amber-200">{order.restaurant.name}</p>
            <h2 className="mt-1 text-2xl font-black">{order.customerName}</h2>
            <p className="mt-1 text-white/65">Hostel {order.hostelBlock} / {order.trackingCode}</p>
            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${order.status === "REACHED_CAMPUS" ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/70"}`}>
              {order.status === "REACHED_CAMPUS" ? "Reached campus" : "Confirmed"}
            </span>
          </div>
          <p className="font-black">{formatPaise(order.totalPaise)}</p>
        </div>
        <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm text-white/80">
          {order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}
        </div>
        <div className="mt-4 flex gap-2">
          <a className="flex-1" href={`tel:${order.customerPhone}`}>
            <Button className="w-full bg-white text-neutral-950 hover:bg-amber-100">
              <Phone size={16} /> Call
            </Button>
          </a>
          {order.status === "ORDER_CONFIRMED" ? (
            <Button className="flex-1 bg-sky-300 text-neutral-950 hover:bg-sky-200" onClick={() => markReached(order.id)}>
              Mark reached
            </Button>
          ) : (
            <Button className="flex-1 bg-amber-300 text-neutral-950 hover:bg-amber-200" onClick={() => delivered(order.id)}>
              Delivered
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-white/70">
        <span className="font-semibold text-white">Your hostels</span>
        {assignedHostelBlocks.length ? assignedHostelBlocks.map((block) => <span key={block} className="rounded-full bg-white/10 px-3 py-1 font-semibold text-amber-200">{block}</span>) : <span className="rounded-full bg-red-400/15 px-3 py-1 font-semibold text-red-200">None assigned</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/10 bg-white/10 p-5 text-white"><p className="text-sm text-white/55">Pending</p><p className="mt-2 text-3xl font-black">{orders.length}</p></Card>
        <Card className="border-white/10 bg-white/10 p-5 text-white"><p className="text-sm text-white/55">Delivered today</p><p className="mt-2 text-3xl font-black">{currentStats.deliveredToday}</p></Card>
        <Card className="border-white/10 bg-white/10 p-5 text-white"><p className="text-sm text-white/55">Delivered this week</p><p className="mt-2 text-3xl font-black">{currentStats.deliveredThisWeek}</p></Card>
        <Card className="border-white/10 bg-white/10 p-5 text-white"><p className="text-sm text-white/55">Total delivered</p><p className="mt-2 text-3xl font-black">{currentStats.deliveredTotal}</p></Card>
      </div>

      {orders.length ? (
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white/60">Group by</span>
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setGroupBy(option.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                groupBy === option.key ? "bg-amber-300 text-neutral-950" : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {groupBy === "none" ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">{orders.map(orderCard)}</div>
      ) : (
        <div className="mt-6 space-y-8">
          {grouped!.map(([label, groupOrders]) => (
            <div key={label}>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-black text-white">
                {label}
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-bold text-amber-200">{groupOrders.length}</span>
              </h3>
              <div className="grid gap-4 md:grid-cols-2">{groupOrders.map(orderCard)}</div>
            </div>
          ))}
        </div>
      )}

      {orders.length === 0 ? (
        <Card className="mt-8 border-white/10 bg-white/10 p-8 text-center text-white/70">No hostel deliveries are assigned right now.</Card>
      ) : null}
    </section>
  );
}
