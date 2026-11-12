"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, MapPin, MessageCircle, Minus, Plus, Search, ShoppingBag, ShoppingBasket, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatedPaise } from "@/components/customer/AnimatedPaise";
import { FadeImage } from "@/components/customer/FadeImage";
import { RememberDetails } from "@/components/customer/RememberDetails";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { SiteNav } from "@/components/customer/SiteNav";
import { Dropdown } from "@/components/ui/dropdown";
import { flyToCart, tapFeedback } from "@/lib/cart-feedback";
import { MAX_LINE_QUANTITY } from "@/lib/cart";
import { readStoredCampus, writeStoredCampus, type CampusPublic } from "@/lib/customer-campus";
import { forgetStoredIdentity, readStoredIdentity, writeStoredIdentity } from "@/lib/customer-identity";
import { calculateGst, GST_RATE_BPS } from "@/lib/money";
import { formatPaise } from "@/lib/utils";

type ShopItem = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  discountPercent: number;
  imageUrl: string | null;
  courseId: string;
  sizeLabel: string | null;
  isVeg: boolean | null;
  sizeOrder: number;
};

// Same dish, several rows: one card, with each row as a size. Rows without a size
// label are a single option.
type ShopDish = {
  key: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  courseId: string;
  sizes: ShopItem[];
};

type ShopCombo = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  comboPricePaise: number;
  items: {
    id: string;
    quantity: number;
    menuItem: { id: string; name: string; imageUrl: string | null; pricePaise: number; discountPercent: number; available: boolean };
  }[];
};

type Shop = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  acceptingOrders: boolean;
  restrictedToCampusCode: string | null;
  whatsappNumber: string | null;
  courses: { id: string; name: string }[];
  menuItems: ShopItem[];
  combos: ShopCombo[];
};

type CartLine = {
  key: string;
  kind: "item" | "combo";
  id: string;
  name: string;
  imageUrl: string | null;
  unitPricePaise: number;
  quantity: number;
};

const FALLBACK = "/dish-placeholder.webp";

const fieldClass =
  "h-12 w-full rounded-md border border-black/12 bg-white/80 px-4 text-sm font-medium text-[#171713] outline-none transition placeholder:text-[#9a9388] focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10";

function discountedPrice(pricePaise: number, discountPercent: number) {
  return Math.round(pricePaise * (1 - discountPercent / 100));
}

function comboUndiscountedTotal(combo: ShopCombo) {
  return combo.items.reduce((sum, entry) => sum + discountedPrice(entry.menuItem.pricePaise, entry.menuItem.discountPercent) * entry.quantity, 0);
}

function VegMark({ isVeg }: { isVeg: boolean | null }) {
  if (isVeg === null || isVeg === undefined) return null;
  const tone = isVeg ? "#0B8A3E" : "#B3261E";
  return (
    <span
      aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
      title={isVeg ? "Vegetarian" : "Non-vegetarian"}
      className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px]"
      style={{ borderColor: tone }}
    >
      <span className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone }} />
    </span>
  );
}

