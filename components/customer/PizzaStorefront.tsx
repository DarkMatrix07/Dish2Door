"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Flame,
  GraduationCap,
  MapPin,
  Minus,
  MessageCircle,
  Plus,
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
  "h-12 w-full rounded-lg border border-white/15 bg-white/[0.06] px-4 text-sm font-medium text-[#fdf3e7] outline-none transition placeholder:text-[#fdf3e7]/35 focus:border-[#f2b134] focus:ring-2 focus:ring-[#f2b134]/20";

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
        className="flex h-11 items-center justify-between gap-3 rounded-lg border border-white/20 bg-white/[0.06] px-4 text-sm font-black text-[#fdf3e7] transition hover:border-white/40"
      >
        <GraduationCap size={16} className="text-[#f2b134]" />
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
            className="absolute left-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#241611] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
          >
            {campuses.map((entry) => {
              const picked = entry.code === value;
              return (
                <li key={entry.code} role="option" aria-selected={picked}>
                  <button
                    type="button"
                    onClick={() => { onChange(entry.code); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition ${picked ? "bg-[#c1272d] text-white" : "text-[#fdf3e7]/85 hover:bg-white/10"}`}
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
  const visibleItems = activeCourse === "all" ? shop.menuItems : shop.menuItems.filter((item) => item.courseId === activeCourse);

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
      <main className="min-h-screen bg-[#160f0d]">
        <SiteNav dark />
      </main>
    );
  }

  if (!allowedHere) {
    return (
      <main id="main-content" className="min-h-screen bg-[#160f0d] text-[#fdf3e7]">
        <SiteNav dark />
        <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-32 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#c1272d]/20 text-4xl">🍕</span>
          <h1 className="mt-8 text-4xl font-black tracking-[-0.04em] sm:text-5xl">We&apos;re not delivering here yet.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-[#fdf3e7]/70">
            {shop.name} currently only delivers to <span className="font-bold text-[#f2b134]">{restrictedCampusName}</span>, and your campus is set to{" "}
            <span className="font-bold">{campus?.name ?? "an unsupported campus"}</span>. Switch your campus below if that&apos;s not right.
          </p>
          <div className="mt-8">
            <CampusSwitcher campuses={campuses} value={campusCode} onChange={chooseCampus} />
          </div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#160f0d] text-[#fdf3e7]">
      <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(ellipse_at_top_left,rgba(193,39,45,0.35),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(242,177,52,0.14),transparent_55%)]">
        <SiteNav dark />
        <div className="mx-auto max-w-[1200px] px-5 pb-16 pt-32 sm:px-8 lg:px-12 lg:pb-24 lg:pt-40">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#c1272d]/20 px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[#f2b134]">
              <Flame size={13} /> WhatsApp ordering &middot; {campus?.name}
            </span>
            <h1 className="mt-6 max-w-3xl text-6xl font-black leading-[0.92] tracking-[-0.045em] sm:text-7xl lg:text-8xl">
              {shop.name}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#fdf3e7]/70">
              {shop.description ?? "Hot, cheesy, straight from the campus kitchen. Build your order below, then confirm on WhatsApp — pay on handover."}
            </p>
            {orderingBlocked ? (
              <div className="mt-8 inline-flex items-center gap-2 rounded-xl border border-[#f2b134]/30 bg-[#f2b134]/10 px-4 py-3 text-sm font-bold text-[#f2b134]">
                Closed right now — this shop isn&apos;t taking orders at the moment.
              </div>
            ) : (
              <a href="#menu" className="mt-8 inline-flex h-[3.25rem] items-center gap-3 rounded-full bg-[#c1272d] px-7 py-3.5 text-sm font-black uppercase tracking-wide text-white transition hover:-translate-y-0.5 hover:bg-[#e0262d]">
                Build your order <ArrowRight size={16} />
              </a>
            )}
          </motion.div>
        </div>
      </section>

      <section id="menu" className="mx-auto max-w-[1200px] px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        {shop.combos.length ? (
          <div className="mb-14">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-[#f2b134]" />
              <h2 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">Combo deals</h2>
            </div>
            <div className="mt-6 flex gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]">
              {shop.combos.map((combo) => {
                const savingsPaise = Math.max(0, comboUndiscountedTotal(combo) - combo.comboPricePaise);
                const qty = lineQuantity("combo", combo.id);
                return (
                  <motion.article
                    key={combo.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
                  >
                    <img loading="lazy" decoding="async" alt={combo.name} src={combo.imageUrl ?? "/dish-placeholder.webp"} className="h-40 w-full object-cover" />
                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="text-lg font-black tracking-[-0.02em]">{combo.name}</h3>
                      {combo.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#fdf3e7]/60">{combo.description}</p> : null}
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-lg font-black tabular-nums">{formatPaise(combo.comboPricePaise)}</span>
                        {savingsPaise > 0 ? <span className="rounded-full bg-[#34705a]/20 px-2 py-0.5 text-[11px] font-black text-[#5cbd97]">Save {formatPaise(savingsPaise)}</span> : null}
                      </div>
                      <div className="mt-auto pt-4">
                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => addLine("combo", combo.id, combo.name, combo.imageUrl, combo.comboPricePaise)}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#f2b134] text-sm font-black text-[#160f0d] transition hover:bg-[#ffc857]"
                          >
                            <Plus size={15} /> Add combo
                          </button>
                        ) : (
                          <div className="flex h-11 items-center justify-between rounded-lg border border-white/15 bg-white/[0.06] px-1">
                            <button type="button" aria-label={`Decrease ${combo.name}`} onClick={() => adjustLine("combo", combo.id, -1)} className="grid h-9 w-9 place-items-center rounded-md transition hover:bg-white/10"><Minus size={14} /></button>
                            <span className="text-sm font-black tabular-nums">{qty}</span>
                            <button type="button" aria-label={`Increase ${combo.name}`} onClick={() => adjustLine("combo", combo.id, 1)} className="grid h-9 w-9 place-items-center rounded-md transition hover:bg-white/10"><Plus size={14} /></button>
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

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">Menu</h2>
        </div>

        {availableCourses.length > 1 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveCourse("all")}
              className={`rounded-full border px-4 py-2 text-sm font-bold transition ${activeCourse === "all" ? "border-[#c1272d] bg-[#c1272d] text-white" : "border-white/15 text-[#fdf3e7]/70 hover:border-white/35"}`}
            >
              All
            </button>
            {availableCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => setActiveCourse(course.id)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition ${activeCourse === course.id ? "border-[#c1272d] bg-[#c1272d] text-white" : "border-white/15 text-[#fdf3e7]/70 hover:border-white/35"}`}
              >
                {course.name}
              </button>
            ))}
          </div>
        ) : null}

        {!shop.menuItems.length ? (
          <div className="mt-10 grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 text-center">
            <div>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/10 text-2xl">🍕</span>
              <h3 className="mt-5 text-xl font-black">The menu is still being set up</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#fdf3e7]/60">Check back soon — this kitchen is getting its pizzas ready.</p>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => {
              const unitPrice = discountedPrice(item.pricePaise, item.discountPercent);
              const qty = lineQuantity("item", item.id);
              return (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <img loading="lazy" decoding="async" alt={item.name} src={item.imageUrl ?? "/dish-placeholder.webp"} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="font-black tracking-[-0.02em]">{item.name}</h3>
                    {item.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#fdf3e7]/55">{item.description}</p> : null}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-black tabular-nums">{formatPaise(unitPrice)}</span>
                        {item.discountPercent ? <span className="text-xs text-[#fdf3e7]/40 line-through">{formatPaise(item.pricePaise)}</span> : null}
                      </div>
                      {qty === 0 ? (
                        <button
                          type="button"
                          aria-label={`Add ${item.name}`}
                          onClick={() => addLine("item", item.id, item.name, item.imageUrl, unitPrice)}
                          className="grid h-9 w-9 place-items-center rounded-full bg-[#f2b134] text-[#160f0d] transition hover:bg-[#ffc857]"
                        >
                          <Plus size={15} />
                        </button>
                      ) : (
                        <div className="flex h-9 items-center rounded-full border border-white/15 bg-white/[0.06]">
                          <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => adjustLine("item", item.id, -1)} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/10"><Minus size={13} /></button>
                          <span className="w-6 text-center text-sm font-black tabular-nums">{qty}</span>
                          <button type="button" aria-label={`Increase ${item.name}`} onClick={() => adjustLine("item", item.id, 1)} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/10"><Plus size={13} /></button>
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

      <SiteFooter />

      <AnimatePresence>
        {itemCount > 0 && !checkoutOpen ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            onClick={() => setCheckoutOpen(true)}
            className="fixed inset-x-5 bottom-5 z-40 mx-auto flex h-16 max-w-md items-center justify-between rounded-2xl bg-[#c1272d] px-6 text-white shadow-[0_20px_60px_rgba(193,39,45,0.4)] transition hover:bg-[#e0262d] sm:inset-x-auto sm:right-8"
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
            className="fixed inset-0 z-[100] grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
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
              className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#1c1310] p-5 text-[#fdf3e7] shadow-[0_30px_100px_rgba(0,0,0,0.5)] sm:rounded-3xl sm:p-7"
            >
              {result ? (
                <div className="py-4 text-center">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#34705a]/20 text-4xl">✅</span>
                  <h2 className="mt-6 text-3xl font-black tracking-[-0.04em]">Order sent!</h2>
                  <p className="mt-3 leading-7 text-[#fdf3e7]/70">
                    Your tracking code is <span className="font-black text-[#f2b134]">{result.trackingCode}</span>. Confirm your order on WhatsApp — pay by cash or UPI when it&apos;s handed over.
                  </p>
                  <p className="mt-1 text-sm text-[#fdf3e7]/50">Total: {formatPaise(result.totalPaise)}</p>
                  <div className="mt-7 grid gap-2">
                    <a
                      href={result.whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-sm font-black text-[#0b1a10] transition hover:brightness-105"
                    >
                      <MessageCircle size={17} /> Open WhatsApp again
                    </a>
                    <button
                      type="button"
                      onClick={() => { setResult(null); setCheckoutOpen(false); }}
                      className="h-12 rounded-xl border border-white/15 text-sm font-black transition hover:bg-white/5"
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
                      <p className="mt-1 text-sm text-[#fdf3e7]/55">Confirmed and paid on WhatsApp — cash or UPI at handover.</p>
                    </div>
                    <button type="button" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#fdf3e7]/60 transition hover:bg-white/10 hover:text-white"><X size={19} /></button>
                  </div>

                  <div className="mt-5 space-y-3 border-b border-white/10 pb-5">
                    {cart.map((line) => (
                      <div key={line.key} className="flex items-center gap-3">
                        <img loading="lazy" decoding="async" alt={line.name} src={line.imageUrl ?? "/dish-placeholder.webp"} className="h-12 w-12 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{line.name}</p>
                          <p className="text-xs text-[#fdf3e7]/50">{formatPaise(line.unitPricePaise)} each</p>
                        </div>
                        <div className="flex h-8 items-center rounded-full border border-white/15 bg-white/[0.06]">
                          <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => adjustLine(line.kind, line.id, -1)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/10"><Minus size={12} /></button>
                          <span className="w-5 text-center text-xs font-black tabular-nums">{line.quantity}</span>
                          <button type="button" aria-label={`Increase ${line.name}`} onClick={() => adjustLine(line.kind, line.id, 1)} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/10"><Plus size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {campuses.length > 1 ? (
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-[#fdf3e7]/70">Campus</span>
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
                          className={`relative rounded-xl border p-4 text-left transition ${locked ? "cursor-not-allowed border-white/8 bg-white/[0.02] text-[#fdf3e7]/35" : selected ? "border-[#f2b134] bg-[#f2b134] text-[#160f0d]" : "border-white/15 bg-white/[0.04] hover:border-white/35"}`}
                        >
                          <MapPin size={18} className={locked ? "text-[#fdf3e7]/25" : selected ? "text-[#160f0d]" : "text-[#f2b134]"} />
                          <span className="mt-3 block text-sm font-black">{option.title}</span>
                          <span className={`mt-0.5 block text-xs ${locked ? "text-[#fdf3e7]/30" : selected ? "text-[#160f0d]/70" : "text-[#fdf3e7]/50"}`}>{locked ? "Coming soon" : option.copy}</span>
                          {locked ? <span className="absolute right-2.5 top-2.5 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#fdf3e7]/70">Soon</span> : null}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence>
                    {customer.deliveryType === "HOSTEL" ? (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
                        <div className="pizza-hostel-picker"><HostelPicker tone="dark" value={customer.hostelBlock} onChange={(hostelBlock) => setCustomer({ ...customer, hostelBlock })} /></div>
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
                            className={`relative min-h-20 rounded-xl border px-3 py-3 text-left transition ${unavailable ? "cursor-not-allowed border-white/8 bg-white/[0.02] text-[#fdf3e7]/30" : customer.orderSlot === slot.value ? "border-[#f2b134] bg-[#f2b134] text-[#160f0d]" : "border-white/15 bg-white/[0.04] text-[#fdf3e7]/75 hover:border-white/35"}`}
                          >
                            <span className="block text-sm font-black">{slot.label}</span>
                            <span className={`mt-1 block text-[11px] font-medium leading-4 ${unavailable ? "text-[#fdf3e7]/25" : customer.orderSlot === slot.value ? "text-[#160f0d]/70" : "text-[#fdf3e7]/50"}`}>{slot.cutoffLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-7 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                    <div className="flex justify-between text-[#fdf3e7]/70"><span>Items subtotal</span><span className="tabular-nums text-[#fdf3e7]">{formatPaise(totals.subtotalPaise)}</span></div>
                    <div className="flex justify-between text-[#fdf3e7]/70"><span>Platform fee</span><span className="tabular-nums text-[#fdf3e7]">{formatPaise(totals.platformFeePaise)}</span></div>
                    {customer.deliveryType === "HOSTEL" ? <div className="flex justify-between text-[#fdf3e7]/70"><span>Hostel delivery</span><span className="tabular-nums text-[#fdf3e7]">{formatPaise(totals.hostelFeePaise)}</span></div> : null}
                    <div className="flex justify-between border-t border-white/10 pt-2 text-base font-black"><span>Total</span><span className="tabular-nums">{formatPaise(totals.totalPaise)}</span></div>
                    <p className="pt-1 text-xs leading-5 text-[#fdf3e7]/45">No online payment here — pay by cash or UPI when your order is handed over.</p>
                  </div>

                  <button
                    type="button"
                    disabled={busy || orderingBlocked}
                    onClick={submitOrder}
                    className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#25D366] text-sm font-black text-[#0b1a10] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
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
