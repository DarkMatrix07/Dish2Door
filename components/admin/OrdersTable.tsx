"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPaise } from "@/lib/utils";

type Restaurant = { id: string; name: string };

type Order = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  status: "ORDER_CONFIRMED" | "REACHED_CAMPUS" | "DELIVERED" | "CANCELLED";
  paymentStatus: string;
  source: string;
  totalPaise: number;
  restaurant: { name: string };
  session: { id: string; label: string };
  items: { id: string; nameSnapshot: string; quantity: number }[];
};

export function OrdersTable({ initialOrders, restaurants }: { initialOrders: Order[]; restaurants: Restaurant[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busy, setBusy] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    restaurant: "all",
    status: "all",
    deliveryType: "all",
    source: "all",
    session: "all"
  });

  const sessions = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => map.set(order.session.id, order.session.label));
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return orders.filter((order) => {
      const searchable = `${order.customerName} ${order.customerPhone} ${order.trackingCode} ${order.items
        .map((item) => item.nameSnapshot)
        .join(" ")}`.toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (filters.restaurant === "all" || order.restaurant.name === filters.restaurant) &&
        (filters.status === "all" || order.status === filters.status) &&
        (filters.deliveryType === "all" || order.deliveryType === filters.deliveryType) &&
        (filters.source === "all" || order.source === filters.source) &&
        (filters.session === "all" || order.session.id === filters.session)
      );
    });
  }, [filters, orders]);

  const stats = useMemo(
    () => ({
      total: orders.length,
      confirmed: orders.filter((order) => order.status === "ORDER_CONFIRMED").length,
      reached: orders.filter((order) => order.status === "REACHED_CAMPUS").length,
      delivered: orders.filter((order) => order.status === "DELIVERED").length
    }),
    [orders]
  );

  async function refreshOrders() {
    const response = await fetch("/api/admin/orders");
    const data = await response.json();
    setOrders(data.orders);
  }

  async function bulkAction(url: string, label: string) {
    setBusy(url);
    try {
      const response = await fetch(url, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`${data.count} ${label}`);
      await refreshOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Orders" value={stats.total} helper="All recent orders" />
        <StatCard label="Confirmed" value={stats.confirmed} helper="Need campus arrival" />
        <StatCard label="Reached" value={stats.reached} helper="Ready for handoff" />
        <StatCard label="Delivered" value={stats.delivered} helper="Completed" />
      </div>

      <SectionCard
        title="Live orders"
        description={`${filteredOrders.length} of ${orders.length} shown`}
        bodyClassName="p-0"
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => bulkAction("/api/admin/orders/reached-campus", "orders marked reached campus")}>
              Mark all reached
            </Button>
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => bulkAction("/api/admin/orders/release-deliveries", "hostel orders released")}>
              Assign delivery
            </Button>
            <Button variant="outline" size="sm" disabled={!!busy} onClick={refreshOrders}>
              Refresh
            </Button>
            <Link href="/admin/orders/new">
              <Button size="sm">+ Manual order</Button>
            </Link>
          </>
        }
      >
        <div className="grid gap-2 border-b border-neutral-100 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
          <Input
            placeholder="Search name, phone, tracking, item"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
          <Select value={filters.restaurant} onChange={(event) => setFilters({ ...filters, restaurant: event.target.value })}>
            <option value="all">All restaurants</option>
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.name}>
                {restaurant.name}
              </option>
            ))}
          </Select>
          <Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="all">All statuses</option>
            <option value="ORDER_CONFIRMED">Order confirmed</option>
            <option value="REACHED_CAMPUS">Reached campus</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
          <Select value={filters.deliveryType} onChange={(event) => setFilters({ ...filters, deliveryType: event.target.value })}>
            <option value="all">All delivery types</option>
            <option value="GATE">Gate</option>
            <option value="HOSTEL">Hostel</option>
          </Select>
          <Select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
            <option value="all">All sources</option>
            <option value="CUSTOMER_ONLINE">Customer online</option>
            <option value="ADMIN_MANUAL">Admin manual</option>
          </Select>
          <Select value={filters.session} onChange={(event) => setFilters({ ...filters, session: event.target.value })}>
            <option value="all">All sessions</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="divide-y divide-neutral-100">
          {filteredOrders.map((order) => (
            <div key={order.id} className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{order.customerName}</p>
                  <Badge>{order.trackingCode}</Badge>
                  <Badge tone={order.status === "DELIVERED" ? "green" : order.status === "REACHED_CAMPUS" ? "amber" : "neutral"}>
                    {order.status.replaceAll("_", " ")}
                  </Badge>
                  <Badge tone={order.paymentStatus.includes("PAID") ? "green" : "red"}>{order.paymentStatus.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  {order.restaurant.name} · {order.customerPhone} · {order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Gate"} · {order.session.label}
                </p>
                <p className="mt-1 text-sm text-neutral-600">{order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}</p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 lg:flex-col lg:items-end lg:justify-center">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">{order.source.replaceAll("_", " ")}</span>
                <p className="text-lg font-bold">{formatPaise(order.totalPaise)}</p>
              </div>
            </div>
          ))}
          {!filteredOrders.length ? <div className="p-8 text-center text-neutral-500">No orders match these filters.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}
