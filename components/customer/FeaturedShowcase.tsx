"use client";

import { motion } from "framer-motion";
import { ArrowRight, Flame, Minus, Plus, Sparkles, Store, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import type { FeaturedCombo, FeaturedData, FeaturedDish } from "@/lib/featured";
import { getIndiaMinutes, ORDER_SLOT_DETAILS } from "@/lib/order-slots";
import { formatPaise } from "@/lib/utils";

const ITEM_FALLBACK = "/dish2door-home-hero.png";

type Props = {
  data: FeaturedData;
  quantityOf: (cartId: string) => number;
  onAddDish: (dish: FeaturedDish) => void;
  onStepDish: (dish: FeaturedDish, delta: number) => void;
  onAddCombo: (combo: FeaturedCombo) => void;
  onStepCombo: (combo: FeaturedCombo, delta: number) => void;
  onOpenRestaurant: (restaurantId: string) => void;
  onBrowseKitchens: () => void;
};

function Stepper({ quantity, onStep, onAdd, label }: { quantity: number; onStep: (delta: number) => void; onAdd: () => void; label: string }) {
  if (quantity > 0) {
    return (
      <div className="flex h-10 items-center rounded-md bg-[#171713] text-white shadow-[0_8px_24px_rgba(23,23,19,0.16)]">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onStep(-1)} className="grid h-10 w-10 place-items-center transition hover:bg-white/10 active:scale-95"><Minus size={15} /></button>
        <span className="w-7 text-center text-sm font-black tabular-nums">{quantity}</span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onStep(1)} className="grid h-10 w-10 place-items-center transition hover:bg-white/10 active:scale-95"><Plus size={15} /></button>
      </div>
    );
  }
  return (
    <button type="button" onClick={onAdd} className="h-10 min-w-20 rounded-md border border-black/15 bg-white px-4 text-sm font-black text-[#171713] transition duration-200 hover:border-[#f6b73c] hover:bg-[#f6b73c] active:scale-[0.98]">
      Add
    </button>
  );
}

