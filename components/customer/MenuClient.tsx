"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Search, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteNav } from "@/components/customer/SiteNav";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readStoredCart, writeStoredCart, type StoredCartItem } from "@/lib/cart";
import { formatPaise } from "@/lib/utils";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  discountPercent?: number;
  imageUrl: string | null;
  available: boolean;
  courseId: string;
};

type Course = {
  id: string;
  name: string;
};

type Restaurant = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  courses: Course[];
  menuItems: MenuItem[];
};

const RESTAURANT_FALLBACK = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=85";
const ITEM_FALLBACK = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85";

function discountedPrice(item: Pick<MenuItem, "pricePaise" | "discountPercent">) {
  const discountPercent = item.discountPercent ?? 0;
  return Math.round(item.pricePaise * (1 - discountPercent / 100));
}

function maxDiscountOf(restaurant: Restaurant) {
  return restaurant.menuItems.reduce((max, item) => Math.max(max, item.discountPercent ?? 0), 0);
}

export function MenuClient({ restaurants }: { restaurants: Restaurant[] }) {
  const [activeRestaurantId, setActiveRestaurantId] = useState("");
  const [activeCourseId, setActiveCourseId] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<StoredCartItem[]>([]);

  const activeRestaurant = restaurants.find((restaurant) => restaurant.id === activeRestaurantId);

  const sections = useMemo(() => {
    if (!activeRestaurant) return [];
    const search = query.trim().toLowerCase();
    if (search) {
      const items = activeRestaurant.menuItems.filter(
        (item) => item.name.toLowerCase().includes(search) || (item.description ?? "").toLowerCase().includes(search)
      );
      return items.length ? [{ id: "search", name: `Results for “${query.trim()}”`, items }] : [];
    }
    const courses = activeCourseId === "all" ? activeRestaurant.courses : activeRestaurant.courses.filter((course) => course.id === activeCourseId);
    return courses
      .map((course) => ({ id: course.id, name: course.name, items: activeRestaurant.menuItems.filter((item) => item.courseId === course.id) }))
      .filter((section) => section.items.length);
  }, [activeRestaurant, activeCourseId, query]);

  useEffect(() => {
    function syncCart() {
      setCart(readStoredCart());
    }

    syncCart();
    window.addEventListener("storage", syncCart);
    window.addEventListener("dish2door-cart-updated", syncCart);
    return () => {
      window.removeEventListener("storage", syncCart);
      window.removeEventListener("dish2door-cart-updated", syncCart);
    };
  }, []);

  function persistCart(nextCart: StoredCartItem[]) {
    setCart(nextCart);
    writeStoredCart(nextCart);
  }

  function openRestaurant(restaurant: Restaurant) {
    setActiveRestaurantId(restaurant.id);
    setActiveCourseId("all");
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addToCart(item: MenuItem) {
    if (!activeRestaurant) return;

    const existingRestaurantId = cart[0]?.restaurantId;

    if (existingRestaurantId && existingRestaurantId !== activeRestaurant.id) {
      toast.error("One cart can contain items from only one restaurant.");
      return;
    }

    const existing = cart.find((cartItem) => cartItem.id === item.id);
    const nextCart: StoredCartItem[] = existing
      ? cart.map((cartItem) =>
          cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        )
      : [
          ...cart,
          {
            ...item,
            quantity: 1,
            restaurantId: activeRestaurant.id,
            restaurantName: activeRestaurant.name
          }
        ];

    persistCart(nextCart);
  }

  function updateQuantity(item: MenuItem, delta: number) {
    const existing = cart.find((cartItem) => cartItem.id === item.id);
    if (!existing && delta > 0) {
      addToCart(item);
      return;
    }

    const nextCart = cart
      .map((cartItem) => (cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + delta } : cartItem))
      .filter((cartItem) => cartItem.quantity > 0);

    persistCart(nextCart);
  }

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => total + discountedPrice(item) * item.quantity, 0);

  function MenuRow({ item }: { item: MenuItem }) {
    const quantity = cart.find((cartItem) => cartItem.id === item.id)?.quantity ?? 0;
    return (
      <div className="flex items-start justify-between gap-4 border-b border-dashed border-neutral-200 py-5 last:border-0">
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-neutral-950">{item.name}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-bold text-neutral-900">{formatPaise(discountedPrice(item))}</span>
            {item.discountPercent ? (
              <>
                <span className="text-sm font-semibold text-neutral-400 line-through">{formatPaise(item.pricePaise)}</span>
                <Badge tone="green">{item.discountPercent}% OFF</Badge>
              </>
            ) : null}
          </div>
          {item.description ? <p className="mt-2 line-clamp-2 max-w-md text-sm leading-6 text-neutral-500">{item.description}</p> : null}
        </div>

        <div className="relative w-28 shrink-0 pb-3 sm:w-36">
          <img alt={item.name} className="h-24 w-full rounded-2xl object-cover sm:h-28" src={item.imageUrl ?? ITEM_FALLBACK} />
          <div className="absolute inset-x-2 -bottom-0 flex justify-center">
            {quantity > 0 ? (
              <div className="flex items-center gap-1 rounded-xl border border-amber-200 bg-white px-1 py-1 shadow-lg">
                <button type="button" aria-label={`Decrease ${item.name}`} className="px-2 text-lg font-black leading-none text-amber-600" onClick={() => updateQuantity(item, -1)}>
                  <Minus size={15} />
                </button>
                <span className="w-5 text-center text-sm font-black text-amber-700">{quantity}</span>
                <button type="button" aria-label={`Increase ${item.name}`} className="px-2 text-lg font-black leading-none text-amber-600" onClick={() => updateQuantity(item, 1)}>
                  <Plus size={15} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!item.available}
                onClick={() => addToCart(item)}
                className="rounded-xl border border-amber-200 bg-white px-7 py-2 text-sm font-black uppercase tracking-wide text-amber-600 shadow-lg transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:shadow-none"
              >
                {item.available ? "Add" : "Out"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fff8ec]">
      <section className="relative overflow-hidden border-b border-neutral-200 bg-[#fff8ec]">
        <SiteNav />
        <div className="ambient-grid absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-28 sm:px-6 lg:px-8">
          {!activeRestaurant ? (
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Badge tone="amber">Ordering page</Badge>
              <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-neutral-950 sm:text-6xl">Restaurants near campus</h1>
              <p className="mt-3 max-w-2xl text-neutral-600">Pick a place to see its menu. Your cart stays linked to one restaurant for a cleaner order.</p>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Button variant="outline" size="sm" onClick={() => setActiveRestaurantId("")}>
                <ArrowLeft size={16} className="-ml-1 mr-1" />
                All restaurants
              </Button>
              <div className="mt-4 flex items-center gap-4">
                <img alt={activeRestaurant.name} className="h-16 w-16 shrink-0 rounded-2xl object-cover sm:h-20 sm:w-20" src={activeRestaurant.imageUrl ?? RESTAURANT_FALLBACK} />
                <div className="min-w-0">
                  <h1 className="truncate text-3xl font-black tracking-tight text-neutral-950 sm:text-4xl">{activeRestaurant.name}</h1>
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{activeRestaurant.description}</p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {!activeRestaurant ? (
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {restaurants.map((restaurant) => {
              const maxDiscount = maxDiscountOf(restaurant);
              return (
                <button
                  key={restaurant.id}
                  className="group overflow-hidden rounded-3xl border border-neutral-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  onClick={() => openRestaurant(restaurant)}
                >
                  <div className="relative">
                    <img alt={restaurant.name} className="h-44 w-full object-cover transition duration-700 group-hover:scale-105" src={restaurant.imageUrl ?? RESTAURANT_FALLBACK} />
                    {maxDiscount > 0 ? (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-3 pt-10">
                        <p className="text-lg font-black uppercase tracking-tight text-white">{maxDiscount}% OFF</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <h3 className="text-xl font-black">{restaurant.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-neutral-600">{restaurant.description}</p>
                    <p className="mt-3 text-sm font-semibold text-amber-700">{restaurant.menuItems.length} items · View menu →</p>
                  </div>
                </button>
              );
            })}
            {!restaurants.length ? <Card className="p-8 text-center sm:col-span-2 xl:col-span-3">No restaurants are active yet.</Card> : null}
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-3xl px-4 pb-28 pt-2 sm:px-6">
          <div className="sticky top-0 z-30 -mx-4 space-y-3 border-b border-neutral-200 bg-[#fff8ec]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search dishes in ${activeRestaurant.name}`}
                className="h-11 w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </div>
            {!query.trim() ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Button variant={activeCourseId === "all" ? "default" : "outline"} size="sm" className="shrink-0" onClick={() => setActiveCourseId("all")}>
                  All
                </Button>
                {activeRestaurant.courses.map((course) => (
                  <Button key={course.id} variant={activeCourseId === course.id ? "default" : "outline"} size="sm" className="shrink-0" onClick={() => setActiveCourseId(course.id)}>
                    {course.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-8">
            {sections.map((section) => (
              <div key={section.id}>
                <h2 className="text-lg font-black text-neutral-950">
                  {section.name} <span className="text-neutral-400">({section.items.length})</span>
                </h2>
                <div className="mt-2">
                  {section.items.map((item) => (
                    <MenuRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
            {!sections.length ? (
              <Card className="p-8 text-center text-neutral-500">{query.trim() ? "No dishes match your search." : "No items in this section yet."}</Card>
            ) : null}
          </div>
        </section>
      )}

      {cartCount > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
            <Link href="/cart" className="pointer-events-auto">
              <Button size="lg" className="h-14 gap-3 rounded-full pl-4 pr-6 shadow-2xl">
                <span className="relative grid h-9 w-9 place-items-center rounded-full bg-white/15">
                  <ShoppingBag size={20} />
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-xs font-black text-neutral-950">{cartCount}</span>
                </span>
                <span className="font-bold">View cart</span>
                <span className="font-black">{formatPaise(cartTotal)}</span>
              </Button>
            </Link>
          </motion.div>
        </div>
      ) : null}

      <SiteFooter />
    </main>
  );
}
