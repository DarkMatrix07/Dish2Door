import Link from "next/link";
import { ArrowRight, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { SiteNav } from "@/components/customer/SiteNav";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const commitments = [
  {
    icon: Sparkles,
    title: "Restaurants near campus",
    copy: "Browse menus from restaurants around campus. Sold-out dishes are marked unavailable, so you never order something that isn't there."
  },
  {
    icon: ShieldCheck,
    title: "Track without an account",
    copy: "After you order, you get a tracking link and a 4-digit passcode on WhatsApp and email. No sign-up, no app to install."
  },
  {
    icon: Clock3,
    title: "Gate or hostel",
    copy: "Choose gate pickup or hostel delivery at checkout. For hostel orders, just add your block and we bring it over."
  }
];

export function HomeLanding() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fff8ec]">
      <section className="relative isolate min-h-screen overflow-hidden bg-neutral-950 text-white">
        <SiteNav dark />
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-40"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1800&q=85')"
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-neutral-950/35 via-neutral-950/75 to-neutral-950" />

        <div className="mx-auto flex min-h-screen max-w-7xl items-center px-4 pb-20 pt-28 sm:px-6 lg:px-8">
          <div className="max-w-5xl">
            <p className="font-semibold text-amber-200">Dish2Door · Campus food ordering</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl">
              Campus food, at your gate or hostel.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76">
              Order from restaurants near campus, pay online or on delivery, and track your order with a passcode — no account needed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/menu">
                <Button variant="secondary" size="lg">
                  See the menu <ArrowRight size={18} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="font-semibold text-amber-700">How it works</p>
          <h2 className="mt-2 text-4xl font-black tracking-tight text-neutral-950">Order in a few taps.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {commitments.map((item) => (
            <Card key={item.title} className="p-6">
              <item.icon className="text-amber-700" />
              <h3 className="mt-5 text-xl font-black">{item.title}</h3>
              <p className="mt-3 leading-7 text-neutral-600">{item.copy}</p>
            </Card>
          ))}
        </div>
        <div className="mt-10 rounded-3xl bg-neutral-950 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-2xl font-black">Hungry?</h3>
              <p className="mt-2 text-white/65">Pick a restaurant, build your cart, and check out in a couple of minutes.</p>
            </div>
            <Link href="/menu">
              <Button variant="secondary" size="lg">
                Open menu
              </Button>
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
