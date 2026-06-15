import Link from "next/link";
import { ArrowRight, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { SiteNav } from "@/components/customer/SiteNav";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const commitments = [
  {
    icon: Sparkles,
    title: "Restaurant-first quality",
    copy: "Menus stay focused, items can be marked out of stock, and every order keeps a clean item record."
  },
  {
    icon: ShieldCheck,
    title: "Private order tracking",
    copy: "Customers receive a secure tracking link and passcode after ordering, without needing an account."
  },
  {
    icon: Clock3,
    title: "Campus-aware handoffs",
    copy: "Gate pickup and hostel delivery are handled as separate flows, so orders are easier to coordinate."
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
            <p className="font-semibold text-amber-200">Campus meals, handled with care</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl">
              Food ordering that feels calm from cart to doorstep.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76">
              Dish2Door brings campus restaurants, clear order updates, and careful gate or hostel handoffs into one simple flow.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/menu">
                <Button variant="secondary" size="lg">
                  Explore menu <ArrowRight size={18} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <p className="font-semibold text-amber-700">Our commitments</p>
          <h2 className="mt-2 text-4xl font-black tracking-tight text-neutral-950">Built for campus rush hours.</h2>
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
              <h3 className="text-2xl font-black">Ready to order?</h3>
              <p className="mt-2 text-white/65">Browse restaurants and build your cart on the dedicated menu page.</p>
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
