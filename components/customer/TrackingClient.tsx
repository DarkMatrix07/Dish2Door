"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { CheckCircle2, LockKeyhole, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SiteFooter } from "@/components/customer/SiteFooter";
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
  { key: "ORDER_CONFIRMED", label: "Order confirmed", helper: "We have your order" },
  { key: "REACHED_CAMPUS", label: "Reached campus", helper: "On campus, heading over" },
  { key: "DELIVERED", label: "Delivered", helper: "Enjoy your meal" }
];

function statusIndex(status: Order["status"]) {
  if (status === "DELIVERED") return 2;
  if (status === "REACHED_CAMPUS") return 1;
  return 0;
}

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="mt-2 flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          className="rounded-md p-0.5 transition hover:scale-110"
        >
          <Star
            size={32}
            className={n <= value ? "fill-amber-400 text-amber-400" : "fill-transparent text-neutral-300"}
          />
        </button>
      ))}
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
      const response = await fetch(`/api/tracking/${trackingCode}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcodeOverride ?? passcode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not verify");
      setOrder(data.order);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify");
    } finally {
      setBusy(false);
    }
  }

  async function submitRating() {
    try {
      const response = await fetch(`/api/tracking/${trackingCode}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, ...rating })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not submit rating");
      toast.success("Thanks for rating your order.");
      setOrder((current) => (current ? { ...current, rating: data.rating } : current));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit rating");
    }
  }

  const isCancelled = order?.status === "CANCELLED";

  return (
    <main className="min-h-screen bg-[#fff8ec]">
      <header className="border-b border-neutral-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-black">
            Dish2Door
          </Link>
          <Link href="/menu">
            <Button variant="outline">Back to menu</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {!order ? (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-md py-8">
            <Card className="bg-white p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                <LockKeyhole size={22} />
              </span>
              <h1 className="mt-4 text-3xl font-black text-neutral-950">Track your order</h1>
              <p className="mt-2 text-neutral-600">Enter the 4-digit passcode sent to you on WhatsApp and email.</p>
              <Input
                className="mt-6 text-center text-lg tracking-[0.4em]"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
              />
              <Button className="mt-4 w-full" size="lg" disabled={busy} onClick={() => verify()}>
                {busy ? "Checking..." : "View order"}
              </Button>
            </Card>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full">
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="amber">Order {order.trackingCode}</Badge>
                {isCancelled ? <Badge tone="red">Cancelled</Badge> : null}
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-neutral-950 sm:text-5xl">{order.restaurant.name}</h1>
              <p className="mt-2 text-neutral-600">
                {order.customerName} · {order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Campus gate"}
                {order.orderSlot ? ` · ${order.orderSlot === "NIGHT" ? "Night" : "Afternoon"}` : ""}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <Card className="bg-white p-6">
                <h2 className="text-xl font-black text-neutral-950">Status</h2>
                {isCancelled ? (
                  <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                    This order was cancelled. If you paid online, your refund will be processed by the team.
                  </div>
                ) : (
                  <div className="mt-6 space-y-2">
                    {steps.map((step, index) => {
                      const done = index <= statusIndex(order.status);
                      const current = index === statusIndex(order.status);
                      return (
                        <div key={step.key} className="flex items-center gap-4 rounded-2xl p-2">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                              done ? "bg-amber-400 text-neutral-950" : "bg-neutral-100 text-neutral-300"
                            }`}
                          >
                            <CheckCircle2 size={22} />
                          </div>
                          <div>
                            <p className={done ? "font-bold text-neutral-950" : "font-semibold text-neutral-400"}>{step.label}</p>
                            <p className={`text-xs ${current ? "text-amber-700" : "text-neutral-400"}`}>{step.helper}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card className="h-fit bg-white p-6">
                <h2 className="text-xl font-black text-neutral-950">Order details</h2>
                <div className="mt-4 space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between gap-3 text-sm text-neutral-700">
                      <span>
                        {item.quantity}x {item.nameSnapshot}
                      </span>
                      <span className="font-semibold">{formatPaise(item.linePaise)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-neutral-200 pt-3 text-lg font-black text-neutral-950">
                    <span>Total</span>
                    <span>{formatPaise(order.totalPaise)}</span>
                  </div>
                </div>
              </Card>
            </div>

            {order.status === "DELIVERED" && !order.rating ? (
              <Card className="mt-6 bg-white p-6">
                <h2 className="text-xl font-black text-neutral-950">Rate your order</h2>
                <p className="mt-1 text-sm text-neutral-500">Your feedback helps the kitchen and delivery team.</p>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <div className="text-sm font-semibold text-neutral-600">
                    Food rating
                    <StarRating value={rating.foodRating} onChange={(value) => setRating({ ...rating, foodRating: value })} />
                  </div>
                  <div className="text-sm font-semibold text-neutral-600">
                    Delivery rating
                    <StarRating value={rating.deliveryRating} onChange={(value) => setRating({ ...rating, deliveryRating: value })} />
                  </div>
                </div>
                <Textarea className="mt-4" placeholder="Optional review" value={rating.review} onChange={(event) => setRating({ ...rating, review: event.target.value })} />
                <Button className="mt-4" onClick={submitRating}>
                  Submit rating
                </Button>
              </Card>
            ) : null}

            {order.rating ? (
              <Card className="mt-6 bg-white p-5 text-sm text-emerald-700">
                ✓ Thanks for rating this order.
              </Card>
            ) : null}
          </motion.div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
