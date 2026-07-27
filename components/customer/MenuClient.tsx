"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, Search, ShoppingBag, Sparkles, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteNav } from "@/components/customer/SiteNav";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { FeaturedShowcase } from "@/components/customer/FeaturedShowcase";
import { readStoredCart, writeStoredCart, type StoredCartItem } from "@/lib/cart";
import type { FeaturedCombo, FeaturedData, FeaturedDish } from "@/lib/featured";
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

type Course = { id: string; name: string };

type ComboLine = { id: string; quantity: number; menuItem: Pick<MenuItem, "id" | "name" | "imageUrl" | "available"> };

type Combo = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  comboPricePaise: number;
  items: ComboLine[];
};

type Restaurant = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  courses: Course[];
  menuItems: MenuItem[];
  combos: Combo[];
};

function comboRealTotal(combo: Combo, menuItems: MenuItem[]) {
  const priceById = new Map(menuItems.map((item) => [item.id, discountedPrice(item)]));
  return combo.items.reduce((sum, line) => sum + (priceById.get(line.menuItem.id) ?? 0) * line.quantity, 0);
}

const RESTAURANT_FALLBACK = "/dish2door-home-hero.png";
const ITEM_FALLBACK = "/dish2door-home-hero.png";

function discountedPrice(item: Pick<MenuItem, "pricePaise" | "discountPercent">) {
  return Math.round(item.pricePaise * (1 - (item.discountPercent ?? 0) / 100));
}

function maxDiscountOf(restaurant: Restaurant) {
  return restaurant.menuItems.reduce((max, item) => Math.max(max, item.discountPercent ?? 0), 0);
}

