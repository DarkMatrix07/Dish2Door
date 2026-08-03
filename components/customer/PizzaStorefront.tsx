"use client";

import Link from "next/link";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Flame,
  GraduationCap,
  HandCoins,
  MapPin,
  Minus,
  MessageCircle,
  Plus,
  Pizza as PizzaIcon,
  ShoppingBag,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { SiteNav } from "@/components/customer/SiteNav";
import { HostelPicker } from "@/components/customer/HostelPicker";
import { readStoredCampus, writeStoredCampus, type CampusPublic } from "@/lib/customer-campus";
import { readStoredIdentity, writeStoredIdentity } from "@/lib/customer-identity";
import { formatIndiaMinutes, getIndiaMinutes, ORDER_SLOT_DETAILS } from "@/lib/order-slots";
import { formatPaise } from "@/lib/utils";

type PizzaMenuItem = {
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

// Domino's-style menus load one dish as several MenuItem rows (same name+course,
// different sizeLabel/pricePaise). We group those rows into a single dish card with
// a size selector; dishes without size variants just get one entry in `sizes`.
type PizzaDish = {
  key: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  courseId: string;
  sizes: PizzaMenuItem[];
};

type PizzaCombo = {
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

type PizzaShop = {
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
  menuItems: PizzaMenuItem[];
  combos: PizzaCombo[];
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

function discountedPrice(pricePaise: number, discountPercent: number) {
  return Math.round(pricePaise * (1 - discountPercent / 100));
}

function comboUndiscountedTotal(combo: PizzaCombo) {
  return combo.items.reduce((sum, entry) => sum + discountedPrice(entry.menuItem.pricePaise, entry.menuItem.discountPercent) * entry.quantity, 0);
}

const fieldClass =
  "h-12 w-full rounded-lg border border-[#0B1F33]/15 bg-white px-4 text-sm font-medium text-[#0B1F33] outline-none transition placeholder:text-[#5A6B7B]/60 focus:border-[#E31837] focus:ring-2 focus:ring-[#E31837]/15";

// Campus switcher used both for the "not delivering here" block state and inside the
// checkout drawer, so a customer can correct a stale stored campus without leaving the page.
function CampusSwitcher({ campuses, value, onChange }: { campuses: CampusPublic[]; value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const selected = campuses.find((entry) => entry.code === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={boxRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 items-center justify-between gap-3 rounded-lg border border-[#0B1F33]/15 bg-white px-4 text-sm font-black text-[#0B1F33] transition hover:border-[#006491]"
      >
        <GraduationCap size={16} className="text-[#006491]" />
        {selected?.name ?? "Choose campus"}
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-[#0B1F33]/10 bg-white p-1 shadow-[0_18px_50px_rgba(11,31,51,0.18)]"
          >
            {campuses.map((entry) => {
              const picked = entry.code === value;
              return (
                <li key={entry.code} role="option" aria-selected={picked}>
                  <button
                    type="button"
                    onClick={() => { onChange(entry.code); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition ${picked ? "bg-[#E31837] text-white" : "text-[#0B1F33]/85 hover:bg-[#F6F7F9]"}`}
                  >
                    {entry.name}
                    {picked ? <Check size={14} /> : null}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// The square-with-dot mark Indian menus use. Rendered only when the kitchen has
// classified the dish, so we never imply "veg" for food we have no data on.
function VegMark({ isVeg }: { isVeg: boolean | null }) {
  if (isVeg === null || isVeg === undefined) return null;
  const tone = isVeg ? "#0B8A3E" : "#B3261E";
  return (
    <span
      aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
      title={isVeg ? "Vegetarian" : "Non-vegetarian"}
      className="mt-1.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px]"
      style={{ borderColor: tone }}
    >
      <span className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone }} />
    </span>
  );
}

export function PizzaStorefront({ shop, campuses, serverNowMs }: { shop: PizzaShop; campuses: CampusPublic[]; serverNowMs: number }) {
  // Undetermined until the effect reads localStorage — avoids flashing the "wrong campus"
  // state before we actually know which campus the device is set to.
  const [campusCode, setCampusCode] = useState<string | null>(null);
  useEffect(() => {
    const stored = readStoredCampus();
    setCampusCode(stored && campuses.some((entry) => entry.code === stored) ? stored : campuses[0]?.code ?? null);
  }, [campuses]);

  function chooseCampus(code: string) {
    setCampusCode(code);
    writeStoredCampus(code);
  }

  const campus = campuses.find((entry) => entry.code === campusCode) ?? null;
  const allowedHere = campusCode === null ? null : !shop.restrictedToCampusCode || shop.restrictedToCampusCode === campusCode;
  const restrictedCampusName = campuses.find((entry) => entry.code === shop.restrictedToCampusCode)?.name ?? shop.restrictedToCampusCode;

  const [activeCourse, setActiveCourse] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ trackingCode: string; totalPaise: number; whatsappUrl: string } | null>(null);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", deliveryType: "GATE" as "GATE" | "HOSTEL", hostelBlock: "", orderSlot: "AFTERNOON" as "AFTERNOON" | "NIGHT" | "" });
  const [clockOffsetMs] = useState(() => serverNowMs - Date.now());
  const [indiaMinutes, setIndiaMinutes] = useState<number | null>(null);

  useEffect(() => {
    const stored = readStoredIdentity();
    if (stored) setCustomer((current) => ({ ...current, name: stored.name, email: stored.email, phone: stored.phone }));
  }, []);

  useEffect(() => {
    const update = () => setIndiaMinutes(getIndiaMinutes(new Date(Date.now() + clockOffsetMs)));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [clockOffsetMs]);

  const hostelIsNightOnly = Boolean(campus?.hostelDeliveryEnabled && campus.hostelDeliveryNightOnly);
  const nightSlotClosed = indiaMinutes !== null && indiaMinutes >= ORDER_SLOT_DETAILS.NIGHT.cutoffMinutes;

  useEffect(() => {
    if (!hostelIsNightOnly) return;
    setCustomer((current) =>
      current.deliveryType === "HOSTEL" && current.orderSlot !== "NIGHT"
        ? { ...current, orderSlot: nightSlotClosed ? "" : "NIGHT" }
        : current
    );
  }, [hostelIsNightOnly, nightSlotClosed]);

  useEffect(() => {
    if (!campus || campus.hostelDeliveryEnabled) return;
    setCustomer((current) => (current.deliveryType === "HOSTEL" ? { ...current, deliveryType: "GATE", hostelBlock: "" } : current));
  }, [campus]);

  const availableCourses = shop.courses.filter((course) => shop.menuItems.some((item) => item.courseId === course.id));

  const dishes = useMemo<PizzaDish[]>(() => {
    const byKey = new Map<string, PizzaMenuItem[]>();
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
  const visibleDishes = activeCourse === "all" ? dishes : dishes.filter((dish) => dish.courseId === activeCourse);

  // Selected size per dish, keyed by dish.key. Falls back to the cheapest/first size
  // (dishes are pre-sorted by sizeOrder then price) until the shopper picks one.
  const [selectedSizeByDish, setSelectedSizeByDish] = useState<Record<string, string>>({});
  function selectedSizeOf(dish: PizzaDish): PizzaMenuItem {
    const pickedId = selectedSizeByDish[dish.key];
    return dish.sizes.find((size) => size.id === pickedId) ?? dish.sizes[0];
  }

  function lineQuantity(kind: "item" | "combo", id: string) {
    return cart.find((line) => line.kind === kind && line.id === id)?.quantity ?? 0;
  }

  function addLine(kind: "item" | "combo", id: string, name: string, imageUrl: string | null, unitPricePaise: number) {
    setCart((current) => {
      const key = `${kind}:${id}`;
      const existing = current.find((line) => line.key === key);
      if (existing) return current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { key, kind, id, name, imageUrl, unitPricePaise, quantity: 1 }];
    });
  }

  function adjustLine(kind: "item" | "combo", id: string, delta: number) {
    const key = `${kind}:${id}`;
    setCart((current) => current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + delta } : line)).filter((line) => line.quantity > 0));
  }

  const totals = useMemo(() => {
    const subtotalPaise = cart.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);
    const platformFeePaise = campus?.platformFeePaise ?? 0;
    const hostelFeePaise = customer.deliveryType === "HOSTEL" ? campus?.hostelDeliveryFeePaise ?? 0 : 0;
    return { subtotalPaise, platformFeePaise, hostelFeePaise, totalPaise: subtotalPaise + platformFeePaise + hostelFeePaise };
  }, [cart, campus, customer.deliveryType]);

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const orderingBlocked = !shop.acceptingOrders;
  const heroImage = shop.imageUrl ?? shop.combos[0]?.imageUrl ?? shop.menuItems[0]?.imageUrl ?? "/dish-placeholder.webp";

  function validate() {
    if (orderingBlocked) return toast.error("This shop isn't taking orders right now.");
    if (!cart.length) return toast.error("Add something to your order first.");
    if (!campus) return toast.error("Please choose your campus.");
    if (customer.name.trim().length < 2) return toast.error("Please enter your name.");
    if (!/^[6-9]\d{9}$/.test(customer.phone.replace(/\D/g, "").slice(-10))) return toast.error("Enter a valid 10-digit Indian mobile number.");
    if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) return toast.error("Enter a valid email address, or leave it blank.");
    if (customer.deliveryType === "HOSTEL" && !campus.hostelDeliveryEnabled) return toast.error("Hostel delivery is coming soon here. Please choose gate pickup.");
    if (customer.deliveryType === "HOSTEL" && hostelIsNightOnly && customer.orderSlot !== "NIGHT") return toast.error("Hostel delivery runs on night orders only.");
    if (customer.deliveryType === "HOSTEL" && !customer.hostelBlock) return toast.error("Select your hostel block.");
    if (!customer.orderSlot) return toast.error("Ordering has closed for today's slots.");
    return true;
  }

  async function submitOrder() {
    if (!validate() || !campus) return;
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
            deliveryType: customer.deliveryType,
            hostelBlock: customer.deliveryType === "HOSTEL" ? customer.hostelBlock : undefined,
            campusCode: campus.code,
            orderSlot: customer.orderSlot
          },
          items: cart.map((line) => (line.kind === "combo" ? { comboId: line.id, quantity: line.quantity } : { menuItemId: line.id, quantity: line.quantity }))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not place the order");
      writeStoredIdentity({ name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim() });
      setCart([]);
      setResult(data);
      window.open(data.whatsappUrl, "_blank");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not place the order");
    } finally {
      setBusy(false);
    }
  }

  // Waiting on the campus lookup — render nothing flashy, just hold the layout.
  if (campusCode === null) {
    return (
      <main className="min-h-screen bg-white">
        <SiteNav />
      </main>
    );
  }

  if (!allowedHere) {
    return (
      <main id="main-content" className="min-h-screen bg-white text-[#0B1F33]">
        <SiteNav />
        <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-32 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-xl bg-[#E31837]/10 text-[#E31837]"><PizzaIcon size={30} /></span>
          <h1 className="mt-8 text-4xl font-black tracking-[-0.04em] sm:text-5xl">We&apos;re not delivering here yet.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-[#5A6B7B]">
            {shop.name} currently only delivers to <span className="font-bold text-[#E31837]">{restrictedCampusName}</span>, and your campus is set to{" "}
            <span className="font-bold text-[#0B1F33]">{campus?.name ?? "an unsupported campus"}</span>. Switch your campus below if that&apos;s not right.
          </p>
          <div className="mt-8">
            <CampusSwitcher campuses={campuses} value={campusCode} onChange={chooseCampus} />
          </div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  // A closed shop is a dead end on purpose: showing a browsable menu that cannot be
  // ordered from just wastes the customer's time and invites "why won't it let me pay".
  if (orderingBlocked) {
    return (
      <main id="main-content" className="min-h-screen bg-white text-[#0B1F33]">
        <SiteNav />
        <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-32 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-xl bg-[#5A6B7B]/10 text-[#5A6B7B]">
            <PizzaIcon size={30} />
          </span>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#5A6B7B]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#5A6B7B]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5A6B7B]" /> Closed
          </span>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{shop.name} is closed.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-[#5A6B7B]">
            We&apos;re not taking pizza orders right now. Check back a little later, or browse the other
            campus kitchens in the meantime.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/menu"
              className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[#E31837] px-6 text-sm font-black text-white transition hover:bg-[#c81330]"
            >
              Browse other kitchens <ArrowRight size={16} />
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center rounded-md border border-[#0B1F33]/15 px-6 text-sm font-black text-[#0B1F33] transition hover:border-[#0B1F33]/35"
            >
              Back home
            </Link>
          </div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#F6F7F9] text-[#0B1F33]">
      {/* Sticky utility bar: shop identity, open/closed state, campus, reachable cart summary.
          Kept as its own normal-flow bar (not nesting SiteNav) because SiteNav is always
          `position: absolute` — it overlays the hero below rather than sitting in flow. */}
      <div className="sticky top-0 z-40 border-b border-[#0B1F33]/8 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-5 py-2.5 sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-sm font-black tracking-[-0.02em] sm:text-base">{shop.name}</span>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                orderingBlocked ? "bg-[#5A6B7B]/10 text-[#5A6B7B]" : "bg-[#1F9254]/10 text-[#1F9254]"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${orderingBlocked ? "bg-[#5A6B7B]" : "bg-[#1F9254]"}`} />
              {orderingBlocked ? "Closed" : "Open"}
            </span>
            <span className="hidden items-center gap-1 truncate text-xs font-bold text-[#5A6B7B] sm:flex">
              <MapPin size={12} className="shrink-0 text-[#006491]" /> {campus?.name}
            </span>
          </div>
          {itemCount > 0 ? (
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-[#E31837] px-3.5 text-xs font-black text-white transition hover:bg-[#c81330] sm:h-10 sm:px-4 sm:text-sm"
            >
              <ShoppingBag size={15} /> {itemCount} <span className="hidden sm:inline">&middot; {formatPaise(totals.subtotalPaise)}</span>
            </button>
          ) : null}
        </div>
      </div>

      <section className="relative min-h-[42rem] overflow-hidden bg-[#0B1F33] sm:min-h-[46rem]">
        <img
          src={heroImage}
          alt={`${shop.name} pizzas and sides`}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,21,34,0.98)_0%,rgba(7,21,34,0.9)_42%,rgba(7,21,34,0.26)_76%,rgba(7,21,34,0.42)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,21,34,0.96)_0%,transparent_48%,rgba(7,21,34,0.35)_100%)]" />
        <SiteNav dark />
        <div className="relative mx-auto flex min-h-[42rem] max-w-[1280px] items-end px-5 pb-10 pt-28 sm:min-h-[46rem] sm:px-8 sm:pb-14 lg:px-12 lg:pb-16">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-3xl"
          >
            <div className="flex flex-wrap items-center gap-3">
              <CampusSwitcher campuses={campuses} value={campusCode} onChange={chooseCampus} />
            </div>
            <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[0.9] tracking-[-0.055em] text-white sm:text-7xl lg:text-[6.2rem]">
              {shop.name}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg sm:leading-8">
              {shop.description ?? "Hot pizzas, generous toppings, and campus delivery. Build your order here, then confirm it on WhatsApp."}
            </p>
            {orderingBlocked ? (
              <div className="mt-8 inline-flex items-center gap-2 rounded-md border border-white/20 bg-[#071522]/45 px-4 py-3 text-sm font-bold text-white backdrop-blur-md">
                Closed right now. This shop is not taking orders at the moment.
              </div>
            ) : (
              <a href="#menu" className="mt-8 inline-flex min-h-14 items-center gap-3 rounded-md bg-[#E31837] px-7 py-3.5 text-sm font-black text-white shadow-[0_18px_55px_rgba(227,24,55,0.32)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f02443] active:translate-y-0">
                Explore the menu <ArrowRight size={17} />
              </a>
            )}

            <div className="mt-9 grid max-w-2xl gap-px overflow-hidden rounded-md border border-white/12 bg-white/12 sm:grid-cols-3">
              <div className="flex items-center gap-3 bg-[#071522]/55 px-4 py-3.5 backdrop-blur-md">
                <MessageCircle size={17} className="text-[#5ee58b]" />
                <span className="text-sm font-bold text-white">Confirm on WhatsApp</span>
              </div>
              <div className="flex items-center gap-3 bg-[#071522]/55 px-4 py-3.5 backdrop-blur-md">
                <HandCoins size={17} className="text-[#ffcf55]" />
                <span className="text-sm font-bold text-white">Pay at handover</span>
              </div>
              <div className="flex items-center gap-3 bg-[#071522]/55 px-4 py-3.5 backdrop-blur-md">
                <Clock3 size={17} className="text-[#76caee]" />
                <span className="text-sm font-bold text-white">Campus delivery slots</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-5 py-12 sm:px-8 lg:px-12 lg:py-20">
        {/* Deals — the hero of the page, per the owner's brief: bold offer cards with the
            saving called out up front, always in a fixed grid (never a sliding strip). */}
        {shop.combos.length ? (
          <div className="mb-16 rounded-2xl border border-[#E31837]/15 bg-gradient-to-br from-[#0B1F33] via-[#0B1F33] to-[#3d0d16] p-5 shadow-[0_25px_70px_rgba(11,31,51,0.22)] sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="flex items-center gap-2 text-sm font-black text-[#ffcf55]"><Sparkles size={16} /> Today&apos;s offers</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl">Deals worth building your order around</h2>
              </div>
              <p className="hidden max-w-xs text-right text-sm leading-6 text-white/60 sm:block">Complete meals, savings already worked out — no coupon needed.</p>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shop.combos.map((combo) => {
                const undiscountedTotal = comboUndiscountedTotal(combo);
                const savingsPaise = Math.max(0, undiscountedTotal - combo.comboPricePaise);
                const savingsPercent = undiscountedTotal > 0 ? Math.round((savingsPaise / undiscountedTotal) * 100) : 0;
                const qty = lineQuantity("combo", combo.id);
                return (
                  <motion.article
                    key={combo.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-[0_12px_36px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
                  >
                    <div className="relative">
                      <img loading="lazy" decoding="async" alt={combo.name} src={combo.imageUrl ?? "/dish-placeholder.webp"} className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                      {savingsPercent > 0 ? (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#E31837] px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-sm">
                          <Flame size={13} /> Save {savingsPercent}%
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="text-lg font-black tracking-[-0.02em] text-[#0B1F33]">{combo.name}</h3>
                      {combo.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5A6B7B]">{combo.description}</p> : null}
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-xl font-black tabular-nums text-[#E31837]">{formatPaise(combo.comboPricePaise)}</span>
                        {savingsPaise > 0 ? <span className="text-xs font-medium text-[#5A6B7B] line-through">{formatPaise(undiscountedTotal)}</span> : null}
                      </div>
                      {savingsPaise > 0 ? <p className="mt-0.5 text-xs font-bold text-[#1F9254]">You save {formatPaise(savingsPaise)} on this combo</p> : null}
                      <div className="mt-auto pt-4">
                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => addLine("combo", combo.id, combo.name, combo.imageUrl, combo.comboPricePaise)}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0B1F33] text-sm font-black text-white transition hover:bg-[#006491]"
                          >
                            <Plus size={15} /> Add combo
                          </button>
                        ) : (
                          <div className="flex h-11 items-center justify-between rounded-lg border border-[#0B1F33]/15 bg-[#F6F7F9] px-1">
                            <button type="button" aria-label={`Decrease ${combo.name}`} onClick={() => adjustLine("combo", combo.id, -1)} className="grid h-9 w-9 place-items-center rounded-md text-[#0B1F33] transition hover:bg-white"><Minus size={14} /></button>
                            <span className="text-sm font-black tabular-nums text-[#0B1F33]">{qty}</span>
                            <button type="button" aria-label={`Increase ${combo.name}`} onClick={() => adjustLine("combo", combo.id, 1)} className="grid h-9 w-9 place-items-center rounded-md text-[#0B1F33] transition hover:bg-white"><Plus size={14} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Menu */}
        <section id="menu" className="scroll-mt-28">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-black text-[#006491]"><PizzaIcon size={16} /> Made for your order</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] text-[#0B1F33] sm:text-5xl">Choose your favourites</h2>
            <p className="mt-3 text-sm leading-6 text-[#5A6B7B] sm:text-base">Freshly prepared pizzas and sides, ready for your selected campus slot.</p>
          </div>

          {availableCourses.length > 1 ? (
            <div className="sticky top-[52px] z-30 -mx-5 mt-5 border-b border-[#0B1F33]/8 bg-[#F6F7F9]/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setActiveCourse("all")}
                  className={`shrink-0 rounded-md border px-4 py-2 text-sm font-bold transition ${activeCourse === "all" ? "border-[#0B1F33] bg-[#0B1F33] text-white" : "border-[#0B1F33]/12 bg-white text-[#5A6B7B] hover:border-[#006491] hover:text-[#0B1F33]"}`}
                >
                  All
                </button>
                {availableCourses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setActiveCourse(course.id)}
                    className={`shrink-0 rounded-md border px-4 py-2 text-sm font-bold transition ${activeCourse === course.id ? "border-[#0B1F33] bg-[#0B1F33] text-white" : "border-[#0B1F33]/12 bg-white text-[#5A6B7B] hover:border-[#006491] hover:text-[#0B1F33]"}`}
                  >
                    {course.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!shop.menuItems.length ? (
            <div className="mt-8 grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#0B1F33]/15 bg-white px-6 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#0B1F33]/5 text-[#006491]"><PizzaIcon size={23} /></span>
                <h3 className="mt-5 text-xl font-black text-[#0B1F33]">The menu is still being set up</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5A6B7B]">Check back soon. This kitchen is getting its pizzas ready.</p>
              </div>
            </div>
          ) : (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleDishes.map((dish) => {
                const hasSizes = dish.sizes.length > 1;
                const selected = selectedSizeOf(dish);
                const unitPrice = discountedPrice(selected.pricePaise, selected.discountPercent);
                const cheapest = dish.sizes[0];
                const cheapestPrice = discountedPrice(cheapest.pricePaise, cheapest.discountPercent);
                const cartName = selected.sizeLabel ? `${dish.name} — ${selected.sizeLabel}` : dish.name;
                const qty = lineQuantity("item", selected.id);
                const isHotDeal = selected.discountPercent >= 20;
                return (
                  <motion.article
                    key={dish.key}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#0B1F33]/8 bg-white shadow-[0_8px_28px_rgba(11,31,51,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(11,31,51,0.12)]"
                  >
                    <div className="relative overflow-hidden bg-[#edf1f4]">
                      <img loading="lazy" decoding="async" alt={dish.name} src={dish.imageUrl ?? "/dish-placeholder.webp"} className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                      {isHotDeal ? (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-[#E31837] px-2.5 py-1 text-[11px] font-black text-white shadow-sm">
                          <Flame size={12} /> {selected.discountPercent}% off
                        </span>
                      ) : selected.discountPercent ? (
                        <span className="absolute left-3 top-3 rounded-md bg-[#E31837] px-2.5 py-1 text-[11px] font-black text-white shadow-sm">{selected.discountPercent}% off</span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
                      <div className="flex items-start gap-2">
                        <VegMark isVeg={selected.isVeg} />
                        <h3 className="text-lg font-black tracking-[-0.025em] text-[#0B1F33]">{dish.name}</h3>
                      </div>
                      {dish.description ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#5A6B7B]">{dish.description}</p> : <p className="mt-1.5 text-sm leading-6 text-[#83909c]">Freshly prepared for your order.</p>}

                      {hasSizes ? (
                        <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label={`Choose a size for ${dish.name}`}>
                          {dish.sizes.map((size) => {
                            const picked = size.id === selected.id;
                            return (
                              <button
                                key={size.id}
                                type="button"
                                onClick={() => setSelectedSizeByDish((current) => ({ ...current, [dish.key]: size.id }))}
                                className={`min-h-[2.25rem] rounded-md border px-3 text-xs font-black transition ${picked ? "border-[#0B1F33] bg-[#0B1F33] text-white" : "border-[#0B1F33]/15 bg-white text-[#5A6B7B] hover:border-[#006491] hover:text-[#0B1F33]"}`}
                              >
                                {size.sizeLabel ?? "Regular"}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                        <div>
                          {hasSizes ? <p className="text-[11px] font-bold uppercase tracking-wide text-[#5A6B7B]/70">From {formatPaise(cheapestPrice)}</p> : null}
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-black tabular-nums text-[#0B1F33]">{formatPaise(unitPrice)}</span>
                            {selected.discountPercent ? <span className="text-xs text-[#5A6B7B]/70 line-through">{formatPaise(selected.pricePaise)}</span> : null}
                          </div>
                        </div>
                        {qty === 0 ? (
                          <button
                            type="button"
                            aria-label={`Add ${cartName}`}
                            onClick={() => addLine("item", selected.id, cartName, selected.imageUrl, unitPrice)}
                            className="flex h-10 items-center gap-2 rounded-md bg-[#E31837] px-3.5 text-sm font-black text-white transition hover:bg-[#c81330] active:scale-[0.98]"
                          >
                            <Plus size={15} /> Add
                          </button>
                        ) : (
                          <div className="flex h-10 items-center rounded-md border border-[#0B1F33]/15 bg-[#F6F7F9]">
                            <button type="button" aria-label={`Decrease ${cartName}`} onClick={() => adjustLine("item", selected.id, -1)} className="grid h-10 w-10 place-items-center rounded-md text-[#0B1F33] transition hover:bg-white"><Minus size={13} /></button>
                            <span className="w-7 text-center text-sm font-black tabular-nums text-[#0B1F33]">{qty}</span>
                            <button type="button" aria-label={`Increase ${cartName}`} onClick={() => adjustLine("item", selected.id, 1)} className="grid h-10 w-10 place-items-center rounded-md text-[#0B1F33] transition hover:bg-white"><Plus size={13} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <SiteFooter />

      {/* Floating mobile cart bar */}
      <AnimatePresence>
        {itemCount > 0 && !checkoutOpen ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            onClick={() => setCheckoutOpen(true)}
            className="fixed inset-x-5 bottom-5 z-40 mx-auto flex h-16 max-w-md items-center justify-between rounded-2xl bg-[#E31837] px-6 text-white shadow-[0_20px_60px_rgba(227,24,55,0.35)] transition hover:bg-[#c81330] sm:hidden"
          >
            <span className="flex items-center gap-3 font-black">
              <ShoppingBag size={19} /> {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="flex items-center gap-2 font-black tabular-nums">
              {formatPaise(totals.subtotalPaise)} <ArrowRight size={16} />
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {checkoutOpen ? (
          <motion.div
            className="fixed inset-0 z-[100] grid place-items-end bg-[#0B1F33]/50 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pizza-checkout-title"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#0B1F33]/10 bg-white p-5 text-[#0B1F33] shadow-[0_30px_100px_rgba(11,31,51,0.25)] sm:rounded-3xl sm:p-7"
            >
              {result ? (
                <div className="py-4 text-center">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-[#1F9254]/10 text-[#1F9254]"><Check size={30} strokeWidth={2.5} /></span>
                  <h2 className="mt-6 text-3xl font-black tracking-[-0.04em]">Order sent!</h2>
                  <p className="mt-3 leading-7 text-[#5A6B7B]">
                    Your tracking code is <span className="font-black text-[#E31837]">{result.trackingCode}</span>. Confirm your order on WhatsApp, then pay by cash or UPI when it&apos;s handed over.
                  </p>
                  <p className="mt-1 text-sm text-[#5A6B7B]/80">Total: {formatPaise(result.totalPaise)}</p>
                  <div className="mt-7 grid gap-2">
                    <a
                      href={result.whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-sm font-black text-white transition hover:brightness-105"
                    >
                      <MessageCircle size={17} /> Open WhatsApp again
                    </a>
                    <button
                      type="button"
                      onClick={() => { setResult(null); setCheckoutOpen(false); }}
                      className="h-12 rounded-xl border border-[#0B1F33]/15 text-sm font-black transition hover:bg-[#F6F7F9]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <h2 id="pizza-checkout-title" className="text-3xl font-black tracking-[-0.04em]">Your order</h2>
                      <p className="mt-1 text-sm text-[#5A6B7B]">Confirm on WhatsApp, then pay by cash or UPI at handover.</p>
                    </div>
                    <button type="button" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#5A6B7B] transition hover:bg-[#F6F7F9] hover:text-[#0B1F33]"><X size={19} /></button>
                  </div>

                  <div className="mt-5 space-y-3 border-b border-[#0B1F33]/10 pb-5">
                    {cart.map((line) => (
                      <div key={line.key} className="flex items-center gap-3">
                        <img loading="lazy" decoding="async" alt={line.name} src={line.imageUrl ?? "/dish-placeholder.webp"} className="h-12 w-12 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{line.name}</p>
                          <p className="text-xs text-[#5A6B7B]">{formatPaise(line.unitPricePaise)} each</p>
                        </div>
                        <div className="flex h-8 items-center rounded-full border border-[#0B1F33]/15 bg-[#F6F7F9]">
                          <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => adjustLine(line.kind, line.id, -1)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white"><Minus size={12} /></button>
                          <span className="w-5 text-center text-xs font-black tabular-nums">{line.quantity}</span>
                          <button type="button" aria-label={`Increase ${line.name}`} onClick={() => adjustLine(line.kind, line.id, 1)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white"><Plus size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {campuses.length > 1 ? (
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-[#5A6B7B]">Campus</span>
                      <CampusSwitcher campuses={campuses} value={campusCode} onChange={chooseCampus} />
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-bold">Full name<input className={`${fieldClass} mt-2`} autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} placeholder="Your name" /></label>
                    <label className="text-sm font-bold">Phone number<input className={`${fieldClass} mt-2`} inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} placeholder="10-digit number" /></label>
                    <label className="text-sm font-bold sm:col-span-2">Email (optional)<input className={`${fieldClass} mt-2`} type="email" autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} placeholder="you@example.com" /></label>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {[{ value: "GATE", title: "Campus gate", copy: "Meet us at the campus gate" }, { value: "HOSTEL", title: "Your hostel", copy: hostelIsNightOnly ? "Night orders only" : "We bring it to your block" }].map((option) => {
                      const locked = option.value === "HOSTEL" && !campus?.hostelDeliveryEnabled;
                      const selected = customer.deliveryType === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={locked}
                          aria-disabled={locked}
                          onClick={() => { if (locked) return; setCustomer({ ...customer, deliveryType: option.value as "GATE" | "HOSTEL", hostelBlock: option.value === "HOSTEL" ? customer.hostelBlock : "" }); }}
                          className={`relative rounded-xl border p-4 text-left transition ${locked ? "cursor-not-allowed border-[#0B1F33]/8 bg-[#F6F7F9] text-[#5A6B7B]/50" : selected ? "border-[#E31837] bg-[#E31837] text-white" : "border-[#0B1F33]/15 bg-white hover:border-[#006491]"}`}
                        >
                          <MapPin size={18} className={locked ? "text-[#5A6B7B]/40" : selected ? "text-white" : "text-[#006491]"} />
                          <span className="mt-3 block text-sm font-black">{option.title}</span>
                          <span className={`mt-0.5 block text-xs ${locked ? "text-[#5A6B7B]/50" : selected ? "text-white/80" : "text-[#5A6B7B]"}`}>{locked ? "Coming soon" : option.copy}</span>
                          {locked ? <span className="absolute right-2.5 top-2.5 rounded-full bg-[#0B1F33]/8 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#5A6B7B]">Soon</span> : null}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence>
                    {customer.deliveryType === "HOSTEL" ? (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
                        <div className="pizza-hostel-picker"><HostelPicker value={customer.hostelBlock} onChange={(hostelBlock) => setCustomer({ ...customer, hostelBlock })} /></div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <div className="mt-6">
                    <p className="text-sm font-bold">Order slot</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {([
                        { value: "AFTERNOON", label: "Afternoon", ...ORDER_SLOT_DETAILS.AFTERNOON },
                        { value: "NIGHT", label: "Night", ...ORDER_SLOT_DETAILS.NIGHT }
                      ] as const).map((slot) => {
                        const blockedByHostel = customer.deliveryType === "HOSTEL" && hostelIsNightOnly && slot.value !== "NIGHT";
                        const unavailable = blockedByHostel || indiaMinutes === null || indiaMinutes >= slot.cutoffMinutes;
                        return (
                          <button
                            key={slot.value}
                            type="button"
                            disabled={unavailable}
                            onClick={() => setCustomer({ ...customer, orderSlot: slot.value })}
                            className={`relative min-h-20 rounded-xl border px-3 py-3 text-left transition ${unavailable ? "cursor-not-allowed border-[#0B1F33]/8 bg-[#F6F7F9] text-[#5A6B7B]/50" : customer.orderSlot === slot.value ? "border-[#E31837] bg-[#E31837] text-white" : "border-[#0B1F33]/15 bg-white text-[#0B1F33] hover:border-[#006491]"}`}
                          >
                            <span className="block text-sm font-black">{slot.label}</span>
                            <span className={`mt-1 block text-[11px] font-medium leading-4 ${unavailable ? "text-[#5A6B7B]/50" : customer.orderSlot === slot.value ? "text-white/80" : "text-[#5A6B7B]"}`}>{slot.cutoffLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-7 space-y-2 rounded-xl border border-[#0B1F33]/10 bg-[#F6F7F9] p-4 text-sm">
                    <div className="flex justify-between text-[#5A6B7B]"><span>Items subtotal</span><span className="tabular-nums text-[#0B1F33]">{formatPaise(totals.subtotalPaise)}</span></div>
                    <div className="flex justify-between text-[#5A6B7B]"><span>Platform fee</span><span className="tabular-nums text-[#0B1F33]">{formatPaise(totals.platformFeePaise)}</span></div>
                    {customer.deliveryType === "HOSTEL" ? <div className="flex justify-between text-[#5A6B7B]"><span>Hostel delivery</span><span className="tabular-nums text-[#0B1F33]">{formatPaise(totals.hostelFeePaise)}</span></div> : null}
                    <div className="flex justify-between border-t border-[#0B1F33]/10 pt-2 text-base font-black text-[#0B1F33]"><span>Total</span><span className="tabular-nums">{formatPaise(totals.totalPaise)}</span></div>
                    <p className="pt-1 text-xs leading-5 text-[#5A6B7B]/80">No online payment here. Pay by cash or UPI when your order is handed over.</p>
                  </div>

                  <button
                    type="button"
                    disabled={busy || orderingBlocked}
                    onClick={submitOrder}
                    className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#25D366] text-sm font-black text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MessageCircle size={18} /> {busy ? "Sending..." : orderingBlocked ? "Closed right now" : "Confirm on WhatsApp"}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
