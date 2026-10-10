"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown, type DropdownOption } from "@/components/ui/dropdown";
import { readApiJson } from "@/lib/api-client";
import { HOSTEL_BLOCKS } from "@/lib/hostels";
import { formatPaise } from "@/lib/utils";

type Restaurant = {
  id: string;
  name: string;
  courses: { id: string; name: string }[];
  menuItems: { id: string; name: string; pricePaise: number; courseId: string; available: boolean }[];
};

type DraftItem = { menuItemId: string; quantity: number };

type CampusRef = { id: string; code: string; name: string };

const DELIVERY_OPTIONS: DropdownOption[] = [
  { value: "GATE", label: "Gate" },
  { value: "HOSTEL", label: "Hostel" }
];
const PAYMENT_OPTIONS: DropdownOption[] = [
  { value: "PAID_MANUALLY", label: "Paid manually" },
  { value: "UNPAID", label: "Unpaid" }
];
const SLOT_OPTIONS: DropdownOption[] = [
  { value: "AFTERNOON", label: "Deliver by afternoon" },
  { value: "NIGHT", label: "Deliver by night" }
];
const HOSTEL_OPTIONS: DropdownOption[] = HOSTEL_BLOCKS.map((block) => ({ value: block, label: block }));

// Same small label the Dropdown shows above itself, so text boxes and dropdowns line up.
function TextField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

export function ManualOrderForm({ restaurants, campuses }: { restaurants: Restaurant[]; campuses: CampusRef[] }) {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState(restaurants[0]?.id ?? "");
  const [courseId, setCourseId] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // The campus decides the fees applied and whether hostel delivery is allowed, so a
  // counter order has to name one just like a customer order does.
  const defaultCampusCode = campuses[0]?.code ?? "";
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    campusCode: defaultCampusCode,
    deliveryType: "GATE",
    hostelBlock: "",
    orderSlot: "AFTERNOON",
    paymentStatus: "PAID_MANUALLY"
  });

  const restaurant = restaurants.find((item) => item.id === restaurantId);
  const visibleItems = useMemo(() => {
    if (!restaurant) return [];
    if (!courseId) return restaurant.menuItems;
    return restaurant.menuItems.filter((item) => item.courseId === courseId);
  }, [courseId, restaurant]);

  const campusOptions = useMemo(() => campuses.map((campus) => ({ value: campus.code, label: campus.name })), [campuses]);
  const restaurantOptions = useMemo(() => restaurants.map((item) => ({ value: item.id, label: item.name })), [restaurants]);
  const courseOptions = useMemo(
    () => [{ value: "", label: "All courses" }, ...(restaurant?.courses ?? []).map((course) => ({ value: course.id, label: course.name }))],
    [restaurant]
  );
  const itemOptions = useMemo(() => visibleItems.map((item) => ({ value: item.id, label: `${item.name} - ${formatPaise(item.pricePaise)}` })), [visibleItems]);

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
      const data = await readApiJson<{ error?: string; passcode?: string }>(response, "Could not create manual order");
      if (!response.ok) throw new Error(data.error ?? "Could not create manual order");
      toast.success(`Manual order created. Passcode: ${data.passcode}`);
      setItems([]);
      setCustomer({ name: "", email: "", phone: "", campusCode: defaultCampusCode, deliveryType: "GATE", hostelBlock: "", orderSlot: "AFTERNOON", paymentStatus: "PAID_MANUALLY" });
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
          <TextField label="Customer name"><Input placeholder="Customer name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></TextField>
          <TextField label="Phone number"><Input inputMode="tel" placeholder="Phone number" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></TextField>
          <TextField label="Email (optional)"><Input placeholder="Email (optional)" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></TextField>
          {campuses.length > 1 ? (
            <Dropdown
              label="Campus"
              value={customer.campusCode}
              onChange={(campusCode) => setCustomer({ ...customer, campusCode })}
              options={campusOptions}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Dropdown label="Delivery type" value={customer.deliveryType} onChange={(deliveryType) => setCustomer({ ...customer, deliveryType })} options={DELIVERY_OPTIONS} />
            <Dropdown label="Payment" value={customer.paymentStatus} onChange={(paymentStatus) => setCustomer({ ...customer, paymentStatus })} options={PAYMENT_OPTIONS} />
          </div>
          {customer.deliveryType === "HOSTEL" ? (
            <Dropdown
              label="Hostel block"
              placeholder="Select hostel block"
              value={customer.hostelBlock}
              onChange={(hostelBlock) => setCustomer({ ...customer, hostelBlock })}
              options={HOSTEL_OPTIONS}
            />
          ) : null}
          <Dropdown label="Delivery time" value={customer.orderSlot} onChange={(orderSlot) => setCustomer({ ...customer, orderSlot })} options={SLOT_OPTIONS} />
        </div>
      </SectionCard>

      <SectionCard title="Items" description="Pick a restaurant, then add items to the order.">
        <div className="grid gap-3">
          <Dropdown
            label="Restaurant"
            value={restaurantId}
            onChange={(id) => {
              setRestaurantId(id);
              setCourseId("");
              setMenuItemId("");
              setItems([]);
            }}
            options={restaurantOptions}
            searchPlaceholder="Search restaurants"
          />
          <Dropdown label="Course" value={courseId} onChange={setCourseId} options={courseOptions} />
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-end gap-2">
            <Dropdown label="Item" placeholder="Select item" value={menuItemId} onChange={setMenuItemId} options={itemOptions} searchPlaceholder="Search items" />
            <TextField label="Qty"><Input type="number" inputMode="numeric" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></TextField>
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
                      <span className="min-w-0 break-words">
                        {draft.quantity}x {menuItem?.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-neutral-500">{menuItem ? formatPaise(menuItem.pricePaise * draft.quantity) : ""}</span>
                        <button
                          type="button"
                          className="min-h-9 rounded-lg px-2 font-semibold text-red-600 hover:bg-red-50"
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