export function GroceriesStorefront({ shop, campuses }: { shop: Shop; campuses: CampusPublic[] }) {
  const [campusCode, setCampusCode] = useState<string | null>(null);
  useEffect(() => {
    const stored = readStoredCampus();
    // After mount, so the server HTML does not depend on this device's saved campus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCampusCode(stored && campuses.some((entry) => entry.code === stored) ? stored : campuses[0]?.code ?? null);
  }, [campuses]);

  function chooseCampus(code: string) {
    setCampusCode(code);
    writeStoredCampus(code);
  }

  const campus = campuses.find((entry) => entry.code === campusCode) ?? null;
  const allowedHere = campusCode === null ? null : !shop.restrictedToCampusCode || shop.restrictedToCampusCode === campusCode;
  const restrictedCampusName = campuses.find((entry) => entry.code === shop.restrictedToCampusCode)?.name ?? shop.restrictedToCampusCode;
  const campusOptions = useMemo(() => campuses.map((entry) => ({ value: entry.code, label: entry.name })), [campuses]);

  const [activeCourse, setActiveCourse] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState<"all" | "veg" | "nonveg">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rememberContact, setRememberContact] = useState(false);
  // `opened` is whether the browser allowed window.open after the request. iOS Safari
  // often blocks it, and the shop only sees the order once the customer sends the chat.
  const [result, setResult] = useState<{ trackingCode: string; totalPaise: number; whatsappUrl: string; opened: boolean } | null>(null);
  // Timing is agreed in the WhatsApp thread, so checkout never asks for a slot. Hostel
  // delivery is night-slot only, which this shop does not offer, so pickup is the gate.
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });

  useEffect(() => {
    const stored = readStoredIdentity();
    if (!stored) return;
    // After mount, so a saved name never disagrees with the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRememberContact(true);
    setCustomer((current) => ({ ...current, name: stored.name, email: stored.email, phone: stored.phone }));
  }, []);

  const cartStorageKey = `dish2door_groceries_cart_${shop.id}`;
  const cartHydrated = useRef(false);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(cartStorageKey) ?? "[]");
      if (Array.isArray(saved)) {
        const itemsById = new Map(shop.menuItems.map((item) => [item.id, item]));
        const combosById = new Map(shop.combos.map((combo) => [combo.id, combo]));
        const restored = saved.flatMap((line: Partial<CartLine>): CartLine[] => {
          if (!line || typeof line.id !== "string" || !Number.isInteger(line.quantity) || (line.quantity as number) < 1) return [];
          const quantity = Math.min(line.quantity as number, MAX_LINE_QUANTITY);
          if (line.kind === "combo") {
            const combo = combosById.get(line.id);
            return combo ? [{ key: `combo:${combo.id}`, kind: "combo", id: combo.id, name: combo.name, imageUrl: combo.imageUrl, unitPricePaise: combo.comboPricePaise, quantity }] : [];
          }
          const item = itemsById.get(line.id);
          if (!item) return [];
          const name = item.sizeLabel ? `${item.name} — ${item.sizeLabel}` : item.name;
          return [{ key: `item:${item.id}`, kind: "item", id: item.id, name, imageUrl: item.imageUrl, unitPricePaise: discountedPrice(item.pricePaise, item.discountPercent), quantity }];
        });
        // Read after mount on purpose: the server-rendered page has an empty cart, and
        // restoring during render would mismatch hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (restored.length) setCart(restored);
      }
    } catch {
      // Storage unavailable or corrupt: start with an empty cart.
    }
    cartHydrated.current = true;
  }, [cartStorageKey, shop.menuItems, shop.combos]);

  useEffect(() => {
    if (!cartHydrated.current) return;
    try {
      if (cart.length) window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      else window.localStorage.removeItem(cartStorageKey);
    } catch {
      // Private browsing: the cart still works for this visit.
    }
  }, [cart, cartStorageKey]);

  useEffect(() => {
    if (!checkoutOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCheckoutOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [checkoutOpen]);

  const dishes = useMemo<ShopDish[]>(() => {
    const byKey = new Map<string, ShopItem[]>();
    for (const item of shop.menuItems) {
      const key = `${item.courseId}::${item.name}`;
      const list = byKey.get(key);
      if (list) list.push(item);
      else byKey.set(key, [item]);
    }
    return Array.from(byKey.values()).map((rows) => {
      const sizes = [...rows].sort((a, b) => a.sizeOrder - b.sizeOrder || a.pricePaise - b.pricePaise);
      const [first] = sizes;
      return { key: `${first.courseId}::${first.name}`, name: first.name, description: first.description, imageUrl: first.imageUrl, courseId: first.courseId, sizes };
    });
  }, [shop.menuItems]);

  const availableCourses = shop.courses.filter((course) => dishes.some((dish) => dish.courseId === course.id));

  const visibleDishes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return dishes.filter((dish) => {
      if (activeCourse !== "all" && dish.courseId !== activeCourse) return false;
      if (dietaryFilter === "veg" && !dish.sizes.some((size) => size.isVeg === true)) return false;
      if (dietaryFilter === "nonveg" && !dish.sizes.some((size) => size.isVeg === false)) return false;
      if (query && !`${dish.name} ${dish.description ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [activeCourse, dietaryFilter, dishes, searchQuery]);

  const sections = useMemo(() => {
    return availableCourses
      .map((course) => ({ ...course, dishes: visibleDishes.filter((dish) => dish.courseId === course.id) }))
      .filter((section) => section.dishes.length > 0);
  }, [availableCourses, visibleDishes]);

  const [selectedSizeByDish, setSelectedSizeByDish] = useState<Record<string, string>>({});
  function selectedSizeOf(dish: ShopDish): ShopItem {
    const pickedId = selectedSizeByDish[dish.key];
    return dish.sizes.find((size) => size.id === pickedId) ?? dish.sizes[0];
  }

  function lineQuantity(kind: "item" | "combo", id: string) {
    return cart.find((line) => line.kind === kind && line.id === id)?.quantity ?? 0;
  }

  function addLine(kind: "item" | "combo", id: string, name: string, imageUrl: string | null, unitPricePaise: number, source?: Element | null) {
    if (lineQuantity(kind, id) >= MAX_LINE_QUANTITY) {
      toast.error(`You can order up to ${MAX_LINE_QUANTITY} of one item.`, { id: "line-quantity-cap" });
      return;
    }
    setCart((current) => {
      const key = `${kind}:${id}`;
      const existing = current.find((line) => line.key === key);
      if (existing) return current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { key, kind, id, name, imageUrl, unitPricePaise, quantity: 1 }];
    });
    if (lineQuantity(kind, id) === 0) flyToCart(source ?? null);
    else tapFeedback();
  }

  function adjustLine(kind: "item" | "combo", id: string, delta: number) {
    if (delta > 0 && lineQuantity(kind, id) + delta > MAX_LINE_QUANTITY) {
      toast.error(`You can order up to ${MAX_LINE_QUANTITY} of one item.`, { id: "line-quantity-cap" });
      return;
    }
    const key = `${kind}:${id}`;
    setCart((current) => current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + delta } : line)).filter((line) => line.quantity > 0));
    tapFeedback();
  }

  const totals = useMemo(() => {
    const subtotalPaise = cart.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);
    const platformFeePaise = campus?.platformFeePaise ?? 0;
    const taxPaise = calculateGst(subtotalPaise, GST_RATE_BPS);
    return { subtotalPaise, platformFeePaise, taxPaise, totalPaise: subtotalPaise + platformFeePaise + taxPaise };
  }, [cart, campus]);

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const heroImage = shop.imageUrl ?? shop.combos[0]?.imageUrl ?? shop.menuItems[0]?.imageUrl ?? FALLBACK;

  function validate(): boolean {
    if (!shop.acceptingOrders) { toast.error("This shop isn't taking orders right now."); return false; }
    if (!cart.length) { toast.error("Add something to your order first."); return false; }
    if (!campus) { toast.error("Please choose your campus."); return false; }
    if (customer.name.trim().length < 2) { toast.error("Please enter your name."); return false; }
    if (!/^[6-9]\d{9}$/.test(customer.phone.replace(/\D/g, "").slice(-10))) { toast.error("Enter a valid 10-digit Indian mobile number."); return false; }
    if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) { toast.error("Enter a valid email address, or leave it blank."); return false; }
    return true;
  }

  async function submitOrder() {
    if (busy || !validate() || !campus) return;
    setBusy(true);
    try {
      const response = await fetch("/api/orders/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim() || undefined,
            phone: customer.phone.trim(),
            deliveryType: "GATE",
            campusCode: campus.code
          },
          items: cart.map((line) => (line.kind === "combo" ? { comboId: line.id, quantity: line.quantity } : { menuItemId: line.id, quantity: line.quantity }))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not place the order");
      writeStoredIdentity({ name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim() }, { remember: rememberContact });
      setCart([]);
      const opened = Boolean(window.open(data.whatsappUrl, "_blank"));
      setResult({ ...data, opened });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not place the order");
    } finally {
      setBusy(false);
    }
  }

  function renderStepper(kind: "item" | "combo", id: string, name: string, imageUrl: string | null, unitPricePaise: number) {
    const quantity = lineQuantity(kind, id);
    if (quantity > 0) {
      return (
        <div className="flex h-10 items-center rounded-md bg-[#171713] text-white shadow-[0_8px_24px_rgba(23,23,19,0.16)]">
          <button type="button" aria-label={`Decrease ${name}`} className="grid h-10 w-10 place-items-center transition hover:bg-white/10" onClick={() => adjustLine(kind, id, -1)}><Minus size={15} /></button>
          <span className="w-7 text-center text-sm font-black tabular-nums">{quantity}</span>
          <button type="button" aria-label={`Increase ${name}`} className="grid h-10 w-10 place-items-center transition hover:bg-white/10" onClick={() => adjustLine(kind, id, 1)}><Plus size={15} /></button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={(event) => addLine(kind, id, name, imageUrl, unitPricePaise, event.currentTarget)}
        className="h-10 min-w-24 rounded-md border border-black/15 bg-white px-5 text-sm font-black text-[#171713] transition duration-200 hover:border-[#f6b73c] hover:bg-[#f6b73c] active:scale-95"
      >
        Add
      </button>
    );
  }

  if (campusCode === null) {
    return (
      <main className="min-h-screen bg-[#f7f3eb]">
        <SiteNav />
      </main>
    );
  }

  if (!allowedHere) {
    return (
      <main id="main-content" className="min-h-screen bg-[#f7f3eb] text-[#171713]">
        <SiteNav />
        <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-32 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e9e5dd] text-[#c65d24]"><ShoppingBasket size={28} /></span>
          <h1 className="mt-8 text-4xl font-black tracking-[-0.04em] sm:text-5xl">We&apos;re not delivering here yet.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-[#625b50]">
            {shop.name} currently only delivers to <span className="font-bold text-[#c65d24]">{restrictedCampusName}</span>, and your campus is set to{" "}
            <span className="font-bold">{campus?.name ?? "an unsupported campus"}</span>. Switch your campus below if that isn&apos;t right.
          </p>
          <div className="mt-8">
            <Dropdown tone="customer" ariaLabel="Your campus" className="min-w-52" value={campusCode} onChange={chooseCampus} options={campusOptions} />
          </div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen overflow-x-hidden bg-[#f7f3eb] text-[#171713]">
      <section className="relative border-b border-black/10">
        <SiteNav />
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 pb-12 pt-28 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:pb-16 lg:pt-32">
          <div>
            <div className="flex items-center gap-3 text-sm font-semibold text-[#746c5f]">
              <span className="h-px w-9 bg-[#d97706]" /> Order on WhatsApp
            </div>
            <h1 className="mt-6 max-w-3xl text-[clamp(3.25rem,7vw,6.5rem)] font-black leading-[0.9] tracking-[-0.055em] text-balance">
              {shop.name}.<br /><span className="text-[#c65d24]">To your campus.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#625b50]">
              {shop.description ?? "Build your grocery order here, confirm it on WhatsApp, and pay by cash or UPI when it is handed over."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Dropdown tone="customer" ariaLabel="Your campus" className="min-w-48" value={campusCode} onChange={chooseCampus} options={campusOptions} />
              <span className="inline-flex items-center gap-2 rounded-full bg-[#e7f6ee] px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#146c3a]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#146c3a]" /> Open
              </span>
            </div>
            <div className="mt-8 grid max-w-xl gap-px overflow-hidden rounded-xl border border-black/10 bg-black/10 sm:grid-cols-3">
              {[
                [MessageCircle, "Confirm on WhatsApp"],
                [ShoppingBag, "Pay at handover"],
                [MapPin, "Campus gate pickup"]
              ].map(([Icon, label]) => (
                <div key={label as string} className="flex items-center gap-2 bg-[#fffdf8] px-4 py-3 text-sm font-bold">
                  <Icon size={16} className="shrink-0 text-[#c65d24]" />
                  {label as string}
                </div>
              ))}
            </div>
          </div>
          <div className="relative min-h-72 overflow-hidden rounded-[2rem] bg-[#ded8cd]">
            <FadeImage alt={shop.name} src={heroImage} className="h-full min-h-72 w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <p className="absolute bottom-6 left-6 right-6 text-lg font-bold text-white">Fresh stock, packed for campus handover.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <div className="sticky top-0 z-30 -mx-5 border-b border-black/10 bg-[#f7f3eb]/95 px-5 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:mx-0 lg:rounded-none lg:px-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Search groceries</span>
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#817a70]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search rice, snacks, drinks…"
                className="h-12 w-full rounded-md border border-black/12 bg-white/80 pl-11 pr-12 text-sm font-medium outline-none transition focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10"
              />
              {searchQuery ? (
                <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-[#817a70] transition hover:bg-black/5">
                  <X size={15} />
                </button>
              ) : null}
            </label>
            <div className="flex items-center gap-2" role="group" aria-label="Dietary preference">
              {([
                ["all", "All"],
                ["veg", "Veg"],
                ["nonveg", "Non-veg"]
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDietaryFilter(value)}
                  className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition ${dietaryFilter === value ? "border-[#171713] bg-[#171713] text-white" : "border-black/12 bg-white/70 text-[#625b50] hover:border-black/30"}`}
                >
                  {value !== "all" ? <VegMark isVeg={value === "veg"} /> : null}
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => itemCount > 0 && setCheckoutOpen(true)}
              data-cart-target=""
              className="hidden h-12 items-center gap-2 rounded-md bg-[#171713] px-4 text-sm font-black text-white lg:inline-flex"
            >
              <ShoppingBag size={16} />
              <span className="tabular-nums">{itemCount}</span>
              <span className="text-white/70">·</span>
              <AnimatedPaise value={totals.subtotalPaise} />
            </button>
          </div>
          {availableCourses.length > 0 ? (
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Categories">
              {[{ id: "all", name: "All" }, ...availableCourses].map((course) => {
                const selected = course.id === activeCourse;
                return (
                  <button
                    key={course.id}
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => setActiveCourse(course.id)}
                    className="relative inline-flex min-h-10 shrink-0 items-center rounded-md border border-black/12 px-4 text-sm font-bold"
                  >
                    {selected ? <motion.span layoutId="grocery-course" transition={{ type: "spring", stiffness: 460, damping: 36 }} className="absolute inset-[-1px] rounded-md bg-[#171713]" /> : null}
                    <span className={`relative ${selected ? "text-white" : "text-[#625b50]"}`}>{course.name}</span>
                  </button>
                );
              })}
            </nav>
          ) : null}
        </div>

        {shop.combos.length ? (
          <section className="mt-10">
            <div className="flex items-end justify-between gap-4 pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-3xl font-black tracking-[-0.04em]"><Sparkles size={22} className="text-[#c65d24]" /> Bundles</h2>
                <p className="mt-1 text-sm text-[#716a5f]">Fixed-price packs. The saving is already in the price.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {shop.combos.map((combo) => {
                const undiscountedTotal = comboUndiscountedTotal(combo);
                const savingsPaise = Math.max(0, undiscountedTotal - combo.comboPricePaise);
                const savingsPercent = undiscountedTotal > 0 ? Math.round((savingsPaise / undiscountedTotal) * 100) : 0;
                return (
                  <article key={combo.id} className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-[0_12px_40px_rgba(23,23,19,0.05)]">
                    <div className="grid grid-cols-[1fr_7.25rem] gap-5 sm:grid-cols-[1fr_9rem]">
                      <div className="flex min-w-0 flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#171713] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#f6b73c]"><Sparkles size={11} /> Bundle</span>
                          {savingsPercent > 0 ? <span className="rounded-md bg-[#f6b73c] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#171713]">Save {savingsPercent}%</span> : null}
                        </div>
                        <h3 className="mt-3 text-lg font-black tracking-[-0.025em] sm:text-xl">{combo.name}</h3>
                        {combo.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#716a5f]">{combo.description}</p> : null}
                        <ul className="mt-2 space-y-0.5 text-sm leading-6 text-[#716a5f]">
                          {combo.items.map((line) => (
                            <li key={line.id}><span className="font-black tabular-nums text-[#171713]">{line.quantity}×</span> {line.menuItem.name}</li>
                          ))}
                        </ul>
                        <div className="mt-auto flex items-baseline gap-2 pt-4">
                          <span className="text-lg font-black tabular-nums">{formatPaise(combo.comboPricePaise)}</span>
                          {savingsPaise > 0 ? <span className="text-sm tabular-nums text-[#9a9388] line-through">{formatPaise(undiscountedTotal)}</span> : null}
                        </div>
                      </div>
                      <div className="relative min-h-32 pb-5">
                        <div className="overflow-hidden rounded-xl bg-[#e9e3d8]">
                          <FadeImage alt={combo.name} src={combo.imageUrl ?? combo.items[0]?.menuItem.imageUrl ?? FALLBACK} className="h-28 w-full object-cover sm:h-32" />
                        </div>
                        <div className="absolute bottom-0 right-0">{renderStepper("combo", combo.id, combo.name, combo.imageUrl, combo.comboPricePaise)}</div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {!shop.menuItems.length && !shop.combos.length ? (
          <div className="mt-12 grid min-h-64 place-items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 text-center">
            <div>
              <ShoppingBasket className="mx-auto text-[#a49d92]" />
              <h2 className="mt-4 text-xl font-black">The shelves are being stocked</h2>
              <p className="mt-2 text-sm text-[#716a5f]">Items will show up here as soon as the shop adds them.</p>
            </div>
          </div>
        ) : sections.length === 0 ? (
          <div className="mt-12 grid min-h-64 place-items-center text-center">
            <div>
              <Search className="mx-auto text-[#a49d92]" />
              <h2 className="mt-4 text-xl font-black">Nothing matches</h2>
              <p className="mt-2 text-sm text-[#716a5f]">Try another word, or clear the category and diet filters.</p>
              <button type="button" onClick={() => { setActiveCourse("all"); setDietaryFilter("all"); setSearchQuery(""); }} className="mt-5 h-10 rounded-md bg-[#171713] px-5 text-sm font-black text-white">
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.id} className="mt-12">
              <div className="flex items-end justify-between gap-4 pb-2">
                <h2 className="text-3xl font-black tracking-[-0.04em]">{section.name}</h2>
                <span className="pb-1 font-mono text-xs text-[#8c857a]">{section.dishes.length.toString().padStart(2, "0")}</span>
              </div>
              {section.dishes.map((dish) => {
                const hasSizes = dish.sizes.length > 1;
                const selected = selectedSizeOf(dish);
                const unitPrice = discountedPrice(selected.pricePaise, selected.discountPercent);
                const cartName = selected.sizeLabel ? `${dish.name} — ${selected.sizeLabel}` : dish.name;
                return (
                  <article key={dish.key} className="grid grid-cols-[1fr_7.25rem] gap-5 border-t border-black/10 py-6 sm:grid-cols-[1fr_9rem] sm:py-7">
                    <div className="flex min-w-0 flex-col items-start">
                      <div className="flex items-start gap-2">
                        <VegMark isVeg={selected.isVeg} />
                        <h3 className="text-lg font-black tracking-[-0.025em] sm:text-xl">{dish.name}</h3>
                      </div>
                      {dish.description ? <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 text-[#716a5f]">{dish.description}</p> : null}
                      {hasSizes ? (
                        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Choose a size for ${dish.name}`}>
                          {dish.sizes.map((size) => {
                            const picked = size.id === selected.id;
                            return (
                              <button
                                key={size.id}
                                type="button"
                                onClick={() => setSelectedSizeByDish((current) => ({ ...current, [dish.key]: size.id }))}
                                className={`min-h-9 rounded-md border px-3 text-xs font-black transition ${picked ? "border-[#171713] bg-[#171713] text-white" : "border-black/15 bg-white text-[#625b50] hover:border-black/30"}`}
                              >
                                {size.sizeLabel ?? "Regular"}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                        <span className="font-black tabular-nums">{formatPaise(unitPrice)}</span>
                        {selected.discountPercent ? (
                          <>
                            <span className="text-sm tabular-nums text-[#9a9388] line-through">{formatPaise(selected.pricePaise)}</span>
                            <span className="rounded-sm bg-[#f6b73c] px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em]">{selected.discountPercent}% off</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="relative min-h-32 pb-5">
                      <div className="overflow-hidden rounded-xl bg-[#e9e3d8]">
                        <FadeImage alt={dish.name} src={selected.imageUrl ?? dish.imageUrl ?? FALLBACK} className="h-28 w-full object-cover sm:h-32" />
                      </div>
                      <div className="absolute bottom-0 right-0">{renderStepper("item", selected.id, cartName, selected.imageUrl ?? dish.imageUrl, unitPrice)}</div>
                    </div>
                  </article>
                );
              })}
            </section>
          ))
        )}
      </div>

      <div className="pb-28 lg:pb-16">
        <SiteFooter />
      </div>

      <AnimatePresence>
        {itemCount > 0 && !checkoutOpen ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            onClick={() => setCheckoutOpen(true)}
            data-cart-target=""
            className="fixed inset-x-5 bottom-5 z-40 mx-auto flex h-16 max-w-md items-center justify-between rounded-2xl bg-[#171713] px-6 text-white shadow-[0_20px_60px_rgba(23,23,19,0.28)] lg:hidden"
          >
            <span className="flex items-center gap-3 font-black">
              <ShoppingBag size={19} /> {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="flex items-center gap-2 font-black tabular-nums">
              <AnimatedPaise value={totals.subtotalPaise} /> <ArrowRight size={16} />
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {checkoutOpen ? (
          <motion.div
            className="fixed inset-0 z-[100] grid place-items-end bg-[#171713]/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="groceries-checkout-title"
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#fffdf8] p-5 text-[#171713] shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:rounded-3xl sm:p-7"
            >
              {result ? (
                <div className="py-4 text-center">
                  <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${result.opened ? "bg-[#e7f6ee] text-[#146c3a]" : "bg-[#25D366]/15 text-[#128C7E]"}`}>
                    {result.opened ? <Check size={30} strokeWidth={2.5} /> : <MessageCircle size={30} />}
                  </span>
                  <h2 className="mt-6 text-3xl font-black tracking-[-0.04em]">{result.opened ? "Almost done" : "One last step"}</h2>
                  <p className="mt-3 leading-7 text-[#625b50]">
                    {result.opened
                      ? "Tap Send in WhatsApp. The shop receives your order only when that message is sent."
                      : "Your order is saved. The shop only receives it when you send it on WhatsApp."}
                  </p>
                  <p className="mt-2 text-sm text-[#625b50]">Tracking code <span className="font-black text-[#c65d24]">{result.trackingCode}</span> · pay by cash or UPI at handover.</p>
                  <p className="mt-1 text-sm text-[#8c857a]">Total: {formatPaise(result.totalPaise)}</p>
                  <div className="mt-7 grid gap-2">
                    <a href={result.whatsappUrl} target="_blank" rel="noreferrer" className="flex h-[3.25rem] items-center justify-center gap-2 rounded-md bg-[#25D366] text-sm font-black text-white transition hover:brightness-105">
                      <MessageCircle size={17} /> {result.opened ? "Open WhatsApp again" : "Send order on WhatsApp"}
                    </a>
                    <button type="button" onClick={() => { setResult(null); setCheckoutOpen(false); }} className="h-12 rounded-md border border-black/15 text-sm font-black transition hover:bg-black/5">
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <h2 id="groceries-checkout-title" className="text-3xl font-black tracking-[-0.04em]">Your order</h2>
                      <p className="mt-1 text-sm text-[#625b50]">Confirm on WhatsApp, then pay by cash or UPI at handover.</p>
                    </div>
                    <button type="button" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#625b50] transition hover:bg-black/5">
                      <X size={19} />
                    </button>
                  </div>

                  <div className="mt-5 space-y-3 border-b border-black/10 pb-5">
                    {cart.map((line) => (
                      <div key={line.key} className="flex items-center gap-3">
                        <FadeImage alt="" src={line.imageUrl ?? FALLBACK} className="h-12 w-12 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{line.name}</p>
                          <p className="text-xs text-[#8c857a]">{formatPaise(line.unitPricePaise)} each</p>
                        </div>
                        <div className="flex h-8 items-center rounded-full border border-black/10 bg-white">
                          <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => adjustLine(line.kind, line.id, -1)} className="grid h-8 w-8 place-items-center"><Minus size={12} /></button>
                          <span className="w-5 text-center text-xs font-black tabular-nums">{line.quantity}</span>
                          <button type="button" aria-label={`Increase ${line.name}`} onClick={() => adjustLine(line.kind, line.id, 1)} className="grid h-8 w-8 place-items-center"><Plus size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {campuses.length > 1 ? (
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-[#625b50]">Campus</span>
                      <Dropdown tone="customer" ariaLabel="Your campus" className="min-w-44" value={campusCode} onChange={chooseCampus} options={campusOptions} />
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-bold">Full name<input className={`${fieldClass} mt-2`} autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} placeholder="Your name" /></label>
                    <label className="text-sm font-bold">Phone number<input className={`${fieldClass} mt-2`} inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} placeholder="10-digit number" /></label>
                    <label className="text-sm font-bold sm:col-span-2">Email (optional)<input className={`${fieldClass} mt-2`} type="email" autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} placeholder="you@example.com" /></label>
                  </div>
                  <div className="mt-4">
                    <RememberDetails checked={rememberContact} onChange={(checked) => { setRememberContact(checked); if (!checked) forgetStoredIdentity(); }} />
                  </div>
                  <div className="mt-5 flex items-start gap-3 rounded-xl border border-black/10 bg-white/70 p-4">
                    <MapPin size={18} className="mt-0.5 shrink-0 text-[#c65d24]" />
                    <div>
                      <p className="text-sm font-black">Campus gate pickup</p>
                      <p className="mt-0.5 text-xs text-[#625b50]">We&apos;ll agree the handover time with you on WhatsApp.</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2 rounded-xl border border-black/10 bg-[#f7f3eb] p-4 text-sm">
                    <div className="flex justify-between text-[#625b50]"><span>Items subtotal</span><span className="tabular-nums text-[#171713]">{formatPaise(totals.subtotalPaise)}</span></div>
                    <div className="flex justify-between text-[#625b50]"><span>GST (5%)</span><span className="tabular-nums text-[#171713]">{formatPaise(totals.taxPaise)}</span></div>
                    <div className="flex justify-between text-[#625b50]"><span>Platform fee</span><span className="tabular-nums text-[#171713]">{formatPaise(totals.platformFeePaise)}</span></div>
                    <div className="flex justify-between border-t border-black/10 pt-2 text-base font-black"><span>Total</span><AnimatedPaise value={totals.totalPaise} className="tabular-nums" /></div>
                    <p className="pt-1 text-xs leading-5 text-[#8c857a]">No online payment here. Pay by cash or UPI when your order is handed over.</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !shop.acceptingOrders}
                    onClick={submitOrder}
                    className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-md bg-[#25D366] text-sm font-black text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MessageCircle size={18} /> {busy ? "Sending..." : "Confirm on WhatsApp"}
                  </button>
                  <p className="mt-3 text-center text-xs text-[#8c857a]">
                    Prefer a kitchen instead? <Link href="/menu" className="font-bold text-[#c65d24] underline-offset-2 hover:underline">Browse the menu</Link>
                  </p>
                </>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
