"use client";

import { motion } from "framer-motion";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPaise } from "@/lib/utils";

type Order = {
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  status: "ORDER_CONFIRMED" | "REACHED_CAMPUS" | "DELIVERED" | "CANCELLED";
  totalPaise: number;
  restaurant: { name: string };
  items: { id: string; nameSnapshot: string; quantity: number; linePaise: number }[];
  rating: null | { id: string };
};

const steps = [
  { key: "ORDER_CONFIRMED", label: "Order confirmed" },
  { key: "REACHED_CAMPUS", label: "Reached campus" },
  { key: "DELIVERED", label: "Delivered" }
];

function statusIndex(status: Order["status"]) {
  if (status === "DELIVERED") return 2;
  if (status === "REACHED_CAMPUS") return 1;
  return 0;
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 py-8 text-white">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=1800&q=85')"
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 via-neutral-950/92 to-neutral-900/82" />

      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        {!order ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-md">
            <Card className="border-white/15 bg-white/10 p-6 text-white backdrop-blur-2xl">
              <LockKeyhole className="mb-4 text-amber-200" />
              <h1 className="text-3xl font-black">Track your order</h1>
              <p className="mt-2 text-white/70">Enter the 4-digit passcode sent on WhatsApp and email.</p>
              <Input
                className="mt-6 bg-white text-neutral-950"
                inputMode="numeric"
                maxLength={4}
                placeholder="4-digit passcode"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
              />
              <Button className="mt-4 w-full bg-amber-300 text-neutral-950 hover:bg-amber-200" disabled={busy} onClick={() => verify()}>
                {busy ? "Checking..." : "View order"}
              </Button>
            </Card>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full">
            <div className="mb-8">
              <Badge className="bg-amber-200 text-neutral-950">Order {order.trackingCode}</Badge>
              <h1 className="mt-4 text-4xl font-black sm:text-6xl">{order.restaurant.name}</h1>
              <p className="mt-3 text-white/70">
                {order.customerName} · {order.deliveryType === "HOSTEL" ? `Hostel ${order.hostelBlock}` : "Campus gate"}
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <Card className="border-white/15 bg-white/10 p-6 text-white backdrop-blur-2xl">
                <h2 className="text-xl font-black">Status</h2>
                <div className="mt-6 space-y-5">
                  {steps.map((step, index) => {
                    const done = index <= statusIndex(order.status);
                    return (
                      <div key={step.key} className="flex items-center gap-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${done ? "bg-amber-300 text-neutral-950" : "bg-white/10 text-white/40"}`}>
                          <CheckCircle2 size={20} />
                        </div>
                        <span className={done ? "font-bold" : "text-white/50"}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card className="border-white/15 bg-white/10 p-6 text-white backdrop-blur-2xl">
                <h2 className="text-xl font-black">Order details</h2>
                <div className="mt-4 space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between gap-3 text-sm">
                      <span>{item.quantity}x {item.nameSnapshot}</span>
                      <span>{formatPaise(item.linePaise)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-white/15 pt-3 text-lg font-black">
                    <span>Total</span>
                    <span>{formatPaise(order.totalPaise)}</span>
                  </div>
                </div>
              </Card>
            </div>

            {order.status === "DELIVERED" && !order.rating ? (
              <Card className="mt-6 border-white/15 bg-white/10 p-6 text-white backdrop-blur-2xl">
                <h2 className="text-xl font-black">Rate your order</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Food rating
                    <Input className="mt-2 bg-white text-neutral-950" type="number" min={1} max={5} value={rating.foodRating} onChange={(event) => setRating({ ...rating, foodRating: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Delivery rating
                    <Input className="mt-2 bg-white text-neutral-950" type="number" min={1} max={5} value={rating.deliveryRating} onChange={(event) => setRating({ ...rating, deliveryRating: Number(event.target.value) })} />
                  </label>
                </div>
                <Textarea className="mt-4 bg-white text-neutral-950" placeholder="Optional review" value={rating.review} onChange={(event) => setRating({ ...rating, review: event.target.value })} />
                <Button className="mt-4 bg-amber-300 text-neutral-950 hover:bg-amber-200" onClick={submitRating}>Submit rating</Button>
              </Card>
            ) : null}
          </motion.div>
        )}
      </section>
    </main>
  );
}
