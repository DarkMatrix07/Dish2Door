"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Check, CheckCircle2, Gift, LockKeyhole, Mail, MapPin, ReceiptText, ShieldCheck, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteNav } from "@/components/customer/SiteNav";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { readApiJson } from "@/lib/api-client";
import { formatPaise } from "@/lib/utils";

type Order = {
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  orderSlot: "AFTERNOON" | "NIGHT" | null;
  status: "ORDER_CONFIRMED" | "REACHED_CAMPUS" | "DELIVERED" | "CANCELLED";
  totalPaise: number;
  restaurant: { name: string };
  items: { id: string; nameSnapshot: string; quantity: number; linePaise: number }[];
  rating: null | { id: string };
};

const steps = [
  { key: "ORDER_CONFIRMED", number: "01", label: "Order confirmed", helper: "The kitchen has received your order" },
  { key: "REACHED_CAMPUS", number: "02", label: "Reached campus", helper: "Your order is ready for handoff" },
  { key: "DELIVERED", number: "03", label: "Delivered", helper: "Your order has been completed" }
];

function statusIndex(status: Order["status"]) {
  if (status === "DELIVERED") return 2;
  if (status === "REACHED_CAMPUS") return 1;
  return 0;
}

function StarRating({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-[#625b50]">{label}</p>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""} for ${label.toLowerCase()}`} onClick={() => onChange(n)} className="rounded-md p-1 transition hover:-translate-y-0.5 active:scale-95">
            <Star size={29} className={n <= value ? "fill-[#f6b73c] text-[#f6b73c]" : "fill-transparent text-black/15"} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function TrackingClient({ trackingCode }: { trackingCode: string }) {
  const [passcode, setPasscode] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState({ foodRating: 5, deliveryRating: 5, review: "" });

  useEffect(() => {
    const savedPasscode = window.sessionStorage.getItem(`dish2door_passcode_${trackingCode}`);
    if (savedPasscode) {
      setPasscode(savedPasscode);
      window.sessionStorage.removeItem(`dish2door_passcode_${trackingCode}`);
      void verify(savedPasscode);
    }
  }, [trackingCode]);

  async function verify(passcodeOverride?: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/tracking/${trackingCode}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: passcodeOverride ?? passcode }) });
      const data = await readApiJson<{ error?: string; order: Order }>(response, "Could not verify this order");
      if (!response.ok) throw new Error(data.error ?? "Could not verify this order");
      setOrder(data.order);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify this order");
    } finally {
      setBusy(false);
    }
  }

  async function submitRating() {
    try {
      const response = await fetch(`/api/tracking/${trackingCode}/rating`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode, ...rating }) });
      const data = await readApiJson<{ error?: string; rating: { id: string } }>(response, "Could not submit rating");
      if (!response.ok) throw new Error(data.error ?? "Could not submit rating");
      toast.success("Thanks for rating your order.");
      setOrder((current) => current ? { ...current, rating: data.rating } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit rating");
    }
  }

  const isCancelled = order?.status === "CANCELLED";
  const currentIndex = order ? statusIndex(order.status) : 0;
  // Review-chasing emails link straight here, so when a delivered order is still
  // unrated the rating card goes at the top rather than below the timeline and items.
  const needsRating = order?.status === "DELIVERED" && !order.rating;

  return (
    <main id="main-content" className="min-h-screen bg-[#f7f3eb] text-[#171713]">
      <section className="relative border-b border-black/10">
        <SiteNav />
        <div className="mx-auto max-w-[1440px] px-5 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-32">
          <Link href="/menu" className="inline-flex items-center gap-2 text-sm font-bold text-[#6c6458] transition hover:text-[#c65d24]"><ArrowLeft size={16} /> Back to menu</Link>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {!order ? (
          <motion.section key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto grid max-w-[1200px] gap-12 px-5 py-14 sm:px-8 lg:min-h-[620px] lg:grid-cols-[1fr_28rem] lg:items-center lg:gap-20 lg:px-12 lg:py-20">
            <div>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#746c5f]"><span className="h-px w-9 bg-[#d97706]" /> Private order access</div>
              <h1 className="mt-6 max-w-2xl text-5xl font-black leading-[0.92] tracking-[-0.055em] sm:text-7xl lg:text-8xl">Your order.<br /><span className="text-[#c65d24]">Only for you.</span></h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-[#6c6458]">Use the four-digit passcode sent with your tracking link. No account or login is needed.</p>
              <div className="mt-9 flex flex-wrap gap-5 text-sm font-bold text-[#625b50]"><span className="flex items-center gap-2"><ShieldCheck size={17} className="text-[#c65d24]" /> Private details</span><span className="flex items-center gap-2"><MapPin size={17} className="text-[#c65d24]" /> Live status</span></div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-[0_28px_90px_rgba(58,43,22,0.1)] sm:p-8">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#171713] text-[#f6b73c]"><LockKeyhole size={21} /></span>
              <h2 className="mt-7 text-2xl font-black tracking-[-0.035em]">Unlock tracking</h2>
              <p className="mt-2 text-sm leading-6 text-[#716a5f]">Order reference <span className="font-mono font-bold text-[#171713]">{trackingCode}</span></p>
              <div className="mt-5 flex gap-3 rounded-xl border border-[#c65d24]/15 bg-[#c65d24]/[0.06] p-4">
                <Mail size={18} className="mt-0.5 shrink-0 text-[#c65d24]" />
                <p className="text-xs leading-5 text-[#625b50]">Your tracking link and passcode were sent by email. If you cannot find the message in your inbox, please check your Spam or Junk folder.</p>
              </div>
              <label className="mt-7 block text-sm font-bold">Four-digit passcode
                <input className="mt-2 h-16 w-full rounded-md border border-black/12 bg-[#f7f3eb] px-4 text-center font-mono text-2xl font-black tracking-[0.45em] outline-none transition placeholder:text-[#bbb4a9] focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="one-time-code" placeholder="0000" value={passcode} onChange={(event) => setPasscode(event.target.value.replace(/\D/g, ""))} onKeyDown={(event) => { if (event.key === "Enter" && passcode.length === 4) void verify(); }} />
              </label>
              <button type="button" disabled={busy || passcode.length !== 4} onClick={() => verify()} className="tracking-dark-link mt-4 flex min-h-14 w-full items-center justify-between rounded-md bg-[#171713] px-5 font-black transition hover:bg-[#c65d24] disabled:cursor-not-allowed disabled:opacity-40"><span>{busy ? "Checking passcode..." : "View my order"}</span><LockKeyhole size={17} /></button>
              <p className="mt-4 text-xs leading-5 text-[#8b8479]">Keep this passcode private. Anyone with the link and passcode can view the order.</p>
            </div>
          </motion.section>
        ) : (
          <motion.section key="order" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[1200px] px-5 py-12 pb-24 sm:px-8 lg:px-12 lg:py-16">
            <div className="flex flex-col gap-6 border-b border-black/12 pb-9 sm:flex-row sm:items-end sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[#f6b73c] px-3 py-2 font-mono text-xs font-black">{order.trackingCode}</span>{isCancelled ? <span className="rounded-md bg-[#8a342c] px-3 py-2 text-xs font-black text-white">Cancelled</span> : null}</div><h1 className="mt-5 text-4xl font-black leading-none tracking-[-0.05em] sm:text-6xl">{order.restaurant.name}</h1><p className="mt-4 text-[#6c6458]">For {order.customerName} · {order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Campus gate"}{order.orderSlot ? ` · ${order.orderSlot === "NIGHT" ? "Night" : "Afternoon"}` : ""}</p></div>
              <div className="sm:text-right"><p className="text-sm font-bold text-[#817a70]">Total paid</p><p className="mt-1 text-3xl font-black tracking-[-0.04em] tabular-nums">{formatPaise(order.totalPaise)}</p></div>
            </div>

            {needsRating ? (
              <section className="mt-10 overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(58,43,22,0.08)]">
                <div className="flex items-center gap-3 border-b border-black/8 bg-[#fff8e8] px-6 py-4 sm:px-8">
                  <Gift size={18} className="shrink-0 text-[#c65d24]" />
                  <p className="text-sm font-black leading-5">
                    Rate this order — every 3 reviews unlocks a spin on the discount wheel.
                  </p>
                </div>
                <div className="p-6 sm:p-8">
                  <h2 className="text-3xl font-black tracking-[-0.04em]">How was your order?</h2>
                  <p className="mt-3 max-w-lg leading-6 text-[#716a5f]">
                    Takes about ten seconds, and it tells the kitchen and the delivery team what to fix.
                  </p>

                  <div className="mt-8 grid gap-8 sm:mt-10 sm:grid-cols-2">
                    <StarRating
                      label="Food rating"
                      value={rating.foodRating}
                      onChange={(value) => setRating({ ...rating, foodRating: value })}
                    />
                    <StarRating
                      label="Delivery rating"
                      value={rating.deliveryRating}
                      onChange={(value) => setRating({ ...rating, deliveryRating: value })}
                    />
                  </div>

                  <label className="mt-9 block text-sm font-bold">
                    Optional review
                    <textarea
                      className="mt-3 min-h-28 w-full resize-y rounded-md border border-black/12 bg-[#f7f3eb] p-4 font-normal leading-6 outline-none transition focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10"
                      placeholder="Tell us what worked well"
                      value={rating.review}
                      onChange={(event) => setRating({ ...rating, review: event.target.value })}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={submitRating}
                    className="tracking-dark-link mt-7 flex min-h-12 w-full items-center justify-center rounded-md bg-[#171713] px-6 py-3.5 font-black transition hover:bg-[#c65d24] sm:w-auto"
                  >
                    Submit rating
                  </button>
                </div>
              </section>
            ) : null}

            {isCancelled ? (
              <div className="mt-10 rounded-xl border border-[#8a342c]/20 bg-[#8a342c]/8 p-6"><h2 className="text-xl font-black text-[#6f2923]">This order was cancelled</h2><p className="mt-2 max-w-2xl leading-7 text-[#7c4a45]">If you paid online, the team will process the applicable refund. Contact support if you need help with this order.</p></div>
            ) : (
              <section className="mt-12">
                <div className="flex items-end justify-between"><h2 className="text-3xl font-black tracking-[-0.04em]">Order status</h2><span className="font-mono text-xs text-[#817a70]">STEP {currentIndex + 1} OF 3</span></div>
                <div className="mt-7 grid gap-3 md:grid-cols-3">
                  {steps.map((step, index) => {
                    const done = index <= currentIndex;
                    const current = index === currentIndex;
                    return (
                      <article key={step.key} className={`relative min-h-44 rounded-xl border p-5 transition ${current ? "border-[#171713] bg-[#171713] text-white" : done ? "border-[#f6b73c] bg-[#f6b73c]/18" : "border-black/10 bg-white/35"}`}>
                        <div className="flex items-start justify-between"><span className={`font-mono text-xs ${current ? "text-white/50" : "text-[#8c857a]"}`}>{step.number}</span><span className={`grid h-8 w-8 place-items-center rounded-full ${done ? "bg-[#f6b73c] text-[#171713]" : "bg-black/5 text-black/25"}`}>{done ? <Check size={15} strokeWidth={3} /> : null}</span></div>
                        <h3 className="mt-8 text-lg font-black">{step.label}</h3><p className={`mt-2 text-sm leading-6 ${current ? "text-white/55" : "text-[#716a5f]"}`}>{step.helper}</p>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
              <section><div className="flex items-center gap-3"><ReceiptText size={20} className="text-[#c65d24]" /><h2 className="text-2xl font-black tracking-[-0.035em]">Your items</h2></div><div className="mt-5 border-y border-black/12">{order.items.map((item) => <div key={item.id} className="grid grid-cols-[2.5rem_1fr_auto] gap-3 border-b border-black/8 py-4 text-sm last:border-0"><span className="font-mono text-[#817a70]">{item.quantity}x</span><span className="font-bold">{item.nameSnapshot}</span><span className="font-black tabular-nums">{formatPaise(item.linePaise)}</span></div>)}</div></section>
              <aside className="h-fit rounded-xl bg-white p-5"><h2 className="font-black">Delivery details</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-[#817a70]">Delivering to</dt><dd className="mt-1 font-bold">{order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Campus gate"}</dd></div><div><dt className="text-[#817a70]">Contact</dt><dd className="mt-1 font-bold">{order.customerPhone}</dd></div>{order.orderSlot ? <div><dt className="text-[#817a70]">Order slot</dt><dd className="mt-1 font-bold">{order.orderSlot === "NIGHT" ? "Night" : "Afternoon"}</dd></div> : null}</dl></aside>
            </div>

            {order.rating ? <div className="mt-10 flex items-center gap-3 rounded-xl border border-[#34705a]/20 bg-[#34705a]/8 p-5 font-bold text-[#285d4a]"><CheckCircle2 size={19} /> Thanks for rating this order.</div> : null}
          </motion.section>
        )}
      </AnimatePresence>
      <SiteFooter />
    </main>
  );
}
