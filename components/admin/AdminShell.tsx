"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, ClipboardList, ExternalLink, LayoutDashboard, LogOut, MenuSquare, Settings, ShieldCheck, Star, UserRoundCheck } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", description: "Live operations", icon: LayoutDashboard },
  { href: "/admin/menu", label: "Menu", description: "Restaurants and inventory", icon: MenuSquare },
  { href: "/admin/moderation", label: "Moderation", description: "Discounts and coupons", icon: ShieldCheck },
  { href: "/admin/orders", label: "Orders", description: "Manual orders and filters", icon: ClipboardList },
  { href: "/admin/delivery-persons", label: "Delivery", description: "Staff accounts and access", icon: UserRoundCheck },
  { href: "/admin/notifications", label: "Notifications", description: "Logs and retries", icon: BellRing },
  { href: "/admin/ratings", label: "Ratings", description: "Reviews and averages", icon: Star },
  { href: "/admin/settings", label: "Settings", description: "Fees and ordering state", icon: Settings }
];

export function AdminShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[#f6f2ea] text-neutral-950">
      <div className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-[#ded3c0] bg-[#fdf8ef] text-neutral-950 shadow-xl shadow-neutral-900/5 lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-[#eadfce] p-6">
            <Link href="/admin" className="block">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-700">Dish2Door</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Command center</h1>
            </Link>
            <p className="mt-3 text-sm leading-6 text-neutral-600">Campus ordering, handoffs, stock, and delivery flow in one clean cockpit.</p>
          </div>

          <nav className="flex-1 space-y-2 p-4">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl px-4 py-3 transition",
                    active ? "bg-[#f3e7d4] text-neutral-950 shadow-sm ring-1 ring-amber-200" : "text-neutral-600 hover:bg-[#f2eadf] hover:text-neutral-950"
                  )}
                >
                  <item.icon size={20} />
                  <span>
                    <span className="block font-black">{item.label}</span>
                    <span className={cn("block text-xs", active ? "text-neutral-600" : "text-neutral-400")}>{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-[#eadfce] p-4">
            <Link href="/" className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-neutral-700 shadow-sm hover:bg-[#f8f0e3]">
              Customer site <ExternalLink size={15} />
            </Link>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-200 font-black text-neutral-950">
                  {userName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{userName}</p>
                  <p className="text-xs text-neutral-500">Admin access</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <LogOut size={15} className="text-neutral-400" />
                <LogoutButton />
              </div>
            </div>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-[#f5f1e8]/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/admin">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Dish2Door</p>
            <h1 className="font-black">Admin</h1>
          </Link>
          <LogoutButton />
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "min-w-20 shrink-0 rounded-full px-4 py-2 text-center text-sm font-bold shadow-sm",
                pathname === item.href
                  ? "bg-[#f3e7d4] text-neutral-950 ring-1 ring-amber-200"
                  : "bg-white text-neutral-700"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="lg:pl-72">
        <div className="min-h-screen">{children}</div>
      </div>
    </main>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700">{eyebrow}</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-neutral-950 sm:text-5xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">{description}</p>
      </div>
      {children}
    </div>
  );
}
