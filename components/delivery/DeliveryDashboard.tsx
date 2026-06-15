"use client";

import { Phone } from "lucide-react";
import { useState } from "react";
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
  totalPaise: number;
  restaurant: { name: string };
  items: { id: string; nameSnapshot: string; quantity: number }[];
};

export function DeliveryDashboard({
  initialOrders,
  stats
}: {
  initialOrders: Order[];
  stats: { deliveredToday: number; deliveredThisWeek: number; deliveredTotal: number; pending: number };
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [currentStats, setCurrentStats] = useState(stats);

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

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/10 bg-white/10 p-5 text-white"><p className="text-sm text-white/55">Pending</p><p className="mt-2 text-3xl font-black">{orders.length}</p></Card>
        <Card className="border-white/10 bg-white/10 p-5 text-white"><p className="text-sm text-white/55">Delivered today</p><p className="mt-2 text-3xl font-black">{currentStats.deliveredToday}</p></Card>
        <Card className="border-white/10 bg-white/10 p-5 text-white"><p className="text-sm text-white/55">Delivered this week</p><p className="mt-2 text-3xl font-black">{currentStats.deliveredThisWeek}</p></Card>
        <Card className="border-white/10 bg-white/10 p-5 text-white"><p className="text-sm text-white/55">Total delivered</p><p className="mt-2 text-3xl font-black">{currentStats.deliveredTotal}</p></Card>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {orders.map((order) => (
          <Card key={order.id} className="border-white/10 bg-white/10 p-5 text-white backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-amber-200">{order.restaurant.name}</p>
                <h2 className="mt-1 text-2xl font-black">{order.customerName}</h2>
                <p className="mt-1 text-white/65">Hostel {order.hostelBlock} · {order.trackingCode}</p>
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
              <Button className="flex-1 bg-amber-300 text-neutral-950 hover:bg-amber-200" onClick={() => delivered(order.id)}>
                Delivered
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {orders.length === 0 ? (
        <Card className="mt-8 border-white/10 bg-white/10 p-8 text-center text-white/70">No hostel deliveries are assigned right now.</Card>
      ) : null}
    </section>
  );
}
