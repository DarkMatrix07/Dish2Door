"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, ShoppingBag, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CartNavButton } from "@/components/customer/CartNavButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/pizza", label: "Pizza" },
  { href: "/cart", label: "Cart" }
];

// Cart has its own button on desktop, so the inline links stop before it.
const DESKTOP_LINK_COUNT = 3;

export function SiteNav({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement | null>(null);

  // Tap outside or press Escape to close the mobile menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!headerRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header ref={headerRef} className={cn("absolute inset-x-0 top-0 z-40", dark ? "text-white" : "text-[#171713]")}>
      <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-6 sm:px-8 lg:px-12" aria-label="Primary navigation">
        <Link href="/" className="group flex items-center gap-3" aria-label="Dish2Door home">
          <span className={cn("grid h-9 w-9 place-items-center rounded-md", dark ? "bg-white text-black" : "bg-[#171713] text-white")}><ShoppingBag size={17} strokeWidth={2.4} /></span>
          <span className="text-xl font-black tracking-[-0.035em]">Dish2Door</span>
        </Link>

        <div className={cn("hidden items-center gap-7 md:flex", dark ? "text-white" : "text-[#5f594f]")}>
          {links.slice(0, DESKTOP_LINK_COUNT).map((link) => (
            <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={cn("relative py-2 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform hover:after:scale-x-100", dark ? "text-white/75 hover:text-white" : "hover:text-[#171713]", pathname === link.href && (dark ? "text-white after:scale-x-100" : "text-[#171713] after:scale-x-100"))}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block [&_a]:rounded-md"><CartNavButton /></div>
        <Button variant={dark ? "secondary" : "outline"} size="icon" className="rounded-md md:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation" aria-expanded={open}>
          <motion.span key={open ? "close" : "open"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.18 }} className="grid place-items-center">
            {open ? <X size={18} /> : <Menu size={18} />}
          </motion.span>
        </Button>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mx-5 origin-top rounded-xl border border-black/10 bg-[#fffdf8] p-2 text-[#171713] shadow-[0_24px_70px_rgba(44,32,16,0.18)] md:hidden"
          >
            {links.map((link, index) => (
              <motion.div key={link.href} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * index }}>
                <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={cn("block rounded-lg px-4 py-3 font-semibold transition hover:bg-[#f0ebe1]", pathname === link.href && "bg-[#f0ebe1]")} onClick={() => setOpen(false)}>{link.label}</Link>
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
