"use client";

import Link from "next/link";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { CartNavButton } from "@/components/customer/CartNavButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/cart", label: "Cart" }
];

export function SiteNav({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className={cn("absolute inset-x-0 top-0 z-40", dark ? "text-white" : "text-[#171713]")}>
      <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-6 sm:px-8 lg:px-12" aria-label="Primary navigation">
        <Link href="/" className="group flex items-center gap-3" aria-label="Dish2Door home">
          <span className={cn("grid h-9 w-9 place-items-center rounded-md", dark ? "bg-white text-black" : "bg-[#171713] text-white")}><ShoppingBag size={17} strokeWidth={2.4} /></span>
          <span className="text-xl font-black tracking-[-0.035em]">Dish2Door</span>
        </Link>

        <div className={cn("hidden items-center gap-7 md:flex", dark ? "text-white" : "text-[#5f594f]")}>
          {links.slice(0, 2).map((link) => (
            <Link key={link.href} href={link.href} className={cn("relative py-2 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform hover:after:scale-x-100", dark ? "text-white/75 hover:text-white" : "hover:text-[#171713]")}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block [&_a]:rounded-md"><CartNavButton /></div>
        <Button variant={dark ? "secondary" : "outline"} size="icon" className="rounded-md md:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation" aria-expanded={open}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </Button>
      </nav>

      {open ? (
        <div className="mx-5 rounded-xl border border-black/10 bg-[#fffdf8] p-2 text-[#171713] shadow-[0_24px_70px_rgba(44,32,16,0.18)] md:hidden">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="block rounded-lg px-4 py-3 font-semibold transition hover:bg-[#f0ebe1]" onClick={() => setOpen(false)}>{link.label}</Link>
          ))}
        </div>
      ) : null}
    </header>
  );
}
