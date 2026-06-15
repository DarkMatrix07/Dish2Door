"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPaise } from "@/lib/utils";

type MenuItem = {
  id: string;
  name: string;
  pricePaise: number;
  discountPercent: number;
  available: boolean;
};

type Restaurant = {
  id: string;
  name: string;
  menuItems: MenuItem[];
};

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discountPercent: number;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | Date | null;
};

export function ModerationManager({
  initialRestaurants,
  initialCoupons
}: {
  initialRestaurants: Restaurant[];
  initialCoupons: Coupon[];
}) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [coupon, setCoupon] = useState({ code: "", description: "", discountPercent: "10", maxUses: "", expiresAt: "" });

  const stats = useMemo(
    () => ({
      discountedItems: restaurants.reduce((total, restaurant) => total + restaurant.menuItems.filter((item) => item.discountPercent > 0).length, 0),
      activeCoupons: coupons.filter((coupon) => coupon.active).length,
      usedCoupons: coupons.reduce((total, coupon) => total + coupon.usedCount, 0)
    }),
    [coupons, restaurants]
  );

  async function refresh() {
    const response = await fetch("/api/admin/menu");
    const data = await response.json();
    setRestaurants(data.restaurants);
    setCoupons(data.coupons ?? []);
  }

  async function action(body: unknown) {
    const response = await fetch("/api/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Moderation action failed");
    await refresh();
  }

  function generateCouponCode() {
    return `D2D${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  function formatDateInput(value: Coupon["expiresAt"]) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  async function setItemDiscount(id: string, discountPercent: number) {
    await action({ action: "item.update", id, discountPercent });
    toast.success(discountPercent ? "Discount applied" : "Discount removed");
  }

  async function createCoupon() {
    try {
      await action({
        action: "coupon.create",
        code: coupon.code || generateCouponCode(),
        description: coupon.description,
        discountPercent: Number(coupon.discountPercent),
        maxUses: coupon.maxUses ? Number(coupon.maxUses) : null,
        expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString() : null
      });
      setCoupon({ code: "", description: "", discountPercent: "10", maxUses: "", expiresAt: "" });
      toast.success("Coupon created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create coupon");
    }
  }

  async function toggleCoupon(id: string, active: boolean) {
    await action({ action: "coupon.active", id, active });
    toast.success(active ? "Coupon activated" : "Coupon paused");
  }

  async function updateCoupon(id: string, patch: Partial<{ discountPercent: number; maxUses: number | null; expiresAt: string | null }>) {
    await action({ action: "coupon.update", id, ...patch });
    toast.success("Coupon updated");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Discounted items", stats.discountedItems],
          ["Active coupons", stats.activeCoupons],
          ["Coupon uses", stats.usedCoupons]
        ].map(([label, value]) => (
          <Card key={label} className="border-0 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card className="border-0 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black">Generate coupon</h3>
                <p className="mt-1 text-sm text-neutral-500">Create checkout offers with expiry and usage limits.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCoupon({ ...coupon, code: generateCouponCode() })}>Generate</Button>
            </div>
            <Input className="mt-4 uppercase" placeholder="Coupon code" value={coupon.code} onChange={(event) => setCoupon({ ...coupon, code: event.target.value.toUpperCase() })} />
            <Input className="mt-3" placeholder="Description optional" value={coupon.description} onChange={(event) => setCoupon({ ...coupon, description: event.target.value })} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input type="number" min={1} max={90} placeholder="Discount %" value={coupon.discountPercent} onChange={(event) => setCoupon({ ...coupon, discountPercent: event.target.value })} />
              <Input type="number" min={1} placeholder="Max uses optional" value={coupon.maxUses} onChange={(event) => setCoupon({ ...coupon, maxUses: event.target.value })} />
            </div>
            <Input className="mt-3" type="date" value={coupon.expiresAt} onChange={(event) => setCoupon({ ...coupon, expiresAt: event.target.value })} />
            <Button className="mt-3 w-full" onClick={createCoupon}>Add coupon</Button>
          </Card>

          <Card className="border border-amber-200 bg-[#fffaf1] p-5 shadow-sm">
            <h3 className="font-black">Quick item discounts</h3>
            <p className="mt-1 text-sm text-neutral-600">Grouped restaurant-wise so offer changes stay easy to audit.</p>
            <div className="mt-4 max-h-[620px] space-y-4 overflow-auto pr-1">
              {restaurants.map((restaurant) => (
                <div key={restaurant.id} className="rounded-3xl bg-white p-4 shadow-sm">
                  <h4 className="font-black">{restaurant.name}</h4>
                  <div className="mt-3 space-y-3">
                    {restaurant.menuItems.map((menuItem) => (
                      <div key={menuItem.id} className="rounded-2xl bg-neutral-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{menuItem.name}</p>
                            <p className="text-xs text-neutral-500">{formatPaise(menuItem.pricePaise)}</p>
                          </div>
                          {menuItem.discountPercent ? <Badge tone="amber">{menuItem.discountPercent}% off</Badge> : <Badge>Full price</Badge>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[0, 5, 10, 15, 20].map((discount) => (
                            <Button
                              key={discount}
                              size="sm"
                              variant={menuItem.discountPercent === discount ? "default" : "outline"}
                              onClick={() => setItemDiscount(menuItem.id, discount)}
                            >
                              {discount ? `${discount}%` : "None"}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!restaurant.menuItems.length ? <p className="text-sm text-neutral-500">No items in this restaurant.</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden border-0 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5">
            <h3 className="text-xl font-black">Coupon control</h3>
            <p className="mt-1 text-sm text-neutral-500">Pause, activate, adjust validity, and watch coupon usage.</p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {coupons.map((coupon) => {
              const expired = coupon.expiresAt ? new Date(coupon.expiresAt) < new Date() : false;
              const fullyUsed = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;
              return (
                <div key={coupon.id} className="rounded-3xl border border-neutral-100 bg-neutral-50 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-lg font-black">{coupon.code}</span>
                    <Badge tone={!coupon.active || expired || fullyUsed ? "red" : "green"}>
                      {!coupon.active ? "Paused" : expired ? "Expired" : fullyUsed ? "Used up" : "Active"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-neutral-500">{coupon.description || "No description"}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-neutral-500">
                      Discount %
                      <Input className="mt-1" type="number" min={1} max={90} defaultValue={coupon.discountPercent} onBlur={(event) => updateCoupon(coupon.id, { discountPercent: Number(event.target.value) })} />
                    </label>
                    <label className="text-xs font-bold text-neutral-500">
                      Max uses
                      <Input className="mt-1" type="number" min={1} placeholder="Unlimited" defaultValue={coupon.maxUses ?? ""} onBlur={(event) => updateCoupon(coupon.id, { maxUses: event.target.value ? Number(event.target.value) : null })} />
                    </label>
                    <label className="text-xs font-bold text-neutral-500 sm:col-span-2">
                      Expires
                      <Input className="mt-1" type="date" defaultValue={formatDateInput(coupon.expiresAt)} onBlur={(event) => updateCoupon(coupon.id, { expiresAt: event.target.value ? new Date(event.target.value).toISOString() : null })} />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full bg-white px-3 py-1 font-black text-amber-700 shadow-sm">
                      Used {coupon.usedCount}{coupon.maxUses !== null ? ` / ${coupon.maxUses}` : ""}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => toggleCoupon(coupon.id, !coupon.active)}>
                      {coupon.active ? "Pause" : "Activate"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {!coupons.length ? <div className="rounded-3xl bg-neutral-50 p-8 text-center text-neutral-500 md:col-span-2">No coupons created yet.</div> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
