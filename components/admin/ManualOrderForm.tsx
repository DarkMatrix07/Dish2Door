"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPaise } from "@/lib/utils";

type Restaurant = {
  id: string;
  name: string;
  courses: { id: string; name: string }[];
  menuItems: { id: string; name: string; pricePaise: number; courseId: string; available: boolean }[];
};

type DraftItem = { menuItemId: string; quantity: number };

export function ManualOrderForm({ restaurants }: { restaurants: Restaurant[] }) {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState(restaurants[0]?.id ?? "");
  const [courseId, setCourseId] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
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

  const cartTotal = useMemo(
    () =>
      items.reduce((total, draft) => {
        const menuItem = restaurant?.menuItems.find((item) => item.id === draft.menuItemId);
        return total + (menuItem ? menuItem.pricePaise * draft.quantity : 0);
      }, 0),
    [items, restaurant]
  );

  function addItem() {
    if (!menuItemId) return;
    setItems((current) => {
      const existing = current.find((item) => item.menuItemId === menuItemId);
      if (existing) {
        return current.map((item) => (item.menuItemId === menuItemId ? { ...item, quantity: item.quantity + quantity } : item));
      }
      return [...current, { menuItemId, quantity }];
    });
    setMenuItemId("");
    setQuantity(1);
  }

  async function createManualOrder() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer, items, paymentStatus: customer.paymentStatus })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create manual order");
      toast.success(`Manual order created. Passcode: ${data.passcode}`);
      setItems([]);
      setCustomer({ name: "", email: "", phone: "", deliveryType: "GATE", hostelBlock: "", paymentStatus: "PAID_MANUALLY" });
      router.push("/admin/orders");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="Customer & delivery" description="Use for phone, cash, direct UPI, or staff-created orders. No Razorpay required.">
        <div className="grid gap-3">
          <Input placeholder="Customer name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} />
          <Input placeholder="Phone number" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} />
          <Input placeholder="Email (optional)" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={customer.deliveryType} onChange={(event) => setCustomer({ ...customer, deliveryType: event.target.value })}>
              <option value="GATE">Gate</option>
              <option value="HOSTEL">Hostel</option>
            </Select>
            <Select value={customer.paymentStatus} onChange={(event) => setCustomer({ ...customer, paymentStatus: event.target.value })}>
              <option value="PAID_MANUALLY">Paid manually</option>
              <option value="UNPAID">Unpaid</option>
            </Select>
          </div>
          {customer.deliveryType === "HOSTEL" ? (
            <Input placeholder="Hostel block" value={customer.hostelBlock} onChange={(event) => setCustomer({ ...customer, hostelBlock: event.target.value })} />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Items" description="Pick a restaurant, then add items to the order.">
        <div className="grid gap-3">
          <Select
            value={restaurantId}
            onChange={(event) => {
              setRestaurantId(event.target.value);
              setCourseId("");
              setMenuItemId("");
              setItems([]);
            }}
          >
            {restaurants.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">All courses</option>
            {restaurant?.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-[1fr_84px] gap-2">
            <Select value={menuItemId} onChange={(event) => setMenuItemId(event.target.value)}>
              <option value="">Select item</option>
              {visibleItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - {formatPaise(item.pricePaise)}
                </option>
              ))}
            </Select>
            <Input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
          </div>
          <Button variant="outline" onClick={addItem}>
            Add item
          </Button>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
            {items.length ? (
              <div className="space-y-2">
                {items.map((draft) => {
                  const menuItem = restaurant?.menuItems.find((item) => item.id === draft.menuItemId);
                  return (
                    <div key={draft.menuItemId} className="flex items-center justify-between gap-3">
                      <span>
                        {draft.quantity}x {menuItem?.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-500">{menuItem ? formatPaise(menuItem.pricePaise * draft.quantity) : ""}</span>
                        <button
                          className="font-semibold text-red-600"
                          onClick={() => setItems(items.filter((item) => item.menuItemId !== draft.menuItemId))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-neutral-200 pt-2 font-bold">
                  <span>Items subtotal</span>
                  <span>{formatPaise(cartTotal)}</span>
                </div>
              </div>
            ) : (
              <span className="text-neutral-500">No items added.</span>
            )}
          </div>

          <Button disabled={!items.length || submitting} onClick={createManualOrder}>
            {submitting ? "Creating..." : "Create order"}
          </Button>
          <p className="text-xs text-neutral-400">Platform and delivery fees are added automatically based on settings.</p>
        </div>
      </SectionCard>
    </div>
  );
}
