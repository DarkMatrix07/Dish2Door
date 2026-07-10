"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, Clock3, MapPin, ShieldCheck, Star } from "lucide-react";
import { SiteNav } from "@/components/customer/SiteNav";
import { SiteFooter } from "@/components/customer/SiteFooter";

const promises = [
  { number: "01", icon: ShieldCheck, title: "Reliable kitchens", copy: "Menus come from restaurants we know around campus, with availability kept clear before you order." },
  { number: "02", icon: Clock3, title: "Clear order updates", copy: "You hear from us when your order is confirmed, reaches campus, and is delivered." },
  { number: "03", icon: MapPin, title: "Made for campus", copy: "Collect at the gate or choose hostel delivery. The checkout adapts to how you want your food." }
];

const reveal = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const }
};

export function HomeLanding() {
  return (
    <main id="main-content" className="min-h-screen overflow-hidden bg-[#f7f3eb] text-[#171713]">
      <section className="relative min-h-[760px] border-b border-black/10 lg:min-h-[820px]">
        <SiteNav />
        <div className="mx-auto grid min-h-[760px] max-w-[1440px] grid-cols-1 px-5 pb-14 pt-28 sm:px-8 lg:min-h-[820px] lg:grid-cols-[1.04fr_0.96fr] lg:gap-12 lg:px-12 lg:pb-12 lg:pt-32">
          <motion.div {...reveal} className="relative z-10 flex max-w-3xl flex-col justify-center pb-12 lg:pb-20">
            <div className="mb-8 flex items-center gap-3 text-sm font-semibold text-[#746c5f]">
              <span className="h-px w-9 bg-[#d97706]" /> Built around campus life
            </div>
            <h1 className="max-w-[780px] text-[clamp(3.25rem,7.2vw,7.1rem)] font-black leading-[0.88] tracking-[-0.055em] text-balance">
              Good food.<br /><span className="font-serif font-normal italic text-[#c65d24]">Right to your door.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-[#625b50] sm:text-xl">
              Dish2Door brings dependable local food to your campus gate or hostel, with careful handling and clear updates from kitchen to handoff.
            </p>
            <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <Link href="/menu" className="home-primary-cta group inline-flex min-h-14 items-center gap-5 rounded-md bg-[#171713] px-7 text-base font-bold transition duration-300 hover:-translate-y-0.5 hover:bg-[#c65d24] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c65d24] active:translate-y-0">
                Explore today&apos;s menu <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" size={19} />
              </Link>
              <div className="flex items-center gap-3 text-sm font-semibold text-[#625b50]">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8d0c3] bg-white/60"><Check size={17} className="text-[#c65d24]" /></span>
                No account needed
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }} className="relative min-h-[410px] lg:min-h-0">
            <div className="absolute inset-0 overflow-hidden rounded-[2rem] bg-[#2b251f] lg:rounded-[2.5rem]">
              <div className="absolute inset-0 scale-[1.02] bg-cover bg-center transition-transform duration-1000 hover:scale-105" style={{ backgroundImage: "url('/dish2door-home-hero.png')" }} role="img" aria-label="A colourful spread of freshly prepared Indian food" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/58 via-transparent to-black/5" />
            </div>
            <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 text-white sm:bottom-7 sm:left-7 sm:right-7">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Today&apos;s promise</p><p className="mt-2 max-w-xs text-xl font-bold leading-snug sm:text-2xl">Fresh choices from restaurants around campus.</p></div>
              <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f6b73c] text-[#171713] sm:flex"><Star size={20} fill="currentColor" /></span>
            </div>
            <div className="absolute -left-4 top-7 rounded-md bg-[#f6b73c] px-4 py-3 text-sm font-black text-[#171713] shadow-[0_16px_40px_rgba(84,51,14,0.18)] sm:-left-7 sm:top-12">Gate or hostel</div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-black/10 bg-[#f0ebe1]">
        <div className="mx-auto grid max-w-[1440px] divide-y divide-black/10 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-12">
          {["Local restaurant menus", "Straightforward ordering", "Support when you need it"].map((item, index) => (
            <div key={item} className="flex items-center gap-4 py-5 md:px-7 md:first:pl-0"><span className="font-mono text-xs text-[#a34c20]">0{index + 1}</span><p className="text-sm font-bold">{item}</p></div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
        <div className="grid gap-16 lg:grid-cols-[0.78fr_1.22fr] lg:gap-24">
          <div>
            <p className="text-sm font-bold text-[#c65d24]">Our commitment</p>
            <h2 className="mt-5 max-w-md text-4xl font-black leading-[1.02] tracking-[-0.04em] text-balance sm:text-5xl">Less waiting around. More confidence in every order.</h2>
            <p className="mt-6 max-w-md leading-7 text-[#6c6458]">We designed Dish2Door around the details that matter on campus: accurate menus, simple handoffs, and communication that keeps you in the loop.</p>
          </div>
          <div className="divide-y divide-black/12 border-y border-black/12">
            {promises.map((item) => (
              <article key={item.title} className="group grid gap-5 py-8 sm:grid-cols-[3rem_1fr_auto] sm:items-start sm:gap-6 lg:py-9">
                <span className="pt-1 font-mono text-xs text-[#9b9182]">{item.number}</span>
                <div><h3 className="text-2xl font-bold tracking-[-0.025em]">{item.title}</h3><p className="mt-3 max-w-xl leading-7 text-[#6c6458]">{item.copy}</p></div>
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-black/12 text-[#c65d24] transition duration-300 group-hover:border-[#c65d24] group-hover:bg-[#c65d24] group-hover:text-white"><item.icon size={19} strokeWidth={1.8} /></span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-8 sm:px-8 lg:px-12 lg:pb-12">
        <div className="relative mx-auto max-w-[1344px] overflow-hidden rounded-[2rem] bg-[#1c1b17] px-6 py-16 text-white sm:px-10 lg:grid lg:grid-cols-[1fr_auto] lg:items-end lg:px-16 lg:py-20">
          <div className="absolute -right-12 -top-28 h-80 w-80 rounded-full border border-white/10" /><div className="absolute -right-28 -top-12 h-80 w-80 rounded-full border border-white/10" />
          <div className="relative"><p className="text-sm font-bold text-[#f6b73c]">Lunch plans, sorted.</p><h2 className="mt-4 max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.04em] text-balance sm:text-6xl">See what&apos;s cooking around campus today.</h2></div>
          <Link href="/menu" className="home-gold-cta group relative mt-9 inline-flex min-h-14 items-center gap-5 rounded-md bg-[#f6b73c] px-7 font-bold transition duration-300 hover:-translate-y-0.5 hover:bg-white lg:ml-12 lg:mt-0">Browse the menu <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" size={19} /></Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
