"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPaise } from "@/lib/utils";

type Restaurant = { id: string; name: string };
type SessionRef = { id: string; label: string };

type Order = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  status: "ORDER_CONFIRMED" | "REACHED_CAMPUS" | "DELIVERED" | "CANCELLED";
  paymentStatus: string;
  source: string;
  totalPaise: number;
  createdAt: string | Date;
  restaurant: { name: string };
  session: { id: string; label: string };
  items: { id: string; nameSnapshot: string; quantity: number }[];
};

const EMPTY_FILTERS = {
  search: "",
  status: "all",
  deliveryType: "all",
  source: "all",
  restaurantId: "all",
  sessionId: "all",
  dateFrom: "",
  dateTo: ""
};

function statusTone(status: Order["status"]) {
  if (status === "DELIVERED") return "green" as const;
  if (status === "REACHED_CAMPUS") return "amber" as const;
  if (status === "CANCELLED") return "red" as const;
  return "neutral" as const;
}

export function OrdersTable({
  initialOrders,
  initialTotal,
  pageSize,
  restaurants,
  sessions
}: {
  initialOrders: Order[];
  initialTotal: number;
  pageSize: number;
  restaurants: Restaurant[];
  sessions: SessionRef[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const firstRender = useRef(true);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== "all") params.set(key, value);
      });
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const response = await fetch(`/api/admin/orders?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load orders");
      setOrders(data.orders);
      setTotal(data.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  // Debounced refetch whenever filters or page change (skip the very first render).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(fetchOrders, 300);
    return () => clearTimeout(timer);
  }, [fetchOrders]);

  function updateFilter(patch: Partial<typeof EMPTY_FILTERS>) {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }

  function resetFilters() {
    setPage(1);
    setFilters(EMPTY_FILTERS);
  }

  async function bulkAction(url: string, label: string) {
    setBusyId(url);
    try {
      const response = await fetch(url, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`${data.count} ${label}`);
      await fetchOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function orderAction(order: Order, action: "reached" | "delivered" | "cancel", refund = false) {
    setBusyId(order.id);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "cancel" ? { action, refund } : { action })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed");
      toast.success(
        action === "reached" ? "Marked reached campus" : action === "delivered" ? "Marked delivered" : "Order cancelled"
      );
      await fetchOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  function confirmCancel(order: Order) {
    if (!window.confirm(`Cancel order ${order.trackingCode} for ${order.customerName}?`)) return;
    let refund = false;
    if (order.paymentStatus === "PAID_ONLINE") {
      refund = window.confirm("This order was paid online. Mark it as refunded too?");
    }
    orderAction(order, "cancel", refund);
  }

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Live orders"
        description={`${total} order${total === 1 ? "" : "s"} match${total === 1 ? "es" : ""}`}
        bodyClassName="p-0"
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!!busyId} onClick={() => bulkAction("/api/admin/orders/reached-campus", "orders marked reached campus")}>
              Mark all reached
            </Button>
            <Button variant="outline" size="sm" disabled={!!busyId} onClick={() => bulkAction("/api/admin/orders/release-deliveries", "hostel orders released")}>
              Assign delivery
            </Button>
            <Button variant="outline" size="sm" disabled={loading} onClick={fetchOrders}>
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
            onChange={(event) => updateFilter({ search: event.target.value })}
          />
          <Select value={filters.restaurantId} onChange={(event) => updateFilter({ restaurantId: event.target.value })}>
            <option value="all">All restaurants</option>
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </Select>
          <Select value={filters.status} onChange={(event) => updateFilter({ status: event.target.value })}>
            <option value="all">All statuses</option>
            <option value="ORDER_CONFIRMED">Order confirmed</option>
            <option value="REACHED_CAMPUS">Reached campus</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
          <Select value={filters.deliveryType} onChange={(event) => updateFilter({ deliveryType: event.target.value })}>
            <option value="all">All delivery types</option>
            <option value="GATE">Gate</option>
            <option value="HOSTEL">Hostel</option>
          </Select>
          <Select value={filters.source} onChange={(event) => updateFilter({ source: event.target.value })}>
            <option value="all">All sources</option>
            <option value="CUSTOMER_ONLINE">Customer online</option>
            <option value="ADMIN_MANUAL">Admin manual</option>
          </Select>
          <Select value={filters.sessionId} onChange={(event) => updateFilter({ sessionId: event.target.value })}>
            <option value="all">All sessions</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label}
              </option>
            ))}
          </Select>
          <label className="text-xs font-medium text-neutral-500">
            From
            <Input className="mt-1" type="date" value={filters.dateFrom} onChange={(event) => updateFilter({ dateFrom: event.target.value })} />
          </label>
          <label className="text-xs font-medium text-neutral-500">
            To
            <Input className="mt-1" type="date" value={filters.dateTo} onChange={(event) => updateFilter({ dateTo: event.target.value })} />
          </label>
          {hasActiveFilters ? (
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>

        <div className={`divide-y divide-neutral-100 ${loading ? "opacity-60" : ""}`}>
          {orders.map((order) => (
            <div key={order.id} className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{order.customerName}</p>
                  <Badge>{order.trackingCode}</Badge>
                  <Badge tone={statusTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge>
                  <Badge tone={order.paymentStatus.includes("PAID") ? "green" : order.paymentStatus === "REFUNDED" ? "amber" : "red"}>
                    {order.paymentStatus.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  {order.restaurant.name} · {order.customerPhone} · {order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Gate"} · {order.session.label}
                </p>
                <p className="mt-1 text-sm text-neutral-600">{order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {order.source.replaceAll("_", " ")} · {new Date(order.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 lg:items-end">
                <p className="text-lg font-bold">{formatPaise(order.totalPaise)}</p>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {order.status === "ORDER_CONFIRMED" ? (
                    <Button size="sm" variant="outline" disabled={busyId === order.id} onClick={() => orderAction(order, "reached")}>
                      Mark reached
                    </Button>
                  ) : null}
                  {order.status === "REACHED_CAMPUS" ? (
                    <Button size="sm" variant="outline" disabled={busyId === order.id} onClick={() => orderAction(order, "delivered")}>
                      Mark delivered
                    </Button>
                  ) : null}
                  {order.status === "ORDER_CONFIRMED" || order.status === "REACHED_CAMPUS" ? (
                    <Button size="sm" variant="destructive" disabled={busyId === order.id} onClick={() => confirmCancel(order)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {!orders.length ? (
            <div className="p-8 text-center text-neutral-500">{loading ? "Loading..." : "No orders match these filters."}</div>
          ) : null}
        </div>

        {total > 0 ? (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-100 p-4 sm:flex-row sm:p-5">
            <p className="text-sm text-neutral-500">
              Page {page} of {totalPages} · showing {orders.length} of {total}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
