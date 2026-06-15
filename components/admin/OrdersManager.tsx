"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPaise } from "@/lib/utils";

type Restaurant = {
  id: string;
  name: string;
  courses: { id: string; name: string }[];
  menuItems: { id: string; name: string; pricePaise: number; courseId: string; available: boolean }[];
};

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

type DraftItem = {
  menuItemId: string;
  quantity: number;
};

export function OrdersManager({ initialOrders, restaurants }: { initialOrders: Order[]; restaurants: Restaurant[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [restaurantId, setRestaurantId] = useState(restaurants[0]?.id ?? "");
  const [courseId, setCourseId] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    restaurant: "all",
    status: "all",
    deliveryType: "all",
    source: "all",
    session: "all"
  });
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    deliveryType: "GATE",
    hostelBlock: "",
    paymentStatus: "PAID_MANUALLY"
  });

  const restaurant = restaurants.find((item) => item.id === restaurantId);
  const visibleItems = useMemo(() => {
    if (!restaurant) return [];
    if (!courseId) return restaurant.menuItems;
    return restaurant.menuItems.filter((item) => item.courseId === courseId);
  }, [courseId, restaurant]);
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
  const orderStats = useMemo(
    () => ({
      total: orders.length,
      confirmed: orders.filter((order) => order.status === "ORDER_CONFIRMED").length,
      reached: orders.filter((order) => order.status === "REACHED_CAMPUS").length,
      delivered: orders.filter((order) => order.status === "DELIVERED").length,
      hostel: orders.filter((order) => order.deliveryType === "HOSTEL").length
    }),
    [orders]
  );

  async function refreshOrders() {
    const response = await fetch("/api/admin/orders");
    const data = await response.json();
    setOrders(data.orders);
  }

  function addItem() {
    if (!menuItemId) return;
    setItems((current) => {
      const existing = current.find((item) => item.menuItemId === menuItemId);
      if (existing) {
        return current.map((item) =>
          item.menuItemId === menuItemId ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...current, { menuItemId, quantity }];
    });
    setMenuItemId("");
    setQuantity(1);
  }

  async function createManualOrder() {
    try {
      const response = await fetch("/api/admin/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          items,
          paymentStatus: customer.paymentStatus
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create manual order");
      toast.success(`Manual order created. Passcode: ${data.passcode}`);
      setItems([]);
      setCustomer({ name: "", email: "", phone: "", deliveryType: "GATE", hostelBlock: "", paymentStatus: "PAID_MANUALLY" });
      await refreshOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create order");
    }
  }

  async function markReachedCampus() {
    try {
      const response = await fetch("/api/admin/orders/reached-campus", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update orders");
      toast.success(`${data.count} orders marked reached campus`);
      await refreshOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update orders");
    }
  }

  async function releaseDeliveries() {
    try {
      const response = await fetch("/api/admin/orders/release-deliveries", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not release deliveries");
      toast.success(`${data.count} hostel orders released`);
      await refreshOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release deliveries");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Orders", orderStats.total, "All recent orders"],
          ["Confirmed", orderStats.confirmed, "Need campus arrival"],
          ["Reached", orderStats.reached, "Ready for handoff"],
          ["Delivered", orderStats.delivered, "Completed"],
          ["Hostel", orderStats.hostel, "Delivery-sensitive"]
        ].map(([label, value, helper]) => (
          <Card key={label} className="border-0 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
            <p className="mt-1 text-xs text-neutral-400">{helper}</p>
          </Card>
        ))}
      </div>

    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card className="h-fit border border-amber-200 bg-[#fffaf1] p-5 text-neutral-950 shadow-xl shadow-amber-900/5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Counter order</p>
        <h3 className="mt-2 text-2xl font-black">Create manual order</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-600">Use this for phone, cash, direct UPI, or staff-created orders. No Razorpay required.</p>
        <div className="mt-4 grid gap-3">
          <Input className="bg-white text-neutral-950" placeholder="Customer name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} />
          <Input className="bg-white text-neutral-950" placeholder="Phone number" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} />
          <Input className="bg-white text-neutral-950" placeholder="Email optional" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} />
          <Select value={customer.deliveryType} onChange={(event) => setCustomer({ ...customer, deliveryType: event.target.value })}>
            <option value="GATE">Gate</option>
            <option value="HOSTEL">Hostel</option>
          </Select>
          {customer.deliveryType === "HOSTEL" ? (
            <Input className="bg-white text-neutral-950" placeholder="Hostel block" value={customer.hostelBlock} onChange={(event) => setCustomer({ ...customer, hostelBlock: event.target.value })} />
          ) : null}
          <Select value={customer.paymentStatus} onChange={(event) => setCustomer({ ...customer, paymentStatus: event.target.value })}>
            <option value="PAID_MANUALLY">Paid manually</option>
            <option value="UNPAID">Unpaid</option>
          </Select>
          <Select value={restaurantId} onChange={(event) => {
            setRestaurantId(event.target.value);
            setCourseId("");
            setMenuItemId("");
            setItems([]);
          }}>
            {restaurants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">All courses</option>
            {restaurant?.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </Select>
          <div className="grid grid-cols-[1fr_84px] gap-2">
            <Select value={menuItemId} onChange={(event) => setMenuItemId(event.target.value)}>
              <option value="">Select item</option>
              {visibleItems.map((item) => <option key={item.id} value={item.id}>{item.name} - {formatPaise(item.pricePaise)}</option>)}
            </Select>
            <Input className="bg-white text-neutral-950" type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
          </div>
          <Button variant="outline" onClick={addItem}>Add item</Button>
          <div className="rounded-2xl bg-white p-3 text-sm shadow-sm">
            {items.length ? items.map((draft) => {
              const menuItem = restaurant?.menuItems.find((item) => item.id === draft.menuItemId);
              return (
                <div key={draft.menuItemId} className="flex justify-between">
                  <span>{draft.quantity}x {menuItem?.name}</span>
                  <button className="font-bold text-amber-700" onClick={() => setItems(items.filter((item) => item.menuItemId !== draft.menuItemId))}>Remove</button>
                </div>
              );
            }) : <span className="text-neutral-500">No items added.</span>}
          </div>
          <Button className="bg-neutral-950 text-white hover:bg-neutral-800" disabled={!items.length} onClick={createManualOrder}>Create order</Button>
        </div>
      </Card>

      <Card className="overflow-hidden border-0 bg-white shadow-sm">
        <div className="border-b border-neutral-100 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-xl font-black">Recent orders</h3>
              <p className="mt-1 text-sm text-neutral-500">{filteredOrders.length} of {orders.length} orders shown</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={markReachedCampus}>Mark all reached</Button>
              <Button variant="outline" size="sm" onClick={releaseDeliveries}>Assign delivery</Button>
              <Button variant="outline" size="sm" onClick={refreshOrders}>Refresh</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <Input placeholder="Search name, phone, tracking, item" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
            <Select value={filters.restaurant} onChange={(event) => setFilters({ ...filters, restaurant: event.target.value })}>
              <option value="all">All restaurants</option>
              {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.name}>{restaurant.name}</option>)}
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
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
            </Select>
          </div>
        </div>
        <div className="divide-y divide-neutral-100">
          {filteredOrders.map((order) => (
            <div key={order.id} className="grid gap-4 p-5 xl:grid-cols-[1.3fr_220px_150px] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black">{order.customerName}</p>
                  <Badge>{order.trackingCode}</Badge>
                  <Badge tone={order.status === "DELIVERED" ? "green" : order.status === "REACHED_CAMPUS" ? "amber" : "neutral"}>
                    {order.status.replaceAll("_", " ")}
                  </Badge>
                  <Badge tone={order.paymentStatus.includes("PAID") ? "green" : "red"}>{order.paymentStatus.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  {order.restaurant.name} - {order.customerPhone} - {order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Gate"} - {order.session.label}
                </p>
                <p className="mt-1 text-sm text-neutral-700">
                  {order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}
                </p>
              </div>
              <div className="rounded-2xl bg-neutral-50 p-3 text-sm">
                <p className="font-bold text-neutral-500">Source</p>
                <p className="mt-1 font-black">{order.source.replaceAll("_", " ")}</p>
                <p className="mt-2 text-neutral-500">Delivery: {order.deliveryType}</p>
              </div>
              <div className="text-left xl:text-right">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">Total</p>
                <p className="mt-1 text-xl font-black">{formatPaise(order.totalPaise)}</p>
              </div>
            </div>
          ))}
          {!filteredOrders.length ? (
            <div className="p-8 text-center text-neutral-500">No orders match these filters.</div>
          ) : null}
        </div>
      </Card>
    </div>
    </div>
  );
}
