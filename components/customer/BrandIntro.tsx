"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const INTRO_KEY = "dish2door-intro-seen";

// A short brand moment on the first home-page visit of a session. It used to run on
// every route for 1.75s, so a customer opening a tracking link from WhatsApp or email
// waited behind a splash before seeing their order. Now: home page only, about a
// second, and a tap skips it. The `intro-seen` class (set by an inline script in the
// root layout before paint) hides it on later visits without a hydration flash.
export function BrandIntro() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(pathname === "/");

  useEffect(() => {
    if (!visible) return;
    let seen = false;
    try {
      seen = Boolean(window.sessionStorage.getItem(INTRO_KEY));
      window.sessionStorage.setItem(INTRO_KEY, "true");
    } catch {
      // Storage blocked: still show it once, then let it go.
    }
    const timer = window.setTimeout(() => setVisible(false), seen ? 0 : reduceMotion ? 350 : 1050);
    return () => window.clearTimeout(timer);
  }, [visible, reduceMotion]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          data-brand-intro=""
          onClick={() => setVisible(false)}
          className="fixed inset-0 z-[100] grid cursor-pointer place-items-center overflow-hidden bg-[#171713] text-white"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.12 : 0.35, ease: [0.76, 0, 0.24, 1] } }}
          aria-label="Dish2Door is loading"
          role="status"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-[#f6b73c]" />
          <motion.div
            className="absolute h-[38rem] w-[38rem] rounded-full border border-white/[0.06]"
            initial={reduceMotion ? false : { scale: 0.65, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />

          <div className="relative w-full max-w-sm px-8 text-center">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-center gap-3"
            >
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#f6b73c] text-[#171713]"><ShoppingBag size={22} strokeWidth={2.3} /></span>
              <span className="text-4xl font-black tracking-[-0.055em]">Dish2Door</span>
            </motion.div>

            <div className="relative mx-auto mt-10 h-8 w-64">
              <div className="absolute left-0 right-0 top-1/2 h-px bg-white/15" />
              <div className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-white/40 bg-[#171713]" />
              <div className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#f6b73c]" />
              <motion.div
                className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#f6b73c]"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: reduceMotion ? 0.2 : 0.75, delay: 0.1, ease: [0.65, 0, 0.35, 1] }}
              />
              <motion.span
                className="absolute left-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-[#f6b73c] text-[#171713] shadow-[0_0_0_6px_rgba(246,183,60,0.12)]"
                initial={{ x: 0, rotate: -8 }}
                animate={{ x: 224, rotate: 8 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.75, delay: 0.1, ease: [0.65, 0, 0.35, 1] }}
              >
                <ShoppingBag size={14} strokeWidth={2.5} />
              </motion.span>
            </div>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-6 text-sm font-semibold text-white/55">
              Bringing campus favourites closer.
            </motion.p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
