"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/utils";

type Item = { id: string; nameSnapshot: string; quantity: number };

type Order = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  orderSlot: "AFTERNOON" | "NIGHT" | null;
  status: string;
  paymentStatus: string;
  totalPaise: number;
  createdAt: string;
  restaurant: { name: string };
  items: Item[];
};

const SLOTS: { key: "AFTERNOON" | "NIGHT" | "NONE"; label: string }[] = [
  { key: "AFTERNOON", label: "Deliver by Afternoon" },
  { key: "NIGHT", label: "Deliver by Night" },
  { key: "NONE", label: "No slot set" }
];

function slotOf(order: Order): "AFTERNOON" | "NIGHT" | "NONE" {
  return order.orderSlot ?? "NONE";
}

function groupByRestaurant(orders: Order[]) {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    const key = order.restaurant.name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(order);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function aggregateItems(orders: Order[]) {
  const map = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      map.set(item.nameSnapshot, (map.get(item.nameSnapshot) ?? 0) + item.quantity);
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function deliveryLabel(order: Order) {
  return order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock ?? ""}`.trim() : "Gate";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function TodaysOrders({ orders, dateLabel }: { orders: Order[]; dateLabel: string }) {
  const counts = useMemo(
    () => ({
      total: orders.length,
      afternoon: orders.filter((o) => o.orderSlot === "AFTERNOON").length,
      night: orders.filter((o) => o.orderSlot === "NIGHT").length,
      none: orders.filter((o) => !o.orderSlot).length
    }),
    [orders]
  );

  function generatePdf(slotKey: "AFTERNOON" | "NIGHT") {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error("Allow pop-ups to generate the PDF.");
      return;
    }

    const slotLabel = slotKey === "NIGHT" ? "Deliver by Night" : "Deliver by Afternoon";
    const slotOrders = orders.filter((o) => slotOf(o) === slotKey);
    const restaurants = groupByRestaurant(slotOrders);
    const body = restaurants
      .map(([name, restaurantOrders]) => {
        const summary = aggregateItems(restaurantOrders)
          .map(([itemName, qty]) => `${qty}× ${escapeHtml(itemName)}`)
          .join(", ");
        const rows = restaurantOrders
          .map(
            (o, i) => `<tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(o.customerName)}<br><span class="muted">${escapeHtml(o.customerPhone)}</span></td>
                <td>${escapeHtml(deliveryLabel(o))}</td>
                <td>${o.items.map((it) => `${it.quantity}× ${escapeHtml(it.nameSnapshot)}`).join("<br>")}</td>
                <td class="right">${formatPaise(o.totalPaise)}</td>
              </tr>`
          )
          .join("");
        return `<section class="restaurant">
          <h2>${escapeHtml(name)} <span class="muted">(${restaurantOrders.length} order${restaurantOrders.length === 1 ? "" : "s"})</span></h2>
          <p class="summary"><strong>To prepare:</strong> ${summary}</p>
          <table>
            <thead><tr><th>#</th><th>Customer</th><th>Delivery</th><th>Items</th><th class="right">Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
      })
      .join("");

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Dish2Door — ${escapeHtml(slotLabel)} — ${escapeHtml(dateLabel)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 28px; }
        h1 { margin: 0 0 2px; font-size: 22px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 18px; }
        section.restaurant { margin-bottom: 22px; page-break-inside: avoid; }
        h2 { font-size: 17px; border-bottom: 2px solid #111; padding-bottom: 4px; margin: 18px 0 8px; }
        .summary { font-size: 12px; margin: 0 0 6px; background: #fff7ed; padding: 6px 8px; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; vertical-align: top; }
        th { background: #f3f4f6; }
        .right { text-align: right; white-space: nowrap; }
        .muted { color: #666; font-weight: normal; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>Dish2Door — ${escapeHtml(slotLabel)}</h1>
      <div class="meta">${escapeHtml(dateLabel)} · ${slotOrders.length} order${slotOrders.length === 1 ? "" : "s"}</div>
      ${body || "<p>No orders in this slot.</p>"}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-3 gap-3 sm:max-w-md">
          <StatCard label="Today" value={counts.total} helper="orders" />
          <StatCard label="Afternoon" value={counts.afternoon} />
          <StatCard label="Night" value={counts.night} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => generatePdf("AFTERNOON")} disabled={!counts.afternoon}>
            <FileDown size={16} className="-ml-1 mr-1" />
            Afternoon PDF
          </Button>
          <Button onClick={() => generatePdf("NIGHT")} disabled={!counts.night}>
            <FileDown size={16} className="-ml-1 mr-1" />
            Night PDF
          </Button>
        </div>
      </div>

      {!orders.length ? (
        <SectionCard title="No orders yet">
          <p className="p-4 text-center text-neutral-500">No orders for today so far.</p>
        </SectionCard>
      ) : (
        SLOTS.map((slot) => {
          const slotOrders = orders.filter((o) => slotOf(o) === slot.key);
          if (!slotOrders.length) return null;
          const restaurants = groupByRestaurant(slotOrders);
          return (
            <SectionCard key={slot.key} title={`${slot.label} · ${slotOrders.length}`} bodyClassName="p-4 sm:p-5">
              <div className="space-y-5">
                {restaurants.map(([name, restaurantOrders]) => (
                  <div key={name}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-black uppercase tracking-wide text-neutral-800">{name}</h4>
                      <Badge tone="amber">{restaurantOrders.length}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      To prepare: {aggregateItems(restaurantOrders).map(([n, q]) => `${q}× ${n}`).join(", ")}
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {restaurantOrders.map((order) => (
                        <div key={order.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{order.customerName}</span>
                            <span className="font-black">{formatPaise(order.totalPaise)}</span>
                          </div>
                          <p className="text-xs text-neutral-500">
                            {order.customerPhone} · {deliveryLabel(order)} · {order.trackingCode}
                          </p>
                          <p className="mt-1 text-neutral-700">
                            {order.items.map((it) => `${it.quantity}× ${it.nameSnapshot}`).join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