function Rail({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-14 first:mt-0">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-2xl font-black tracking-[-0.04em] sm:text-3xl">{icon}{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm leading-6 text-[#716a5f]">{subtitle}</p> : null}
        </div>
      </div>
      <div className="admin-scrollbar -mx-5 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

export function FeaturedShowcase({ data, quantityOf, onAddDish, onStepDish, onAddCombo, onStepCombo, onOpenRestaurant, onBrowseKitchens }: Props) {
  // Slot is resolved after mount so the server-rendered markup can't disagree with the
  // client clock (hydration) — until then the copy stays slot-neutral.
  const [slot, setSlot] = useState<{ key: "AFTERNOON" | "NIGHT"; label: string; cutoff: string } | null>(null);

  useEffect(() => {
    const minutes = getIndiaMinutes();
    if (minutes < ORDER_SLOT_DETAILS.AFTERNOON.cutoffMinutes) {
      setSlot({ key: "AFTERNOON", label: "this afternoon", cutoff: ORDER_SLOT_DETAILS.AFTERNOON.cutoffLabel });
    } else if (minutes < ORDER_SLOT_DETAILS.NIGHT.cutoffMinutes) {
      setSlot({ key: "NIGHT", label: "tonight", cutoff: ORDER_SLOT_DETAILS.NIGHT.cutoffLabel });
    } else {
      setSlot(null);
    }
  }, []);

  const hero = data.topDishes[0];
  const rest = data.topDishes.slice(1, 7);
  const cheapestBiryani = data.biryani[0];

  function DishCard({ dish, rank }: { dish: FeaturedDish; rank?: number }) {
    const quantity = quantityOf(dish.id);
    return (
      <motion.article
        layout
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4 }}
        className="group relative flex w-60 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/70 transition hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(23,23,19,0.10)] sm:w-auto"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[#ded8cd]">
          <img alt={dish.name} src={dish.imageUrl ?? ITEM_FALLBACK} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
          {rank ? <span className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-[#171713] text-xs font-black text-[#f6b73c]">#{rank}</span> : null}
          {dish.discountPercent ? <span className="absolute right-3 top-3 rounded-md bg-[#f6b73c] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#171713]">{dish.discountPercent}% off</span> : null}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <button type="button" onClick={() => onOpenRestaurant(dish.restaurantId)} className="w-fit text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[#c65d24] transition hover:text-[#171713]">
            {dish.restaurantName}
          </button>
          <h3 className="mt-1.5 line-clamp-2 text-base font-black leading-snug tracking-[-0.02em]">{dish.name}</h3>
          {dish.orderCount > 0 ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#7a7368]"><Flame size={12} className="text-[#c65d24]" />{dish.orderCount} ordered</p>
          ) : null}
          <div className="mt-auto flex items-end justify-between gap-2 pt-4">
            <div className="min-w-0">
              <span className="block font-black tabular-nums">{formatPaise(dish.finalPricePaise)}</span>
              {dish.discountPercent ? <span className="text-xs tabular-nums text-[#9a9388] line-through">{formatPaise(dish.pricePaise)}</span> : null}
            </div>
            <Stepper quantity={quantity} label={dish.name} onAdd={() => onAddDish(dish)} onStep={(delta) => onStepDish(dish, delta)} />
          </div>
        </div>
      </motion.article>
    );
  }

  function ComboCard({ combo }: { combo: FeaturedCombo }) {
    const quantity = quantityOf(`combo:${combo.id}`);
    return (
      <motion.article
        layout
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4 }}
        className="group relative flex w-60 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#171713]/12 bg-[#171713] text-white transition hover:-translate-y-1 sm:w-auto"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[#2a2a24]">
          <img alt={combo.name} src={combo.imageUrl ?? ITEM_FALLBACK} className="h-full w-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-[1.05]" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-[#f6b73c] px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#171713]"><Sparkles size={11} /> Combo</span>
          {combo.savingsPercent > 0 ? <span className="absolute right-3 top-3 rounded-md bg-white px-2 py-1 text-[10px] font-black text-[#171713]">Save {combo.savingsPercent}%</span> : null}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#f6b73c]">{combo.restaurantName}</span>
          <h3 className="mt-1.5 line-clamp-2 text-base font-black leading-snug tracking-[-0.02em]">{combo.name}</h3>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/55">{combo.items.map((line) => `${line.quantity}× ${line.name}`).join(", ")}</p>
          <div className="mt-auto flex items-end justify-between gap-2 pt-4">
            <div className="min-w-0">
              <span className="block font-black tabular-nums">{formatPaise(combo.comboPricePaise)}</span>
              {combo.savingsPaise > 0 ? <span className="text-xs tabular-nums text-white/45 line-through">{formatPaise(combo.realTotalPaise)}</span> : null}
            </div>
            <Stepper quantity={quantity} label={combo.name} onAdd={() => onAddCombo(combo)} onStep={(delta) => onStepCombo(combo, delta)} />
          </div>
        </div>
      </motion.article>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-28 sm:px-8 lg:px-12">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-[#746c5f]">
          <span className="h-px w-9 bg-[#d97706]" />
          {data.totalOrders > 0 ? <span>Loved across {data.totalOrders.toLocaleString("en-IN")} campus orders</span> : <span>Fresh from campus kitchens</span>}
        </div>
        <h1 className="mt-5 max-w-4xl text-[clamp(2.75rem,6.6vw,6rem)] font-black leading-[0.92] tracking-[-0.055em] text-balance">
          What campus is<br /><span className="text-[#c65d24]">eating {slot?.label ?? "today"}.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[#6c6458]">
          {slot ? `Ordering is open — ${slot.cutoff.toLowerCase()}. ` : ""}These are the dishes your hostel actually orders, ranked by real numbers.
        </p>
      </motion.div>

      {/* #1 spotlight */}
      {hero ? (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55 }}
          className="mt-10 overflow-hidden rounded-3xl bg-[#171713] text-white shadow-[0_30px_80px_rgba(23,23,19,0.22)]"
        >
          <div className="grid gap-0 lg:grid-cols-[1.05fr_1fr]">
            <div className="order-2 flex flex-col justify-center p-7 sm:p-10 lg:order-1">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f6b73c] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#171713]">
                <TrendingUp size={13} /> #1 most ordered
              </span>
              <h2 className="mt-5 text-4xl font-black leading-[0.95] tracking-[-0.045em] sm:text-5xl">{hero.name}</h2>
              <button type="button" onClick={() => onOpenRestaurant(hero.restaurantId)} className="mt-3 w-fit text-sm font-bold text-[#f6b73c] transition hover:text-white">
                {hero.restaurantName} →
              </button>
              {hero.description ? <p className="mt-4 max-w-md text-sm leading-7 text-white/60">{hero.description}</p> : null}
              <div className="mt-7 flex flex-wrap items-center gap-5">
                <div>
                  <span className="text-3xl font-black tabular-nums">{formatPaise(hero.finalPricePaise)}</span>
                  {hero.discountPercent ? <span className="ml-2 text-sm tabular-nums text-white/45 line-through">{formatPaise(hero.pricePaise)}</span> : null}
                </div>
                <Stepper quantity={quantityOf(hero.id)} label={hero.name} onAdd={() => onAddDish(hero)} onStep={(delta) => onStepDish(hero, delta)} />
              </div>
              <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-white/45">
                <Flame size={13} className="text-[#f6b73c]" /> {hero.orderCount} plates ordered in the last 60 days
              </p>
            </div>
            <div className="order-1 relative min-h-56 lg:order-2 lg:min-h-[24rem]">
              <img alt={hero.name} src={hero.imageUrl ?? ITEM_FALLBACK} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#171713] via-[#171713]/25 to-transparent lg:bg-gradient-to-r" />
            </div>
          </div>
        </motion.section>
      ) : null}

      {/* Most ordered */}
      {rest.length ? (
        <Rail icon={<Flame size={22} className="text-[#c65d24]" />} title="Campus favourites" subtitle="Ranked by how many plates actually went out.">
          {rest.map((dish, index) => <DishCard key={dish.id} dish={dish} rank={index + 2} />)}
        </Rail>
      ) : null}

      {/* Combos */}
      {data.combos.length ? (
        <Rail icon={<Sparkles size={22} className="text-[#c65d24]" />} title="Combo deals" subtitle="Full meals bundled for less than ordering apart.">
          {data.combos.map((combo) => <ComboCard key={combo.id} combo={combo} />)}
        </Rail>
      ) : null}

      {/* Biryani ladder */}
      {data.biryani.length ? (
        <Rail
          icon={<Store size={22} className="text-[#c65d24]" />}
          title={cheapestBiryani ? `Biryani, from ${formatPaise(cheapestBiryani.finalPricePaise)}` : "Biryani"}
          subtitle="Every biryani on campus, cheapest first — compare before you commit."
        >
          {data.biryani.map((dish) => <DishCard key={dish.id} dish={dish} />)}
        </Rail>
      ) : null}

      {/* Value picks */}
      {data.valuePicks.length ? (
        <Rail icon={<Wallet size={22} className="text-[#c65d24]" />} title="Easy on the wallet" subtitle="Full meals under ₹150, sorted by what students reorder most.">
          {data.valuePicks.map((dish) => <DishCard key={dish.id} dish={dish} />)}
        </Rail>
      ) : null}

      {/* Browse all */}
      <motion.button
        type="button"
        onClick={onBrowseKitchens}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="group mt-16 flex w-full items-center justify-between gap-5 rounded-2xl border border-black/12 bg-white/60 p-6 text-left transition hover:border-black/25 hover:bg-white sm:p-8"
      >
        <div>
          <h2 className="text-2xl font-black tracking-[-0.035em] sm:text-3xl">Browse every kitchen</h2>
          <p className="mt-2 text-sm leading-6 text-[#6c6458] sm:text-base">Prefer to explore? See all restaurants serving campus today.</p>
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#171713] text-white transition duration-300 group-hover:-rotate-12 group-hover:bg-[#c65d24]"><ArrowRight size={20} /></span>
      </motion.button>
    </div>
  );
}
