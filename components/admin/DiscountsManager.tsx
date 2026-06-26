"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPaise } from "@/lib/utils";

type MenuItem = { id: string; name: string; pricePaise: number; discountPercent: number; available: boolean };
type Restaurant = { id: string; name: string; menuItems: MenuItem[] };

const PRESETS = [0, 5, 10, 15, 20];

export function DiscountsManager({ initialRestaurants }: { initialRestaurants: Restaurant[] }) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [query, setQuery] = useState("");

  const stats = useMemo(
    () => ({
      discounted: restaurants.reduce((total, restaurant) => total + restaurant.menuItems.filter((item) => item.discountPercent > 0).length, 0),
      items: restaurants.reduce((total, restaurant) => total + restaurant.menuItems.length, 0)
    }),
    [restaurants]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return restaurants;
    return restaurants
      .map((restaurant) => ({ ...restaurant, menuItems: restaurant.menuItems.filter((item) => item.name.toLowerCase().includes(q)) }))
      .filter((restaurant) => restaurant.menuItems.length);
  }, [query, restaurants]);

  async function refresh() {
    const response = await fetch("/api/admin/menu");
    const data = await response.json();
    setRestaurants(data.restaurants);
  }

  async function setItemDiscount(id: string, discountPercent: number) {
    try {
      const response = await fetch("/api/admin/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "item.update", id, discountPercent })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed");
      await refresh();
      toast.success(discountPercent ? "Discount applied" : "Discount removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update discount");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Discounted items" value={stats.discounted} helper={`of ${stats.items} total`} />
        <StatCard label="Restaurants" value={restaurants.length} />
      </div>

      <SectionCard
        title="Quick item discounts"
        description="Tap a preset to apply or remove a discount instantly."
        actions={<Input className="w-48" placeholder="Search items" value={query} onChange={(event) => setQuery(event.target.value)} />}
        bodyClassName="space-y-5"
      >
        {filtered.map((restaurant) => (
          <div key={restaurant.id}>
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-500">{restaurant.name}</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {restaurant.menuItems.map((menuItem) => (
                <div key={menuItem.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{menuItem.name}</p>
                      <p className="text-xs text-neutral-500">{formatPaise(menuItem.pricePaise)}</p>
                    </div>
                    {menuItem.discountPercent ? <Badge tone="amber">{menuItem.discountPercent}% off</Badge> : <Badge>Full price</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PRESETS.map((discount) => (
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
        {!filtered.length ? <div className="p-6 text-center text-neutral-500">No items match your search.</div> : null}
      </SectionCard>
    </div>
  );
}
