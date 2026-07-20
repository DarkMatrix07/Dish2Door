"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, MailCheck, MapPin, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteNav } from "@/components/customer/SiteNav";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { HostelPicker } from "@/components/customer/HostelPicker";
import { SpinWheel } from "@/components/customer/SpinWheel";
import { clearStoredCart, readStoredCart, writeStoredCart, type StoredCartItem } from "@/lib/cart";
import { readStoredIdentity, writeStoredIdentity, type CustomerIdentity } from "@/lib/customer-identity";
import { formatIndiaMinutes, getIndiaMinutes, ORDER_SLOT_DETAILS } from "@/lib/order-slots";
import { formatPaise } from "@/lib/utils";

type Settings = {
  platformFeePaise: number;
  hostelDeliveryFeePaise: number;
  paymentChargePercentBps: number;
  paymentChargeFixedPaise: number;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function paymentFee(basePaise: number, settings: Settings) {
  return Math.ceil((basePaise * settings.paymentChargePercentBps) / 10_000) + settings.paymentChargeFixedPaise;
}

function discountedUnitPrice(item: StoredCartItem) {
  return Math.round(item.pricePaise * (1 - (item.discountPercent ?? 0) / 100));
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const fieldClass = "h-12 w-full rounded-md border border-black/12 bg-white/75 px-4 text-sm font-medium text-[#171713] outline-none transition placeholder:text-[#a29b90] focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10";

export function CartPageClient({
  settings,
  serverNowMs,
  windowOpenMinute,
  windowCloseMinute
}: {
  settings: Settings;
  serverNowMs: number;
  windowOpenMinute: number;
  windowCloseMinute: number;
}) {
  const [cart, setCart] = useState<StoredCartItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountPercent: number } | null>(null);
  const [indiaMinutes, setIndiaMinutes] = useState<number | null>(null);
  // Anchor slot cutoffs to the server clock, not the (possibly wrong) device clock.
  // The device clock's rate is fine; only its absolute offset can be off, so we
  // correct by the server-vs-device delta captured once on mount.
  const [clockOffsetMs] = useState(() => serverNowMs - Date.now());
  const [confirmEmailOpen, setConfirmEmailOpen] = useState(false);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", deliveryType: "GATE", hostelBlock: "", orderSlot: "AFTERNOON" });

  // We take the customer's name/phone/email before showing the cart so we can look
  // up their order history and (if they qualify) offer the loyalty discount wheel.
  const [identity, setIdentity] = useState<CustomerIdentity | null>(null);
  const [identityGateOpen, setIdentityGateOpen] = useState(false);
  const [identityDraft, setIdentityDraft] = useState({ name: "", phone: "", email: "" });
  const [wheelOpen, setWheelOpen] = useState(false);

  useEffect(() => setCart(readStoredCart()), []);

  async function checkSpinEligibility(who: CustomerIdentity) {
    try {
      const response = await fetch("/api/customer/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(who)
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.eligible) {
        setWheelOpen(true);
      } else if (data.reward?.couponCode) {
        // Returning winner who hasn't redeemed yet — re-apply their coupon quietly.
        setCoupon({ code: data.reward.couponCode, discountPercent: data.reward.discountPercent });
        setCouponCode(data.reward.couponCode);
      }
    } catch {
      // Eligibility is a bonus; never block checkout if the lookup fails.
    }
  }

  // On first load, restore a known identity (and re-check eligibility) or open the gate.
  useEffect(() => {
    const stored = readStoredIdentity();
    if (stored) {
      setIdentity(stored);
      setCustomer((current) => ({ ...current, name: stored.name, email: stored.email, phone: stored.phone }));
      void checkSpinEligibility(stored);
    } else {
      setIdentityGateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitIdentity() {
    const name = identityDraft.name.trim();
    const email = identityDraft.email.trim();
    const phone = identityDraft.phone.trim();
    if (name.length < 2) return toast.error("Please enter your name.");
    if (phone.replace(/\D/g, "").length < 10) return toast.error("Enter a valid 10-digit phone number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email address.");

    const who: CustomerIdentity = { name, email, phone };
    writeStoredIdentity(who);
    setIdentity(who);
    setCustomer((current) => ({ ...current, name, email, phone }));
    setIdentityGateOpen(false);
    void checkSpinEligibility(who);
  }

  function applyWheelReward(reward: { discountPercent: number; couponCode: string }) {
    setCoupon({ code: reward.couponCode, discountPercent: reward.discountPercent });
    setCouponCode(reward.couponCode);
    setWheelOpen(false);
    toast.success(`${reward.discountPercent}% off applied to your order!`);
  }

  useEffect(() => {
    const updateIndiaTime = () => setIndiaMinutes(getIndiaMinutes(new Date(Date.now() + clockOffsetMs)));
    updateIndiaTime();
    const timer = window.setInterval(updateIndiaTime, 30_000);
    return () => window.clearInterval(timer);
  }, [clockOffsetMs]);

  useEffect(() => {
    if (indiaMinutes === null) return;
    const afternoonOpen = indiaMinutes < ORDER_SLOT_DETAILS.AFTERNOON.cutoffMinutes;
    const nightOpen = indiaMinutes < ORDER_SLOT_DETAILS.NIGHT.cutoffMinutes;

    setCustomer((current) => {
      if (current.orderSlot === "AFTERNOON" && !afternoonOpen) {
        return { ...current, orderSlot: nightOpen ? "NIGHT" : "" };
      }
      if (current.orderSlot === "NIGHT" && !nightOpen) {
        return { ...current, orderSlot: "" };
      }
      return current;
    });
  }, [indiaMinutes]);

  useEffect(() => {
    if (!confirmEmailOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmEmailOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [confirmEmailOpen]);

  function persist(nextCart: StoredCartItem[]) {
    setCart(nextCart);
    writeStoredCart(nextCart);
  }

  function updateQty(id: string, delta: number) {
    persist(cart.map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  }

  function emptyCart() {
    clearStoredCart();
    setCart([]);
  }

  const totals = useMemo(() => {
    const subtotalPaise = cart.reduce((total, item) => total + discountedUnitPrice(item) * item.quantity, 0);
    const couponDiscountPaise = coupon ? Math.round((subtotalPaise * coupon.discountPercent) / 100) : 0;
    const hostelFeePaise = customer.deliveryType === "HOSTEL" ? settings.hostelDeliveryFeePaise : 0;
    const basePaise = Math.max(0, subtotalPaise - couponDiscountPaise) + settings.platformFeePaise + hostelFeePaise;
    const paymentFeePaise = paymentFee(basePaise, settings);
    return { subtotalPaise, couponDiscountPaise, hostelFeePaise, paymentFeePaise, totalPaise: basePaise + paymentFeePaise };
  }, [cart, coupon, customer.deliveryType, settings]);

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    try {
      const response = await fetch("/api/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: couponCode.trim(), phone: customer.phone || identity?.phone }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Coupon not valid");
      setCoupon(data);
      toast.success(`${data.code} applied`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Coupon not valid");
    }
  }

  const orderingClosed = indiaMinutes !== null && (indiaMinutes < windowOpenMinute || indiaMinutes >= windowCloseMinute);

  function validateCheckoutDetails() {
    if (orderingClosed) return toast.error(`Ordering is open between ${formatIndiaMinutes(windowOpenMinute)} and ${formatIndiaMinutes(windowCloseMinute)}.`);
    if (!cart.length) return toast.error("Your cart is empty.");
    if (!customer.name || !customer.email || !customer.phone) return toast.error("Name, email, and phone are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) return toast.error("Enter a valid email address.");
    if (customer.deliveryType === "HOSTEL" && !customer.hostelBlock) return toast.error("Hostel block is required for hostel delivery.");
    if (!customer.orderSlot) return toast.error("Ordering has closed for today's delivery slots.");
    return true;
  }

  function reviewEmailBeforePayment() {
    if (validateCheckoutDetails()) setConfirmEmailOpen(true);
  }

  async function checkout() {
    if (!validateCheckoutDetails()) return;
    setConfirmEmailOpen(false);

    setBusy(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) throw new Error("Razorpay checkout could not load");
      const response = await fetch("/api/orders/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: { ...customer, couponCode: coupon?.code }, items: cart.map((item) => ({ menuItemId: item.id, quantity: item.quantity })) })
      });
      const payment = await response.json();
      if (!response.ok) throw new Error(payment.error ?? "Could not start payment");

      new window.Razorpay({
        key: payment.razorpayKeyId,
        amount: payment.amountPaise,
        currency: "INR",
        name: "Dish2Door",
        description: cart[0]?.restaurantName,
        order_id: payment.razorpayOrderId,
        prefill: { name: customer.name, email: customer.email, contact: customer.phone },
        handler: async (result: Record<string, string>) => {
          const verifyResponse = await fetch("/api/orders/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: payment.orderId, razorpayOrderId: result.razorpay_order_id, razorpayPaymentId: result.razorpay_payment_id, razorpaySignature: result.razorpay_signature })
          });
          const verified = await verifyResponse.json();
          if (!verifyResponse.ok) return toast.error(verified.error ?? "Payment verification failed");
          clearStoredCart();
          if (verified.passcode) {
            window.sessionStorage.setItem(`dish2door_passcode_${verified.trackingCode}`, verified.passcode);
            toast.success(`Order confirmed. Passcode: ${verified.passcode}`);
          } else {
            toast.success("Order confirmed. Your passcode has been sent by email and WhatsApp.");
          }
          window.location.href = `/orders/${verified.trackingCode}`;
        }
      }).open();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f7f3eb] text-[#171713]">
      <section className="relative border-b border-black/10">
        <SiteNav />
        <div className="mx-auto max-w-[1440px] px-5 pb-10 pt-32 sm:px-8 lg:px-12 lg:pb-14 lg:pt-40">
          <Link href="/menu" className="inline-flex items-center gap-2 text-sm font-bold text-[#6c6458] transition hover:text-[#c65d24]"><ArrowLeft size={16} /> Continue browsing</Link>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><h1 className="text-5xl font-black leading-none tracking-[-0.055em] sm:text-7xl lg:text-8xl">Your order.</h1><p className="mt-4 max-w-xl text-lg leading-8 text-[#6c6458]">Review every detail before payment. We will send your private tracking link after confirmation.</p></div>
            {cart.length ? <p className="font-mono text-xs text-[#817a70]">{cart.reduce((sum, item) => sum + item.quantity, 0).toString().padStart(2, "0")} ITEMS</p> : null}
          </div>
        </div>
      </section>

      {!cart.length ? (
        <section className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid min-h-96 place-items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 text-center">
            <div><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e9e5dd]"><ShoppingBag size={22} /></span><h2 className="mt-6 text-3xl font-black tracking-[-0.04em]">Nothing in your cart yet</h2><p className="mx-auto mt-3 max-w-sm leading-7 text-[#716a5f]">Choose a restaurant and add a few favourites. Your order will wait here.</p><Link href="/menu" className="cart-dark-link mt-7 inline-flex h-12 items-center gap-4 rounded-md bg-[#171713] px-6 font-bold transition hover:-translate-y-0.5 hover:bg-[#c65d24]">Browse the menu <ArrowRight size={17} /></Link></div>
          </motion.div>
        </section>
      ) : (
        <section className="mx-auto grid max-w-[1440px] gap-12 px-5 py-10 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-16 lg:px-12 lg:py-16">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between border-b border-black/12 pb-4"><h2 className="text-2xl font-black tracking-[-0.035em]">From {cart[0]?.restaurantName}</h2><button type="button" onClick={emptyCart} className="inline-flex items-center gap-2 text-sm font-bold text-[#8a342c] transition hover:text-[#b23f32]"><Trash2 size={15} /> Clear cart</button></div>
            <div>
              {cart.map((item) => (
                <motion.article layout key={item.id} className="grid grid-cols-[6.5rem_1fr] gap-4 border-b border-black/10 py-6 sm:grid-cols-[7.5rem_1fr_auto] sm:items-center sm:gap-6">
                  <img alt={item.name} className="h-28 w-full rounded-xl object-cover" src={item.imageUrl ?? "/dish2door-home-hero.png"} />
                  <div className="min-w-0"><h3 className="text-lg font-black tracking-[-0.025em] sm:text-xl">{item.name}</h3>{item.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#716a5f]">{item.description}</p> : null}<div className="mt-3 flex items-center gap-2"><span className="font-black tabular-nums">{formatPaise(discountedUnitPrice(item))}</span>{item.discountPercent ? <span className="text-sm text-[#9a9388] line-through">{formatPaise(item.pricePaise)}</span> : null}</div></div>
                  <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:flex-col sm:items-end sm:gap-3">
                    <div className="flex h-10 items-center rounded-md border border-black/12 bg-white/70"><button type="button" aria-label={`Decrease ${item.name}`} onClick={() => updateQty(item.id, -1)} className="grid h-10 w-10 place-items-center transition hover:bg-[#f6b73c]"><Minus size={14} /></button><span className="w-8 text-center text-sm font-black tabular-nums">{item.quantity}</span><button type="button" aria-label={`Increase ${item.name}`} onClick={() => updateQty(item.id, 1)} className="grid h-10 w-10 place-items-center transition hover:bg-[#f6b73c]"><Plus size={14} /></button></div>
                    <p className="text-lg font-black tabular-nums">{formatPaise(discountedUnitPrice(item) * item.quantity)}</p>
                  </div>
                </motion.article>
              ))}
            </div>

            <div className="mt-12">
              <h2 className="text-3xl font-black tracking-[-0.04em]">Where should we send it?</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[{ value: "GATE", title: "Campus gate", copy: "Meet us at the campus gate" }, { value: "HOSTEL", title: "Your hostel", copy: "We bring it to your block" }].map((option) => (
                  <button key={option.value} type="button" onClick={() => setCustomer({ ...customer, deliveryType: option.value })} className={`relative rounded-xl border p-5 text-left transition ${customer.deliveryType === option.value ? "border-[#171713] bg-[#171713] text-white" : "border-black/12 bg-white/40 hover:border-black/30"}`}>
                    <MapPin size={20} className={customer.deliveryType === option.value ? "text-[#f6b73c]" : "text-[#c65d24]"} /><span className="mt-5 block font-black">{option.title}</span><span className={`mt-1 block text-sm ${customer.deliveryType === option.value ? "text-white/55" : "text-[#716a5f]"}`}>{option.copy}</span>{customer.deliveryType === option.value ? <Check className="absolute right-4 top-4 text-[#f6b73c]" size={17} /> : null}
                  </button>
                ))}
              </div>

              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-bold">Full name<input className={`${fieldClass} mt-2`} autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} placeholder="Your name" /></label>
                <label className="text-sm font-bold">Phone number<input className={`${fieldClass} mt-2`} inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} placeholder="10-digit number" /></label>
                <label className="text-sm font-bold sm:col-span-2">Email address<input className={`${fieldClass} mt-2`} type="email" autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} placeholder="you@example.com" /></label>
                <AnimatePresence>{customer.deliveryType === "HOSTEL" ? <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="sm:col-span-2"><HostelPicker value={customer.hostelBlock} onChange={(hostelBlock) => setCustomer({ ...customer, hostelBlock })} /></motion.div> : null}</AnimatePresence>
              </div>

              <div className="mt-8">
                <p className="text-sm font-bold">Order slot</p>
                {orderingClosed ? (
                  <div className="mt-2 rounded-md border border-[#8a342c]/20 bg-[#8a342c]/[0.06] px-4 py-3 text-sm font-semibold text-[#8a342c]">
                    Ordering is closed right now. We accept orders between {formatIndiaMinutes(windowOpenMinute)} and {formatIndiaMinutes(windowCloseMinute)} (IST).
                  </div>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([
                    { value: "AFTERNOON", label: "Afternoon", ...ORDER_SLOT_DETAILS.AFTERNOON },
                    { value: "NIGHT", label: "Night", ...ORDER_SLOT_DETAILS.NIGHT },
                  ] as const).map((slot) => {
                    const unavailable = orderingClosed || indiaMinutes === null || indiaMinutes >= slot.cutoffMinutes;
                    return (
                    <button
                      key={slot.value}
                      type="button"
                      disabled={unavailable}
                      onClick={() => setCustomer({ ...customer, orderSlot: slot.value })}
                      className={`relative min-h-24 rounded-md border px-3 py-3 text-left transition ${unavailable ? "cursor-not-allowed border-black/8 bg-black/[0.035] text-[#9a9388]" : customer.orderSlot === slot.value ? "border-[#f6b73c] bg-[#f6b73c] text-[#171713]" : "border-black/12 bg-white/50 text-[#625b50] hover:border-black/30"}`}
                    >
                      <span className="block text-sm font-black">{slot.label}</span>
                      <span className={`mt-1 block text-[11px] font-medium leading-4 sm:text-xs ${unavailable ? "text-[#9a9388]" : customer.orderSlot === slot.value ? "text-[#171713]/65" : "text-[#817a70]"}`}>{slot.cutoffLabel}</span>
                      <span className={`block text-[11px] font-bold leading-4 sm:text-xs ${unavailable ? "text-[#9a9388]" : customer.orderSlot === slot.value ? "text-[#171713]" : "text-[#c65d24]"}`}>{slot.deliveryLabel}</span>
                      {unavailable && indiaMinutes !== null ? <span className="absolute right-2.5 top-2.5 rounded-full bg-[#8a342c]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#8a342c]">Closed</span> : null}
                    </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>

          <aside className="h-fit rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(58,43,22,0.09)] lg:sticky lg:top-6 sm:p-6">
            <div className="flex items-center justify-between"><h2 className="text-2xl font-black tracking-[-0.035em]">Payment summary</h2><ShieldCheck size={21} className="text-[#c65d24]" /></div>
            <div className="mt-6 border-y border-black/10 py-5"><label className="text-sm font-bold">Have a coupon?</label><div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><input className={`${fieldClass} uppercase`} value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Enter code" /><button type="button" onClick={applyCoupon} className="rounded-md border border-black/15 px-4 text-sm font-black transition hover:bg-[#f6b73c]">Apply</button></div>{coupon ? <p className="mt-3 flex items-center gap-2 text-sm font-bold text-[#34705a]"><Check size={14} /> {coupon.code} gives {coupon.discountPercent}% off</p> : null}</div>
            <div className="mt-6 space-y-3 text-sm text-[#625b50]"><div className="flex justify-between"><span>Items subtotal</span><span className="tabular-nums text-[#171713]">{formatPaise(totals.subtotalPaise)}</span></div><div className="flex justify-between"><span>Platform fee</span><span className="tabular-nums text-[#171713]">{formatPaise(settings.platformFeePaise)}</span></div>{totals.couponDiscountPaise ? <div className="flex justify-between font-bold text-[#34705a]"><span>Coupon discount</span><span>-{formatPaise(totals.couponDiscountPaise)}</span></div> : null}<div className="flex justify-between"><span>Hostel delivery</span><span className="tabular-nums text-[#171713]">{formatPaise(totals.hostelFeePaise)}</span></div><div className="flex justify-between"><span>Payment handling</span><span className="tabular-nums text-[#171713]">{formatPaise(totals.paymentFeePaise)}</span></div></div>
            <div className="mt-6 flex items-end justify-between border-t border-black/10 pt-5"><span className="font-bold">Total payable</span><span className="text-3xl font-black tracking-[-0.04em] tabular-nums">{formatPaise(totals.totalPaise)}</span></div>
            <button type="button" disabled={busy || orderingClosed} onClick={reviewEmailBeforePayment} className="cart-dark-link mt-6 flex min-h-14 w-full items-center justify-between rounded-md bg-[#171713] px-5 font-black transition hover:bg-[#c65d24] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"><span>{busy ? "Starting payment..." : orderingClosed ? "Ordering closed" : "Pay securely"}</span><ArrowRight size={18} /></button>
            <p className="mt-4 text-xs leading-5 text-[#817a70]">After payment, your tracking link and private 4-digit passcode are sent by WhatsApp and email.</p>
          </aside>
        </section>
      )}

      <AnimatePresence>
        {confirmEmailOpen ? (
          <motion.div
            className="fixed inset-0 z-[100] grid place-items-end bg-[#171713]/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmEmailOpen(false); }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-email-title"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="w-full max-w-lg rounded-t-2xl bg-[#fffdf8] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:rounded-2xl sm:p-7"
            >
              <div className="flex items-start justify-between gap-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#f6b73c] text-[#171713]"><MailCheck size={22} /></span>
                <button type="button" aria-label="Close email confirmation" onClick={() => setConfirmEmailOpen(false)} className="grid h-10 w-10 place-items-center rounded-full text-[#716a5f] transition hover:bg-black/5 hover:text-[#171713]"><X size={19} /></button>
              </div>
              <h2 id="confirm-email-title" className="mt-6 text-3xl font-black tracking-[-0.04em]">Is your email correct?</h2>
              <p className="mt-3 text-sm leading-6 text-[#716a5f]">After payment, your tracking link and private four-digit passcode will be sent to this address.</p>
              <div className="mt-5 break-all rounded-xl border border-[#c65d24]/20 bg-[#c65d24]/[0.06] px-4 py-4 text-base font-black text-[#171713]">{customer.email.trim()}</div>
              <p className="mt-4 text-xs leading-5 text-[#817a70]">Please check carefully. The confirmation email may occasionally arrive in your Spam or Junk folder.</p>
              <div className="mt-7 grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
                <button type="button" onClick={() => setConfirmEmailOpen(false)} className="min-h-12 rounded-md border border-black/15 px-4 text-sm font-black transition hover:border-black/35 hover:bg-black/[0.03]">Edit email</button>
                <button type="button" onClick={checkout} className="cart-dark-link flex min-h-12 items-center justify-center gap-3 rounded-md bg-[#171713] px-4 text-sm font-black transition hover:bg-[#c65d24]">Email is correct <ArrowRight size={16} /></button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {identityGateOpen ? (
          <motion.div
            className="fixed inset-0 z-[110] grid place-items-end bg-[#171713]/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="identity-gate-title"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="w-full max-w-lg rounded-t-2xl bg-[#fffdf8] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:rounded-2xl sm:p-7"
            >
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f6b73c] text-[#171713]"><ShoppingBag size={22} /></span>
              <h2 id="identity-gate-title" className="mt-5 text-3xl font-black tracking-[-0.04em]">Let&apos;s get your details</h2>
              <p className="mt-2 text-sm leading-6 text-[#716a5f]">We use these to send your tracking link — and regulars sometimes unlock a surprise.</p>
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => { event.preventDefault(); submitIdentity(); }}
              >
                <label className="block text-sm font-bold">Full name<input className={`${fieldClass} mt-2`} autoComplete="name" value={identityDraft.name} onChange={(event) => setIdentityDraft({ ...identityDraft, name: event.target.value })} placeholder="Your name" /></label>
                <label className="block text-sm font-bold">Phone number<input className={`${fieldClass} mt-2`} inputMode="tel" autoComplete="tel" value={identityDraft.phone} onChange={(event) => setIdentityDraft({ ...identityDraft, phone: event.target.value })} placeholder="10-digit number" /></label>
                <label className="block text-sm font-bold">Email address<input className={`${fieldClass} mt-2`} type="email" autoComplete="email" value={identityDraft.email} onChange={(event) => setIdentityDraft({ ...identityDraft, email: event.target.value })} placeholder="you@example.com" /></label>
                <button type="submit" className="cart-dark-link flex min-h-14 w-full items-center justify-center gap-3 rounded-md bg-[#171713] px-4 py-3 font-black transition hover:bg-[#c65d24]">Continue to cart <ArrowRight size={16} /></button>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {wheelOpen && identity ? (
          <SpinWheel identity={identity} onWin={applyWheelReward} onClose={() => setWheelOpen(false)} />
        ) : null}
      </AnimatePresence>

      <SiteFooter />
    </main>
  );
}
