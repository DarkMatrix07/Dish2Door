"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampusBadge, campusLabel } from "@/components/admin/CampusBadge";
import { formatPaise } from "@/lib/utils";

type Item = { id: string; nameSnapshot: string; quantity: number };
type Campus = { id: string; code: string; name: string; sortOrder: number } | null;

type Order = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  orderSlot: "AFTERNOON" | "NIGHT" | null;
  status: string;
  totalPaise: number;
  createdAt: string;
  campus: Campus;
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

// Same rationale as the main today's-orders view: campus is the outermost grouping
// since VIT-AP and SRM-AP are prepared/delivered separately. Unassigned orders sort last.
function campusSortKey(campus: Campus): number {
  return campus ? campus.sortOrder : Number.MAX_SAFE_INTEGER;
}

function groupByCampus(orders: Order[]) {
  const map = new Map<string, { campus: Campus; orders: Order[] }>();
  for (const order of orders) {
    const key = order.campus?.id ?? "unassigned";
    if (!map.has(key)) map.set(key, { campus: order.campus, orders: [] });
    map.get(key)!.orders.push(order);
  }
  return [...map.values()].sort(
    (a, b) => campusSortKey(a.campus) - campusSortKey(b.campus) || campusLabel(a.campus).localeCompare(campusLabel(b.campus))
  );
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

export function PizzaTodaysOrders({ orders, dateLabel, restaurantName }: { orders: Order[]; dateLabel: string; restaurantName: string }) {
  const counts = useMemo(
    () => ({
      total: orders.length,
      afternoon: orders.filter((o) => o.orderSlot === "AFTERNOON").length,
      night: orders.filter((o) => o.orderSlot === "NIGHT").length,
      none: orders.filter((o) => !o.orderSlot).length
    }),
    [orders]
  );

  const campusGroups = useMemo(() => groupByCampus(orders), [orders]);

  function renderSlots(campusOrders: Order[], keyPrefix: string) {
    return SLOTS.map((slot) => {
      const slotOrders = campusOrders.filter((o) => slotOf(o) === slot.key);
      if (!slotOrders.length) return null;
      return (
        <SectionCard key={`${keyPrefix}-${slot.key}`} title={`${slot.label} · ${slotOrders.length}`} bodyClassName="p-4 sm:p-5">
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              To prepare: {aggregateItems(slotOrders).map(([n, q]) => `${q}× ${n}`).join(", ")}
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {slotOrders.map((order) => (
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
        </SectionCard>
      );
    });
  }

  function generatePdf(slotKey: "AFTERNOON" | "NIGHT") {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error("Allow pop-ups to generate the PDF.");
      return;
    }

    const slotLabel = slotKey === "NIGHT" ? "Deliver by Night" : "Deliver by Afternoon";
    const slotWord = slotKey === "NIGHT" ? "Night" : "Afternoon";
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fileTitle = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${restaurantName} ${slotWord} orders ${pad(
      now.getHours()
    )}-${pad(now.getMinutes())}`;
    const slotOrders = orders.filter((o) => slotOf(o) === slotKey);
    const campusGroups = groupByCampus(slotOrders);
    const body = campusGroups
      .map(({ campus, orders: campusOrders }, campusIndex) => {
        const summary = aggregateItems(campusOrders)
          .map(([itemName, qty]) => `${qty}× ${escapeHtml(itemName)}`)
          .join(", ");
        const rows = campusOrders
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
        return `<section class="campus${campusIndex > 0 ? " page-break" : ""}">
          <h1 class="campus-heading">${escapeHtml(campusLabel(campus))} <span class="muted">(${campusOrders.length} order${campusOrders.length === 1 ? "" : "s"})</span></h1>
          <p class="summary campus-summary"><strong>To prepare:</strong> ${summary}</p>
          <table>
            <thead><tr><th>#</th><th>Customer</th><th>Delivery</th><th>Items</th><th class="right">Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
      })
      .join("");

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(fileTitle)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 28px; }
        h1 { margin: 0 0 2px; font-size: 22px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 18px; }
        section.campus { margin-bottom: 22px; page-break-inside: avoid; }
        section.campus.page-break { page-break-before: always; }
        .campus-heading { font-size: 20px; border-bottom: 3px solid #111; padding-bottom: 6px; margin: 6px 0 8px; }
        .campus-summary { background: #eef2ff; }
        .summary { font-size: 12px; margin: 0 0 6px; background: #fff7ed; padding: 6px 8px; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; vertical-align: top; }
        th { background: #f3f4f6; }
        .right { text-align: right; white-space: nowrap; }
        .muted { color: #666; font-weight: normal; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>Dish2Door — ${escapeHtml(restaurantName)} · ${escapeHtml(slotLabel)}</h1>
      <div class="meta">${escapeHtml(dateLabel)} · ${slotOrders.length} order${slotOrders.length === 1 ? "" : "s"}</div>
      ${body || "<p>No orders in this slot.</p>"}
      </body></html>`);
    win.document.close();
    win.document.title = fileTitle;
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid w-full flex-1 gap-3 min-[430px]:grid-cols-3 sm:max-w-md">
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
          <p className="p-4 text-center text-neutral-500">No confirmed orders for today so far.</p>
        </SectionCard>
      ) : campusGroups.length <= 1 ? (
        <div className="space-y-5">
          {campusGroups.length === 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <CampusBadge campus={campusGroups[0].campus} />
              <p className="text-xs text-neutral-500">
                To prepare: {aggregateItems(campusGroups[0].orders).map(([n, q]) => `${q}× ${n}`).join(", ")}
              </p>
            </div>
          ) : null}
          {renderSlots(orders, "all")}
        </div>
      ) : (
        campusGroups.map(({ campus, orders: campusOrders }) => (
          <div key={campus?.id ?? "unassigned"} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-2">
              <h3 className="text-base font-black text-neutral-900">{campusLabel(campus)}</h3>
              <Badge tone="amber">{campusOrders.length}</Badge>
            </div>
            <p className="text-xs text-neutral-500">
              To prepare: {aggregateItems(campusOrders).map(([n, q]) => `${q}× ${n}`).join(", ")}
            </p>
            <div className="space-y-5">{renderSlots(campusOrders, campus?.id ?? "unassigned")}</div>
          </div>
        ))
      )}
    </div>
  );
}
