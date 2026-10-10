"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, Search, ShoppingBag, Sparkles, UtensilsCrossed, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatedPaise } from "@/components/customer/AnimatedPaise";
import { FadeImage } from "@/components/customer/FadeImage";
import { FeaturedShowcase } from "@/components/customer/FeaturedShowcase";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { SiteNav } from "@/components/customer/SiteNav";
import { MAX_LINE_QUANTITY, readStoredCart, writeStoredCart, type StoredCartItem } from "@/lib/cart";
import { flyToCart, tapFeedback } from "@/lib/cart-feedback";
import type { FeaturedCombo, FeaturedData, FeaturedDish } from "@/lib/featured";
import type { SlotTimes } from "@/lib/order-slots";
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

type RestaurantRef = Pick<Restaurant, "id" | "name">;

function comboRealTotal(combo: Combo, menuItems: MenuItem[]) {
  const priceById = new Map(menuItems.map((item) => [item.id, discountedPrice(item)]));
  return combo.items.reduce((sum, line) => sum + (priceById.get(line.menuItem.id) ?? 0) * line.quantity, 0);
}

const RESTAURANT_FALLBACK = "/dish-placeholder.webp";
const ITEM_FALLBACK = "/dish-placeholder.webp";
// Height of the sticky search + category bar; sections scroll to just below it.
const STICKY_OFFSET_PX = 150;

function discountedPrice(item: Pick<MenuItem, "pricePaise" | "discountPercent">) {
  return Math.round(item.pricePaise * (1 - (item.discountPercent ?? 0) / 100));
}

function maxDiscountOf(restaurant: Restaurant) {
  return restaurant.menuItems.reduce((max, item) => Math.max(max, item.discountPercent ?? 0), 0);
}

function itemLine(item: MenuItem, restaurant: RestaurantRef): StoredCartItem {
  return {
    id: item.id,
    kind: "item",
    name: item.name,
    description: item.description,
    pricePaise: item.pricePaise,
    discountPercent: item.discountPercent,
    imageUrl: item.imageUrl,
    available: item.available,
    quantity: 1,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name
  };
}

