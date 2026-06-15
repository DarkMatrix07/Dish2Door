"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
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
    <header className={cn("absolute inset-x-0 top-0 z-40", dark ? "text-white" : "text-neutral-950")}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-black tracking-tight">
          Dish2Door
        </Link>

        <div
          className={cn(
            "hidden items-center gap-1 rounded-full border px-2 py-1 backdrop-blur md:flex",
            dark ? "border-white/15 bg-white/10" : "border-neutral-200 bg-white/80"
          )}
        >
          {links.slice(0, 2).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition",
                dark ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-neutral-600 hover:bg-neutral-950 hover:text-white"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <CartNavButton />
        </div>

        <Button
          variant={dark ? "secondary" : "outline"}
          size="icon"
          className="md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="Toggle navigation"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </Button>
      </nav>

      {open ? (
        <div className="mx-4 rounded-3xl border border-neutral-200 bg-white p-3 text-neutral-950 shadow-2xl md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-2xl px-4 py-3 font-semibold hover:bg-neutral-100"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </header>
  );
}