export function MenuClient({ restaurants, featured }: { restaurants: Restaurant[]; featured: FeaturedData }) {
  const [activeRestaurantId, setActiveRestaurantId] = useState("");
  const [activeCourseId, setActiveCourseId] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<StoredCartItem[]>([]);
  // Landing view when no kitchen is open: the stats-driven Featured page, with the
  // plain restaurant grid one tap away.
  const [landingView, setLandingView] = useState<"featured" | "kitchens">("featured");
  const activeRestaurant = restaurants.find((restaurant) => restaurant.id === activeRestaurantId);
  const hasFeatured = featured.topDishes.length > 0 || featured.combos.length > 0 || featured.biryani.length > 0;

  const sections = useMemo(() => {
    if (!activeRestaurant) return [];
    const search = query.trim().toLowerCase();
    if (search) {
      const items = activeRestaurant.menuItems.filter(
        (item) => item.name.toLowerCase().includes(search) || (item.description ?? "").toLowerCase().includes(search)
      );
      return items.length ? [{ id: "search", name: `Results for "${query.trim()}"`, items }] : [];
    }
    const courses = activeCourseId === "all" ? activeRestaurant.courses : activeRestaurant.courses.filter((course) => course.id === activeCourseId);
    return courses
      .map((course) => ({ id: course.id, name: course.name, items: activeRestaurant.menuItems.filter((item) => item.courseId === course.id) }))
      .filter((section) => section.items.length);
  }, [activeRestaurant, activeCourseId, query]);

  useEffect(() => {
    const syncCart = () => setCart(readStoredCart());
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

  // Single add path for every surface (menu list, combos, featured page). The cart is
  // restricted to one restaurant, so the line carries its own restaurant identity
  // rather than assuming whichever kitchen happens to be open.
  function addLineToCart(line: StoredCartItem) {
    const existingRestaurantId = cart[0]?.restaurantId;
    if (existingRestaurantId && existingRestaurantId !== line.restaurantId) {
      toast.error("Your cart already has food from another restaurant.");
      return;
    }
    const existing = cart.find((cartItem) => cartItem.id === line.id);
    persistCart(
      existing
        ? cart.map((cartItem) => cartItem.id === line.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem)
        : [...cart, line]
    );
  }

  function stepCartLine(cartId: string, delta: number, addWhenMissing: () => void) {
    const existing = cart.find((cartItem) => cartItem.id === cartId);
    if (!existing && delta > 0) {
      addWhenMissing();
      return;
    }
    persistCart(
      cart.map((cartItem) => cartItem.id === cartId ? { ...cartItem, quantity: cartItem.quantity + delta } : cartItem)
        .filter((cartItem) => cartItem.quantity > 0)
    );
  }

  function quantityOf(cartId: string) {
    return cart.find((cartItem) => cartItem.id === cartId)?.quantity ?? 0;
  }

  function addToCart(item: MenuItem) {
    if (!activeRestaurant) return;
    addLineToCart({ ...item, quantity: 1, restaurantId: activeRestaurant.id, restaurantName: activeRestaurant.name });
  }

  function featuredDishLine(dish: FeaturedDish): StoredCartItem {
    return {
      id: dish.id,
      kind: "item",
      name: dish.name,
      description: dish.description,
      pricePaise: dish.pricePaise,
      discountPercent: dish.discountPercent,
      imageUrl: dish.imageUrl,
      available: true,
      quantity: 1,
      restaurantId: dish.restaurantId,
      restaurantName: dish.restaurantName
    };
  }

  function featuredComboLine(combo: FeaturedCombo): StoredCartItem {
    return {
      id: `combo:${combo.id}`,
      kind: "combo",
      comboId: combo.id,
      name: combo.name,
      description: combo.items.map((line) => `${line.quantity}× ${line.name}`).join(", "),
      pricePaise: combo.comboPricePaise,
      discountPercent: 0,
      imageUrl: combo.imageUrl,
      available: true,
      quantity: 1,
      restaurantId: combo.restaurantId,
      restaurantName: combo.restaurantName
    };
  }

  function openRestaurantById(restaurantId: string) {
    const restaurant = restaurants.find((entry) => entry.id === restaurantId);
    if (restaurant) openRestaurant(restaurant);
  }

  function addCombo(combo: Combo) {
    if (!activeRestaurant) return;
    addLineToCart({
      id: `combo:${combo.id}`,
      kind: "combo",
      comboId: combo.id,
      name: combo.name,
      description: combo.items.map((line) => `${line.quantity}× ${line.menuItem.name}`).join(", "),
      pricePaise: combo.comboPricePaise,
      discountPercent: 0,
      imageUrl: combo.imageUrl ?? combo.items[0]?.menuItem.imageUrl ?? null,
      available: true,
      quantity: 1,
      restaurantId: activeRestaurant.id,
      restaurantName: activeRestaurant.name
    });
  }

  function updateComboQuantity(combo: Combo, delta: number) {
    stepCartLine(`combo:${combo.id}`, delta, () => addCombo(combo));
  }

  function updateQuantity(item: MenuItem, delta: number) {
    stepCartLine(item.id, delta, () => addToCart(item));
  }

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => total + discountedPrice(item) * item.quantity, 0);

  function QuantityControl({ item }: { item: MenuItem }) {
    const quantity = cart.find((cartItem) => cartItem.id === item.id)?.quantity ?? 0;
    if (quantity > 0) {
      return (
        <div className="flex h-10 items-center rounded-md bg-[#171713] text-white shadow-[0_8px_24px_rgba(23,23,19,0.16)]">
          <button type="button" aria-label={`Decrease ${item.name}`} className="grid h-10 w-10 place-items-center transition hover:bg-white/10 active:scale-95" onClick={() => updateQuantity(item, -1)}><Minus size={15} /></button>
          <span className="w-7 text-center text-sm font-black tabular-nums">{quantity}</span>
          <button type="button" aria-label={`Increase ${item.name}`} className="grid h-10 w-10 place-items-center transition hover:bg-white/10 active:scale-95" onClick={() => updateQuantity(item, 1)}><Plus size={15} /></button>
        </div>
      );
    }

    return (
      <button
        type="button"
        disabled={!item.available}
        onClick={() => addToCart(item)}
        className="h-10 min-w-24 rounded-md border border-black/15 bg-white px-5 text-sm font-black text-[#171713] transition duration-200 hover:border-[#f6b73c] hover:bg-[#f6b73c] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#e9e5dd] disabled:text-[#9c968c]"
      >
        {item.available ? "Add" : "Sold out"}
      </button>
    );
  }

  function MenuItemCard({ item }: { item: MenuItem }) {
    return (
      <motion.article
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="group grid grid-cols-[1fr_7.25rem] gap-5 border-t border-black/10 py-6 sm:grid-cols-[1fr_9rem] sm:py-7"
      >
        <div className="flex min-w-0 flex-col items-start">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black tracking-[-0.025em] text-[#171713] sm:text-xl">{item.name}</h3>
            {!item.available ? <span className="rounded-sm bg-[#e9e5dd] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#777168]">Unavailable</span> : null}
          </div>
          {item.description ? <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 text-[#716a5f]">{item.description}</p> : null}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <span className="font-black tabular-nums text-[#171713]">{formatPaise(discountedPrice(item))}</span>
            {item.discountPercent ? (
              <><span className="text-sm tabular-nums text-[#9a9388] line-through">{formatPaise(item.pricePaise)}</span><span className="rounded-sm bg-[#f6b73c] px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#171713]">{item.discountPercent}% off</span></>
            ) : null}
          </div>
        </div>
        <div className="relative min-h-32 pb-5">
          <img alt={item.name} className={`h-28 w-full rounded-xl object-cover sm:h-32 ${item.available ? "" : "grayscale opacity-60"}`} src={item.imageUrl ?? ITEM_FALLBACK} />
          <div className="absolute bottom-0 right-0"><QuantityControl item={item} /></div>
        </div>
      </motion.article>
    );
  }

  function ComboCard({ combo }: { combo: Combo }) {
    const cartId = `combo:${combo.id}`;
    const quantity = cart.find((cartItem) => cartItem.id === cartId)?.quantity ?? 0;
    const realTotal = activeRestaurant ? comboRealTotal(combo, activeRestaurant.menuItems) : 0;
    const savings = Math.max(0, realTotal - combo.comboPricePaise);
    const savingsPercent = realTotal > 0 ? Math.round((savings / realTotal) * 100) : 0;
    const available = combo.items.every((line) => line.menuItem.available);

    return (
      <motion.article
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="group relative overflow-hidden rounded-2xl border border-[#171713]/10 bg-white/70 p-5 shadow-[0_12px_40px_rgba(23,23,19,0.06)] sm:p-6"
      >
        <div className="grid grid-cols-[1fr_7.25rem] gap-5 sm:grid-cols-[1fr_9rem]">
          <div className="flex min-w-0 flex-col items-start">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-[#171713] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#f6b73c]"><Sparkles size={11} /> Combo</span>
              {savingsPercent > 0 ? <span className="rounded-md bg-[#f6b73c] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#171713]">Save {savingsPercent}%</span> : null}
            </div>
            <h3 className="mt-3 text-lg font-black tracking-[-0.025em] sm:text-xl">{combo.name}</h3>
            <ul className="mt-2 space-y-0.5 text-sm leading-6 text-[#716a5f]">
              {combo.items.map((line) => (
                <li key={line.id} className="flex items-center gap-1.5"><span className="font-black tabular-nums text-[#171713]">{line.quantity}×</span> {line.menuItem.name}</li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <span className="text-lg font-black tabular-nums text-[#171713]">{formatPaise(combo.comboPricePaise)}</span>
              {savings > 0 ? <span className="text-sm tabular-nums text-[#9a9388] line-through">{formatPaise(realTotal)}</span> : null}
            </div>
          </div>
          <div className="relative min-h-32 pb-5">
            <img alt={combo.name} className={`h-28 w-full rounded-xl object-cover sm:h-32 ${available ? "" : "grayscale opacity-60"}`} src={combo.imageUrl ?? combo.items[0]?.menuItem.imageUrl ?? ITEM_FALLBACK} />
            <div className="absolute bottom-0 right-0">
              {!available ? (
                <span className="grid h-10 min-w-24 place-items-center rounded-md bg-[#e9e5dd] px-4 text-sm font-black text-[#9c968c]">Sold out</span>
              ) : quantity > 0 ? (
                <div className="flex h-10 items-center rounded-md bg-[#171713] text-white shadow-[0_8px_24px_rgba(23,23,19,0.16)]">
                  <button type="button" aria-label={`Decrease ${combo.name}`} className="grid h-10 w-10 place-items-center transition hover:bg-white/10 active:scale-95" onClick={() => updateComboQuantity(combo, -1)}><Minus size={15} /></button>
                  <span className="w-7 text-center text-sm font-black tabular-nums">{quantity}</span>
                  <button type="button" aria-label={`Increase ${combo.name}`} className="grid h-10 w-10 place-items-center transition hover:bg-white/10 active:scale-95" onClick={() => updateComboQuantity(combo, 1)}><Plus size={15} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => addCombo(combo)} className="h-10 min-w-24 rounded-md border border-black/15 bg-white px-5 text-sm font-black text-[#171713] transition duration-200 hover:border-[#f6b73c] hover:bg-[#f6b73c] active:scale-[0.98]">Add</button>
              )}
            </div>
          </div>
        </div>
      </motion.article>
    );
  }

  const combos = activeRestaurant?.combos ?? [];
  const showCombos = !query.trim() && combos.length > 0 && (activeCourseId === "all" || activeCourseId === "combos");

  return (
    <main id="main-content" className="min-h-screen overflow-x-hidden bg-[#f7f3eb] text-[#171713]">
      <section className="relative border-b border-black/10">
        <SiteNav />
        {!activeRestaurant ? (
          <div className="mx-auto max-w-[1440px] px-5 pt-28 sm:px-8 lg:px-12 lg:pt-32">
            {hasFeatured ? (
              <div className="inline-flex gap-1 rounded-xl border border-black/10 bg-white/60 p-1">
                {([{ key: "featured", label: "Featured" }, { key: "kitchens", label: "All kitchens" }] as const).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setLandingView(tab.key)}
                    className={`rounded-lg px-4 py-2 text-sm font-black transition sm:px-5 ${landingView === tab.key ? "bg-[#171713] text-white" : "text-[#6c6458] hover:text-[#171713]"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
            {landingView === "kitchens" || !hasFeatured ? (
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="pb-12 pt-8 lg:pb-16">
                <div className="flex items-center gap-3 text-sm font-semibold text-[#746c5f]"><span className="h-px w-9 bg-[#d97706]" /> Today&apos;s kitchens</div>
                <h1 className="mt-6 max-w-5xl text-[clamp(3.25rem,7.4vw,7.4rem)] font-black leading-[0.9] tracking-[-0.055em] text-balance">Pick a kitchen.<br /><span className="text-[#c65d24]">Find your favourite.</span></h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-[#6c6458] sm:text-xl sm:leading-9">Browse restaurants serving campus today. Choose one kitchen, then build your order exactly how you like it.</p>
              </motion.div>
            ) : <div className="pb-7" />}
          </div>
        ) : (
          <div className="mx-auto max-w-[1440px] px-5 pb-8 pt-28 sm:px-8 lg:px-12 lg:pb-10 lg:pt-32">
            <button type="button" onClick={() => setActiveRestaurantId("")} className="inline-flex items-center gap-2 text-sm font-bold text-[#6c6458] transition hover:text-[#c65d24]"><ArrowLeft size={16} /> All restaurants</button>
          </div>
        )}
      </section>

      <AnimatePresence mode="wait">
        {!activeRestaurant && landingView === "featured" && hasFeatured ? (
          <motion.section key="featured" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-8">
            <FeaturedShowcase
              data={featured}
              quantityOf={quantityOf}
              onAddDish={(dish) => addLineToCart(featuredDishLine(dish))}
              onStepDish={(dish, delta) => stepCartLine(dish.id, delta, () => addLineToCart(featuredDishLine(dish)))}
              onAddCombo={(combo) => addLineToCart(featuredComboLine(combo))}
              onStepCombo={(combo, delta) => stepCartLine(`combo:${combo.id}`, delta, () => addLineToCart(featuredComboLine(combo)))}
              onOpenRestaurant={openRestaurantById}
              onBrowseKitchens={() => { setLandingView("kitchens"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            />
          </motion.section>
        ) : !activeRestaurant ? (
          <motion.section key="restaurants" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
            {restaurants.length ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {restaurants.map((restaurant, index) => {
                  const maxDiscount = maxDiscountOf(restaurant);
                  return (
                    <motion.button
                      key={restaurant.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.07, duration: 0.5 }}
                      onClick={() => openRestaurant(restaurant)}
                      className="group text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c65d24]"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#ded8cd]">
                        <img alt={restaurant.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" src={restaurant.imageUrl ?? RESTAURANT_FALLBACK} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
                        {maxDiscount > 0 ? <span className="absolute left-4 top-4 rounded-md bg-[#f6b73c] px-3 py-2 text-xs font-black text-[#171713]">Up to {maxDiscount}% off</span> : null}
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white">
                          <div><h2 className="text-2xl font-black tracking-[-0.035em]">{restaurant.name}</h2><p className="mt-1 text-sm font-semibold text-white/65">{restaurant.menuItems.length} dishes available</p></div>
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#171713] transition duration-300 group-hover:-rotate-12 group-hover:bg-[#f6b73c]"><ArrowRight size={18} /></span>
                        </div>
                      </div>
                      {restaurant.description ? <p className="mt-4 line-clamp-2 max-w-md text-sm leading-6 text-[#6c6458]">{restaurant.description}</p> : null}
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 text-center">
                <div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e9e5dd]"><UtensilsCrossed size={20} /></span><h2 className="mt-5 text-2xl font-black">Kitchens are being prepared</h2><p className="mt-2 text-[#716a5f]">Active restaurants will appear here as soon as ordering begins.</p></div>
              </div>
            )}
          </motion.section>
        ) : (
          <motion.section key={activeRestaurant.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto grid max-w-[1440px] gap-10 px-5 pb-32 sm:px-8 lg:grid-cols-[21rem_1fr] lg:gap-16 lg:px-12">
            <aside className="lg:sticky lg:top-6 lg:h-fit">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#ded8cd] lg:aspect-[4/5]">
                <img alt={activeRestaurant.name} className="h-full w-full object-cover" src={activeRestaurant.imageUrl ?? RESTAURANT_FALLBACK} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white"><p className="text-sm font-semibold text-[#f6b73c]">Now serving</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">{activeRestaurant.name}</h1></div>
              </div>
              {activeRestaurant.description ? <p className="mt-5 leading-7 text-[#6c6458]">{activeRestaurant.description}</p> : null}
              <div className="mt-5 flex gap-6 border-t border-black/10 pt-5 text-sm"><div><span className="block font-black tabular-nums">{activeRestaurant.menuItems.length}</span><span className="text-[#817a70]">Dishes</span></div><div><span className="block font-black tabular-nums">{activeRestaurant.courses.length}</span><span className="text-[#817a70]">Categories</span></div></div>
            </aside>

            <div className="min-w-0">
              <div className="sticky top-0 z-30 -mx-5 border-b border-black/10 bg-[#f7f3eb]/95 px-5 pb-4 pt-3 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
                <div className="relative"><Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#817a70]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeRestaurant.name}`} className="h-12 w-full rounded-md border border-black/12 bg-white/70 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10" /></div>
                {!query.trim() ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {[{ id: "all", name: "All dishes" }, ...(combos.length ? [{ id: "combos", name: "Combos" }] : []), ...activeRestaurant.courses].map((course) => (
                      <button key={course.id} type="button" onClick={() => setActiveCourseId(course.id)} className={`shrink-0 rounded-md px-4 py-2 text-sm font-bold transition ${activeCourseId === course.id ? "bg-[#171713] text-white" : "border border-black/12 bg-transparent text-[#625b50] hover:border-black/30"}`}>{course.name}</button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="pt-8">
                {showCombos ? (
                  <section className="mb-12">
                    <div className="flex items-end justify-between gap-4 pb-4"><div><h2 className="flex items-center gap-2 text-3xl font-black tracking-[-0.04em]"><Sparkles size={22} className="text-[#c65d24]" /> Combos</h2><p className="mt-1 text-sm text-[#716a5f]">Bundled to save — grab a full meal for less.</p></div><span className="pb-1 font-mono text-xs text-[#8c857a]">{combos.length.toString().padStart(2, "0")}</span></div>
                    <div className="grid gap-4 sm:grid-cols-2">{combos.map((combo) => <ComboCard key={combo.id} combo={combo} />)}</div>
                  </section>
                ) : null}
                {activeCourseId !== "combos" ? sections.map((section) => (
                  <section key={section.id} className="mb-12">
                    <div className="flex items-end justify-between gap-4 pb-2"><h2 className="text-3xl font-black tracking-[-0.04em]">{section.name}</h2><span className="pb-1 font-mono text-xs text-[#8c857a]">{section.items.length.toString().padStart(2, "0")}</span></div>
                    {section.items.map((item) => <MenuItemCard key={item.id} item={item} />)}
                  </section>
                )) : null}
                {!sections.length && !showCombos ? <div className="grid min-h-64 place-items-center border-y border-black/10 text-center"><div><Search className="mx-auto text-[#a49d92]" /><h2 className="mt-4 text-xl font-black">No matching dishes</h2><p className="mt-2 text-sm text-[#716a5f]">Try another name or choose a different category.</p></div></div> : null}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {cartCount > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26 }} className="w-full max-w-md">
            <Link href="/cart" className="menu-cart-link pointer-events-auto flex min-h-16 items-center justify-between rounded-xl bg-[#171713] px-3 py-2 shadow-[0_20px_60px_rgba(23,23,19,0.28)] transition hover:-translate-y-0.5">
              <span className="flex items-center gap-3"><span className="relative grid h-11 w-11 place-items-center rounded-lg bg-white/10"><ShoppingBag size={19} /><span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#f6b73c] px-1 text-[11px] font-black text-[#171713]">{cartCount}</span></span><span><span className="block text-sm font-bold">View your cart</span><span className="block text-xs text-white/50">Ready when you are</span></span></span>
              <span className="flex items-center gap-3"><span className="font-black tabular-nums">{formatPaise(cartTotal)}</span><ArrowRight size={17} /></span>
            </Link>
          </motion.div>
        </div>
      ) : null}
      <SiteFooter />
    </main>
  );
}