function comboLine(combo: Combo, restaurant: RestaurantRef): StoredCartItem {
  return {
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
    restaurantId: restaurant.id,
    restaurantName: restaurant.name
  };
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

export function MenuClient({ restaurants, featured, slotTimes }: { restaurants: Restaurant[]; featured: FeaturedData; slotTimes: SlotTimes }) {
  // The open kitchen lives in the URL (?kitchen=<id>) rather than in state, so the
  // phone's Back button returns to the kitchen list instead of leaving /menu, and a
  // kitchen link can be shared. pushState updates useSearchParams without a reload.
  const searchParams = useSearchParams();
  const requestedKitchen = searchParams.get("kitchen") ?? "";
  const activeRestaurantId = restaurants.some((restaurant) => restaurant.id === requestedKitchen) ? requestedKitchen : "";
  const activeRestaurant = restaurants.find((restaurant) => restaurant.id === activeRestaurantId);

  // Search and the highlighted category belong to one view ("" = the landing page).
  // Each is stored with the view it was set in, so switching kitchens (including via
  // Back/Forward) starts clean without a reset effect.
  const [queryChoice, setQueryChoice] = useState({ kitchen: "", text: "" });
  const query = queryChoice.kitchen === activeRestaurantId ? queryChoice.text : "";
  const setQuery = (text: string) => setQueryChoice({ kitchen: activeRestaurantId, text });
  const [spy, setSpy] = useState({ kitchen: "", section: "" });

  const [cart, setCart] = useState<StoredCartItem[]>([]);
  // Landing view when no kitchen is open: the stats-driven Featured page, with the
  // plain restaurant grid one tap away.
  const [landingView, setLandingView] = useState<"featured" | "kitchens">("featured");
  const hasFeatured = featured.topDishes.length > 0 || featured.combos.length > 0 || featured.biryani.length > 0;
  // The dish opened in the bottom sheet (tap a photo or name).
  const [detail, setDetail] = useState<{ item: MenuItem; restaurant: RestaurantRef } | null>(null);
  const chipStripRef = useRef<HTMLElement | null>(null);
  // Only the photo/handle drags the sheet down, so a long description still scrolls.
  const sheetDrag = useDragControls();

  const combos = activeRestaurant?.combos ?? [];
  const searching = Boolean(query.trim());

  // Every course is listed in full; the chips jump to a section rather than filtering,
  // so scrolling the menu never hides food the customer was looking for.
  const sections = useMemo(() => {
    if (!activeRestaurant) return [];
    const search = query.trim().toLowerCase();
    if (search) {
      const items = activeRestaurant.menuItems.filter(
        (item) => item.name.toLowerCase().includes(search) || (item.description ?? "").toLowerCase().includes(search)
      );
      return items.length ? [{ id: "search", name: `Results for "${query.trim()}"`, items }] : [];
    }
    return activeRestaurant.courses
      .map((course) => ({ id: course.id, name: course.name, items: activeRestaurant.menuItems.filter((item) => item.courseId === course.id) }))
      .filter((section) => section.items.length);
  }, [activeRestaurant, query]);

  const chips = useMemo(
    () => (searching ? [] : [...(combos.length ? [{ id: "combos", name: "Combos" }] : []), ...sections.map(({ id, name }) => ({ id, name }))]),
    [combos.length, sections, searching]
  );
  const activeSection = spy.kitchen === activeRestaurantId && chips.some((chip) => chip.id === spy.section) ? spy.section : chips[0]?.id ?? "";

  // One search box across every kitchen, on the landing page.
  const globalResults = useMemo(() => {
    const search = activeRestaurantId ? "" : query.trim().toLowerCase();
    if (!search) return [];
    return restaurants
      .flatMap((restaurant) => restaurant.menuItems.map((item) => ({ item, restaurant: { id: restaurant.id, name: restaurant.name } })))
      .filter(({ item }) => item.name.toLowerCase().includes(search) || (item.description ?? "").toLowerCase().includes(search))
      .sort((a, b) => Number(b.item.available) - Number(a.item.available) || discountedPrice(a.item) - discountedPrice(b.item))
      .slice(0, 40);
  }, [restaurants, activeRestaurantId, query]);

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

  // Scroll-spy: highlight the last section whose heading has passed under the sticky
  // bar, or the first one while the menu hasn't been scrolled to yet.
  useEffect(() => {
    if (!activeRestaurantId || searching) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const sectionEls = [...document.querySelectorAll<HTMLElement>("[data-menu-section]")];
      if (!sectionEls.length) return;
      const passed = sectionEls.filter((el) => el.getBoundingClientRect().top - STICKY_OFFSET_PX <= 12);
      // The last section is often too short to reach the bar; at the page bottom it wins.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const lastInView = sectionEls.filter((el) => el.getBoundingClientRect().top < window.innerHeight).pop();
      const current = ((atBottom ? lastInView : undefined) ?? passed[passed.length - 1] ?? sectionEls[0]).dataset.menuSection ?? "";
      setSpy((previous) => (previous.kitchen === activeRestaurantId && previous.section === current ? previous : { kitchen: activeRestaurantId, section: current }));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeRestaurantId, searching, sections]);

  // Keep the highlighted chip in view inside its horizontally scrolling strip.
  useEffect(() => {
    const strip = chipStripRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-chip="${activeSection}"]`);
    if (!strip || !chip) return;
    strip.scrollTo({ left: chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [activeSection]);

  // Bottom sheet: Escape closes it and the page behind stops scrolling.
  useEffect(() => {
    if (!detail) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [detail]);

  function persistCart(nextCart: StoredCartItem[]) {
    setCart(nextCart);
    writeStoredCart(nextCart);
  }

  function openRestaurant(restaurant: Restaurant) {
    window.history.pushState(null, "", `/menu?kitchen=${encodeURIComponent(restaurant.id)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeRestaurant() {
    window.history.pushState(null, "", "/menu");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openRestaurantById(restaurantId: string) {
    const restaurant = restaurants.find((entry) => entry.id === restaurantId);
    if (restaurant) openRestaurant(restaurant);
  }

  function jumpTo(sectionId: string) {
    setSpy({ kitchen: activeRestaurantId, section: sectionId });
    const target = document.getElementById(`menu-section-${sectionId}`);
    if (!target) return;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET_PX + 8, behavior: "smooth" });
  }

  // Single add path for every surface (menu list, combos, featured page, search, the
  // dish sheet). The cart is restricted to one restaurant, so the line carries its own
  // restaurant identity rather than assuming whichever kitchen happens to be open.
  function addLineToCart(line: StoredCartItem, source?: Element | null) {
    const existingRestaurantId = cart[0]?.restaurantId;
    if (existingRestaurantId && existingRestaurantId !== line.restaurantId) {
      toast.error(`Your cart has food from ${cart[0]?.restaurantName ?? "another restaurant"}.`, {
        description: "One order can come from one kitchen.",
        action: { label: "Start new cart", onClick: () => { persistCart([line]); tapFeedback(); toast.success(`Added ${line.name}`); } }
      });
      return;
    }
    const existing = cart.find((cartItem) => cartItem.id === line.id);
    if (existing && existing.quantity >= MAX_LINE_QUANTITY) {
      toast.error(`You can order up to ${MAX_LINE_QUANTITY} of one item.`, { id: "line-quantity-cap" });
      return;
    }
    persistCart(
      existing
        ? cart.map((cartItem) => cartItem.id === line.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem)
        : [...cart, line]
    );
    if (existing) tapFeedback();
    else flyToCart(source ?? null);
  }

  function stepCartLine(cartId: string, delta: number, addWhenMissing: () => void) {
    const existing = cart.find((cartItem) => cartItem.id === cartId);
    if (!existing && delta > 0) {
      addWhenMissing();
      return;
    }
    if (existing && delta > 0 && existing.quantity + delta > MAX_LINE_QUANTITY) {
      toast.error(`You can order up to ${MAX_LINE_QUANTITY} of one item.`, { id: "line-quantity-cap" });
      return;
    }
    persistCart(
      cart.map((cartItem) => cartItem.id === cartId ? { ...cartItem, quantity: cartItem.quantity + delta } : cartItem)
        .filter((cartItem) => cartItem.quantity > 0)
    );
    tapFeedback();
  }

  function quantityOf(cartId: string) {
    return cart.find((cartItem) => cartItem.id === cartId)?.quantity ?? 0;
  }

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => total + discountedPrice(item) * item.quantity, 0);

  // Render helpers, not components: a component declared inside MenuClient gets a new
  // identity on every render, so each cart change remounted every card — replaying the
  // entrance animation and dropping keyboard focus from the +/- buttons.
  function renderStepper(line: () => StoredCartItem, label: string, available: boolean, size: "md" | "lg" = "md") {
    const cartId = line().id;
    const quantity = quantityOf(cartId);
    const tall = size === "lg" ? "h-12" : "h-10";
    if (quantity > 0) {
      return (
        <motion.div key="stepper" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 520, damping: 30 }} className={`flex ${tall} items-center rounded-md bg-[#171713] text-white shadow-[0_8px_24px_rgba(23,23,19,0.16)]`}>
          <button type="button" aria-label={`Decrease ${label}`} className={`grid ${tall} w-10 place-items-center transition hover:bg-white/10 active:scale-90`} onClick={() => stepCartLine(cartId, -1, () => undefined)}><Minus size={15} /></button>
          <span className="w-7 overflow-hidden text-center text-sm font-black tabular-nums">
            <motion.span key={quantity} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }} className="inline-block">{quantity}</motion.span>
          </span>
          <button type="button" aria-label={`Increase ${label}`} className={`grid ${tall} w-10 place-items-center transition hover:bg-white/10 active:scale-90`} onClick={() => stepCartLine(cartId, 1, () => addLineToCart(line()))}><Plus size={15} /></button>
        </motion.div>
      );
    }
    return (
      <button
        type="button"
        disabled={!available}
        onClick={(event) => addLineToCart(line(), event.currentTarget)}
        className={`${tall} min-w-24 rounded-md border border-black/15 bg-white px-5 text-sm font-black text-[#171713] transition duration-200 hover:border-[#f6b73c] hover:bg-[#f6b73c] active:scale-95 disabled:cursor-not-allowed disabled:bg-[#e9e5dd] disabled:text-[#9c968c]`}
      >
        {available ? "Add" : "Sold out"}
      </button>
    );
  }

  function renderMenuItemCard(item: MenuItem, restaurant: RestaurantRef) {
    return (
      <motion.article
        key={item.id}
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="group grid grid-cols-[1fr_7.25rem] gap-5 border-t border-black/10 py-6 sm:grid-cols-[1fr_9rem] sm:py-7"
      >
        <div className="flex min-w-0 flex-col items-start">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDetail({ item, restaurant })} className="text-left">
              <h3 className="text-lg font-black tracking-[-0.025em] text-[#171713] transition-colors group-hover:text-[#c65d24] sm:text-xl">{item.name}</h3>
            </button>
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
          <button type="button" aria-label={`View ${item.name}`} onClick={() => setDetail({ item, restaurant })} className="block w-full overflow-hidden rounded-xl bg-[#e9e3d8]">
            <FadeImage alt={item.name} className={`h-28 w-full object-cover transition-[opacity,transform] duration-500 group-hover:scale-[1.04] sm:h-32 ${item.available ? "" : "grayscale opacity-60"}`} src={item.imageUrl ?? ITEM_FALLBACK} />
          </button>
          <div className="absolute bottom-0 right-0">{renderStepper(() => itemLine(item, restaurant), item.name, item.available)}</div>
        </div>
      </motion.article>
    );
  }

  function renderComboCard(combo: Combo, restaurant: Restaurant) {
    const realTotal = comboRealTotal(combo, restaurant.menuItems);
    const savings = Math.max(0, realTotal - combo.comboPricePaise);
    const savingsPercent = realTotal > 0 ? Math.round((savings / realTotal) * 100) : 0;
    const available = combo.items.every((line) => line.menuItem.available);

    return (
      <motion.article
        key={combo.id}
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="group relative overflow-hidden rounded-2xl border border-[#171713]/10 bg-white/70 p-5 shadow-[0_12px_40px_rgba(23,23,19,0.06)] transition-shadow hover:shadow-[0_18px_50px_rgba(23,23,19,0.1)] sm:p-6"
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
            <div className="overflow-hidden rounded-xl bg-[#e9e3d8]">
              <FadeImage alt={combo.name} className={`h-28 w-full object-cover transition-[opacity,transform] duration-500 group-hover:scale-[1.04] sm:h-32 ${available ? "" : "grayscale opacity-60"}`} src={combo.imageUrl ?? combo.items[0]?.menuItem.imageUrl ?? ITEM_FALLBACK} />
            </div>
            <div className="absolute bottom-0 right-0">
              {!available ? (
                <span className="grid h-10 min-w-24 place-items-center rounded-md bg-[#e9e5dd] px-4 text-sm font-black text-[#9c968c]">Sold out</span>
              ) : renderStepper(() => comboLine(combo, restaurant), combo.name, true)}
            </div>
          </div>
        </div>
      </motion.article>
    );
  }

  function renderSearchResult({ item, restaurant }: { item: MenuItem; restaurant: RestaurantRef }) {
    return (
      <motion.article
        key={`${restaurant.id}:${item.id}`}
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-black/10 py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
      >
        <button type="button" aria-label={`View ${item.name}`} onClick={() => setDetail({ item, restaurant })} className="overflow-hidden rounded-xl bg-[#e9e3d8]">
          <FadeImage alt={item.name} src={item.imageUrl ?? ITEM_FALLBACK} className={`h-[4.5rem] w-[4.5rem] object-cover ${item.available ? "" : "grayscale opacity-60"}`} />
        </button>
        <div className="min-w-0">
          <button type="button" onClick={() => openRestaurantById(restaurant.id)} className="inline-flex min-h-8 items-center text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[#c65d24] transition hover:text-[#171713]">{restaurant.name}</button>
          <button type="button" onClick={() => setDetail({ item, restaurant })} className="block text-left"><h3 className="break-words font-black tracking-[-0.02em]">{item.name}</h3></button>
          <span className="text-sm font-black tabular-nums">{formatPaise(discountedPrice(item))}</span>
        </div>
        {/* Under the dish on phones (beside it from sm up) so a long dish name is never squeezed. */}
        <div className="col-start-2 sm:col-start-3">{renderStepper(() => itemLine(item, restaurant), item.name, item.available)}</div>
      </motion.article>
    );
  }

  const showCombos = !searching && combos.length > 0;

  return (
    <main id="main-content" className="min-h-screen overflow-x-hidden bg-[#f7f3eb] text-[#171713]">
      <section className="relative border-b border-black/10">
        <SiteNav />
        {!activeRestaurant ? (
          <div className="mx-auto max-w-[1440px] px-5 pt-28 sm:px-8 lg:px-12 lg:pt-32">
            <label className="relative block max-w-xl">
              <span className="sr-only">Search dishes across every kitchen</span>
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#817a70]" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search biryani, wraps…"
                className="h-12 w-full rounded-xl border border-black/12 bg-white/80 pl-11 pr-12 text-base font-medium sm:text-sm shadow-[0_8px_24px_rgba(23,23,19,0.05)] outline-none transition focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10"
              />
              {query ? (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-[#817a70] transition hover:bg-black/5 hover:text-[#171713]"><X size={15} /></button>
              ) : null}
            </label>
            {hasFeatured && !searching ? (
              <div className="mt-5 inline-flex gap-1 rounded-xl border border-black/10 bg-white/60 p-1">
                {([{ key: "featured", label: "Featured" }, { key: "kitchens", label: "All kitchens" }] as const).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setLandingView(tab.key)}
                    className="relative min-h-10 rounded-lg px-4 py-2 text-sm font-black transition sm:px-5"
                  >
                    {landingView === tab.key ? <motion.span layoutId="landing-tab" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-lg bg-[#171713]" /> : null}
                    <span className={`relative ${landingView === tab.key ? "text-white" : "text-[#6c6458] hover:text-[#171713]"}`}>{tab.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {!searching && (landingView === "kitchens" || !hasFeatured) ? (
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="pb-12 pt-8 lg:pb-16">
                <div className="flex items-center gap-3 text-sm font-semibold text-[#746c5f]"><span className="h-px w-9 bg-[#d97706]" /> Today&apos;s kitchens</div>
                <h1 className="mt-6 max-w-5xl text-[clamp(3.25rem,7.4vw,7.4rem)] font-black leading-[0.9] tracking-[-0.055em] text-balance">Pick a kitchen.<br /><span className="text-[#c65d24]">Find your favourite.</span></h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-[#6c6458] sm:text-xl sm:leading-9">Browse restaurants serving campus today. Choose one kitchen, then build your order exactly how you like it.</p>
              </motion.div>
            ) : <div className="pb-7" />}
          </div>
        ) : (
          <div className="mx-auto max-w-[1440px] px-5 pb-8 pt-28 sm:px-8 lg:px-12 lg:pb-10 lg:pt-32">
            <button type="button" onClick={closeRestaurant} className="group inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#6c6458] transition hover:text-[#c65d24]"><ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" /> All restaurants</button>
          </div>
        )}
      </section>

      <AnimatePresence mode="wait">
        {!activeRestaurant && searching ? (
          <motion.section key="global-search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto max-w-3xl px-5 py-8 pb-32 sm:px-8">
            <p className="text-sm font-bold text-[#716a5f]">
              {globalResults.length ? `${globalResults.length} ${globalResults.length === 1 ? "dish" : "dishes"} across ${new Set(globalResults.map((result) => result.restaurant.id)).size} ${new Set(globalResults.map((result) => result.restaurant.id)).size === 1 ? "kitchen" : "kitchens"}` : null}
            </p>
            {globalResults.length ? (
              <div className="mt-3 border-t border-black/10">{globalResults.map((result) => renderSearchResult(result))}</div>
            ) : (
              <div className="grid min-h-64 place-items-center text-center">
                <div><Search className="mx-auto text-[#a49d92]" /><h2 className="mt-4 text-xl font-black">Nothing matches &ldquo;{query.trim()}&rdquo;</h2><p className="mt-2 text-sm text-[#716a5f]">Try a shorter word, like &ldquo;rice&rdquo; or &ldquo;paneer&rdquo;.</p></div>
              </div>
            )}
          </motion.section>
        ) : !activeRestaurant && landingView === "featured" && hasFeatured ? (
          <motion.section key="featured" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-8">
            <FeaturedShowcase
              data={featured}
              slotTimes={slotTimes}
              quantityOf={quantityOf}
              onAddDish={(dish, source) => addLineToCart(featuredDishLine(dish), source)}
              onStepDish={(dish, delta) => stepCartLine(dish.id, delta, () => addLineToCart(featuredDishLine(dish)))}
              onAddCombo={(combo, source) => addLineToCart(featuredComboLine(combo), source)}
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
                      transition={{ delay: Math.min(index, 8) * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => openRestaurant(restaurant)}
                      className="group text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c65d24]"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#ded8cd]">
                        <FadeImage alt={restaurant.name} className="h-full w-full object-cover transition-[opacity,transform] duration-700 group-hover:scale-[1.04]" src={restaurant.imageUrl ?? RESTAURANT_FALLBACK} />
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
          <motion.section key={activeRestaurant.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto grid max-w-[1440px] gap-6 px-5 pb-32 sm:gap-10 sm:px-8 lg:grid-cols-[21rem_1fr] lg:gap-16 lg:px-12">
            <aside className="lg:sticky lg:top-6 lg:h-fit">
              {/* Shorter on phones so the menu itself starts on the first screen. */}
              <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-[#ded8cd] sm:aspect-[4/3] lg:aspect-[4/5]">
                <FadeImage alt={activeRestaurant.name} className="h-full w-full object-cover" src={activeRestaurant.imageUrl ?? RESTAURANT_FALLBACK} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white"><p className="text-sm font-semibold text-[#f6b73c]">Now serving</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">{activeRestaurant.name}</h1></div>
              </div>
              {activeRestaurant.description ? <p className="mt-4 text-sm leading-6 text-[#6c6458] sm:mt-5 sm:text-base sm:leading-7">{activeRestaurant.description}</p> : null}
              <div className="mt-5 hidden gap-6 border-t border-black/10 pt-5 text-sm sm:flex"><div><span className="block font-black tabular-nums">{activeRestaurant.menuItems.length}</span><span className="text-[#817a70]">Dishes</span></div><div><span className="block font-black tabular-nums">{activeRestaurant.courses.length}</span><span className="text-[#817a70]">Categories</span></div></div>
            </aside>

            <div className="min-w-0">
              <div className="sticky top-0 z-30 -mx-5 border-b border-black/10 bg-[#f7f3eb]/95 px-5 pb-3 pt-3 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
                <div className="relative">
                  <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#817a70]" />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this menu" className="h-12 w-full rounded-md border border-black/12 bg-white/70 pl-11 pr-12 text-base font-medium sm:text-sm outline-none transition focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10" />
                  {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-[#817a70] transition hover:bg-black/5 hover:text-[#171713]"><X size={15} /></button> : null}
                </div>
                {chips.length > 1 ? (
                  <nav ref={chipStripRef} className="relative mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Jump to a category">
                    {chips.map((chip) => {
                      const selected = chip.id === activeSection;
                      return (
                        <button key={chip.id} data-chip={chip.id} type="button" aria-current={selected ? "true" : undefined} onClick={() => jumpTo(chip.id)} className="relative inline-flex min-h-10 shrink-0 items-center rounded-md border border-black/12 px-4 py-2 text-sm font-bold transition-colors">
                          {selected ? <motion.span layoutId={`chip-${activeRestaurant.id}`} transition={{ type: "spring", stiffness: 460, damping: 36 }} className="absolute inset-[-1px] rounded-md bg-[#171713]" /> : null}
                          <span className={`relative ${selected ? "text-white" : "text-[#625b50]"}`}>{chip.name}</span>
                        </button>
                      );
                    })}
                  </nav>
                ) : null}
              </div>

              <div className="pt-8">
                {showCombos ? (
                  <section id="menu-section-combos" data-menu-section="combos" className="mb-12">
                    <div className="flex items-end justify-between gap-4 pb-4"><div><h2 className="flex items-center gap-2 text-3xl font-black tracking-[-0.04em]"><Sparkles size={22} className="text-[#c65d24]" /> Combos</h2><p className="mt-1 text-sm text-[#716a5f]">Bundled to save — grab a full meal for less.</p></div><span className="pb-1 font-mono text-xs text-[#8c857a]">{combos.length.toString().padStart(2, "0")}</span></div>
                    <div className="grid gap-4 sm:grid-cols-2">{combos.map((combo) => renderComboCard(combo, activeRestaurant))}</div>
                  </section>
                ) : null}
                {sections.map((section) => (
                  <section key={section.id} id={`menu-section-${section.id}`} data-menu-section={section.id} className="mb-12">
                    <div className="flex items-end justify-between gap-4 pb-2"><h2 className="text-3xl font-black tracking-[-0.04em]">{section.name}</h2><span className="pb-1 font-mono text-xs text-[#8c857a]">{section.items.length.toString().padStart(2, "0")}</span></div>
                    {section.items.map((item) => renderMenuItemCard(item, activeRestaurant))}
                  </section>
                ))}
                {!sections.length && !showCombos ? <div className="grid min-h-64 place-items-center border-y border-black/10 text-center"><div><Search className="mx-auto text-[#a49d92]" /><h2 className="mt-4 text-xl font-black">No matching dishes</h2><p className="mt-2 text-sm text-[#716a5f]">Try another name, or clear the search.</p></div></div> : null}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Dish sheet: bigger photo and full description, drag down or tap outside to close. */}
      <AnimatePresence>
        {detail ? (
          <motion.div
            key="dish-sheet"
            className="fixed inset-0 z-[105] grid place-items-end bg-[#171713]/55 backdrop-blur-sm sm:place-items-center sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={detail.item.name}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              drag="y"
              dragControls={sheetDrag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 650) setDetail(null); }}
              className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-[#fffdf8] shadow-[0_30px_100px_rgba(0,0,0,0.3)] sm:rounded-3xl"
            >
              <div className="relative touch-none" onPointerDown={(event) => sheetDrag.start(event)}>
                <span className="absolute left-1/2 top-2.5 z-10 h-1.5 w-11 -translate-x-1/2 rounded-full bg-white/80 shadow sm:hidden" aria-hidden="true" />
                <FadeImage alt={detail.item.name} src={detail.item.imageUrl ?? ITEM_FALLBACK} className={`aspect-[4/3] w-full object-cover ${detail.item.available ? "" : "grayscale"}`} draggable={false} />
                <button type="button" aria-label="Close" onClick={() => setDetail(null)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-[#171713] shadow transition hover:bg-white"><X size={18} /></button>
                {detail.item.discountPercent ? <span className="absolute left-4 top-4 rounded-md bg-[#f6b73c] px-2.5 py-1 text-xs font-black text-[#171713]">{detail.item.discountPercent}% off</span> : null}
              </div>
              <div className="p-6">
                <button type="button" onClick={() => { const id = detail.restaurant.id; setDetail(null); openRestaurantById(id); }} className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#c65d24] transition hover:text-[#171713]">{detail.restaurant.name}</button>
                <h2 className="mt-1.5 text-3xl font-black leading-tight tracking-[-0.04em]">{detail.item.name}</h2>
                {detail.item.description ? <p className="mt-3 leading-7 text-[#6c6458]">{detail.item.description}</p> : null}
                <div className="mt-6 flex items-center justify-between gap-4 border-t border-black/10 pt-5">
                  <div>
                    <span className="text-2xl font-black tabular-nums">{formatPaise(discountedPrice(detail.item))}</span>
                    {detail.item.discountPercent ? <span className="ml-2 text-sm tabular-nums text-[#9a9388] line-through">{formatPaise(detail.item.pricePaise)}</span> : null}
                  </div>
                  {renderStepper(() => itemLine(detail.item, detail.restaurant), detail.item.name, detail.item.available, "lg")}
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {cartCount > 0 && !detail ? (
          <motion.div key="cart-bar" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6" initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 32 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
            <div className="w-full max-w-md">
              <Link href="/cart" data-cart-target="" className="menu-cart-link pointer-events-auto flex min-h-16 items-center justify-between rounded-xl bg-[#171713] px-3 py-2 shadow-[0_20px_60px_rgba(23,23,19,0.28)] transition hover:-translate-y-0.5 active:scale-[0.99]">
                <span className="flex items-center gap-3"><span className="relative grid h-11 w-11 place-items-center rounded-lg bg-white/10"><ShoppingBag size={19} /><motion.span key={cartCount} initial={{ scale: 1.45 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 520, damping: 16 }} className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#f6b73c] px-1 text-[11px] font-black text-[#171713]">{cartCount}</motion.span></span><span><span className="block text-sm font-bold">View your cart</span><span className="block text-xs text-white/50">{cart[0]?.restaurantName ?? "Ready when you are"}</span></span></span>
                <span className="flex items-center gap-3"><AnimatedPaise value={cartTotal} className="font-black tabular-nums" /><ArrowRight size={17} /></span>
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <SiteFooter />
    </main>
  );
}
