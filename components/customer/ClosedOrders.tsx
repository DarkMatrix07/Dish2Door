"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { clearStoredCart } from "@/lib/cart";

export function ClosedOrders({ message, contactNumber }: { message: string; contactNumber: string }) {
  useEffect(() => {
    clearStoredCart();
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 px-4 text-white">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30 blur-[2px]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1800&q=85')"
        }}
      />
      <div className="absolute inset-0 bg-neutral-950/70" />
      <section className="relative mx-auto max-w-2xl rounded-3xl border border-white/15 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-2xl sm:p-12">
        <p className="font-semibold text-amber-200">Dish2Door</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">Orders are closed for today</h1>
        <p className="mt-5 text-lg leading-8 text-white/76">{message}</p>
        <p className="mt-4 font-bold">Contact: {contactNumber}</p>
        <Button className="mt-8 bg-white text-neutral-950 hover:bg-amber-100">Check again later</Button>
      </section>
    </main>
  );
}
