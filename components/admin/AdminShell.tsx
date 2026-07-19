"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgePercent, BarChart3, BellRing, ChevronDown, ClipboardList, ExternalLink, LayoutDashboard, Menu as MenuIcon, Settings, Star, UserRoundCheck, UtensilsCrossed, X } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };
type NavEntry =
  | { type: "link"; href: string; label: string; icon: typeof LayoutDashboard }
  | { type: "group"; label: string; icon: typeof LayoutDashboard; children: NavLink[] };

const NAV: NavEntry[] = [
  { type: "link", href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { type: "group", label: "Orders", icon: ClipboardList, children: [{ href: "/admin/orders", label: "Live orders" }, { href: "/admin/orders/today", label: "Today's orders" }, { href: "/admin/orders/new", label: "New manual order" }] },
  { type: "group", label: "Catalogue", icon: UtensilsCrossed, children: [{ href: "/admin/menu/restaurants", label: "Restaurants" }, { href: "/admin/menu/items", label: "Menu items" }] },
  { type: "group", label: "Offers", icon: BadgePercent, children: [{ href: "/admin/offers/discounts", label: "Item discounts" }, { href: "/admin/offers/coupons", label: "Coupons" }] },
  { type: "link", href: "/admin/delivery-persons", label: "Delivery", icon: UserRoundCheck },
  { type: "link", href: "/admin/ratings", label: "Ratings", icon: Star },
  { type: "link", href: "/admin/notifications", label: "Notifications", icon: BellRing },
  { type: "group", label: "Settings", icon: Settings, children: [{ href: "/admin/settings", label: "Store & ordering" }, { href: "/admin/settings/fees", label: "Fees" }] }
];

function isLinkActive(pathname: string, href: string) {
  if (href === "/admin" || href === "/admin/orders") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, group: Extract<NavEntry, { type: "group" }>) {
  return group.children.some((child) => isLinkActive(pathname, child.href));
}

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpen((current) => {
      const next = { ...current };
      NAV.forEach((entry) => { if (entry.type === "group" && isGroupActive(pathname, entry)) next[entry.label] = true; });
      return next;
    });
  }, [pathname]);

  return (
    <nav className="admin-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
      {NAV.map((entry) => {
        if (entry.type === "link") {
          const active = isLinkActive(pathname, entry.href);
          return (
            <Link key={entry.href} href={entry.href} onClick={onNavigate} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition duration-200", active ? "bg-[#f6b73c] text-[#171713]" : "text-white/65 hover:bg-white/[0.07] hover:text-white")}>
              <entry.icon size={18} strokeWidth={1.8} className={active ? "text-[#171713]" : "text-white/40"} />{entry.label}
            </Link>
          );
        }

        const groupActive = isGroupActive(pathname, entry);
        const expanded = open[entry.label] ?? groupActive;
        return (
          <div key={entry.label}>
            <button type="button" onClick={() => setOpen((current) => ({ ...current, [entry.label]: !expanded }))} className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition duration-200", groupActive ? "text-white" : "text-white/65 hover:bg-white/[0.07] hover:text-white")}>
              <entry.icon size={18} strokeWidth={1.8} className={groupActive ? "text-[#f6b73c]" : "text-white/40"} /><span className="flex-1 text-left">{entry.label}</span><ChevronDown size={15} className={cn("text-white/35 transition-transform", expanded && "rotate-180")} />
            </button>
            {expanded ? <div className="mb-2 mt-1 space-y-1 pl-5">{entry.children.map((child) => {
              const active = isLinkActive(pathname, child.href);
              return <Link key={child.href} href={child.href} onClick={onNavigate} className={cn("flex min-h-9 items-center rounded-r-lg border-l px-3 py-2 text-sm transition", active ? "border-[#f6b73c] bg-white/[0.07] font-semibold text-white" : "border-white/10 text-white/45 hover:border-white/30 hover:bg-white/[0.05] hover:text-white")}>{child.label}</Link>;
            })}</div> : null}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ userName }: { userName: string }) {
  return (
    <div className="border-t border-white/10 p-3">
      <Link href="/" className="mb-2 flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-white/55 transition hover:bg-white/[0.07] hover:text-white">Customer site <ExternalLink size={14} /></Link>
      <div className="flex items-center gap-3 rounded-lg bg-white/[0.07] p-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6b73c] text-sm font-black text-[#171713]">{userName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{userName}</p><p className="text-xs text-white/40">Administrator</p></div>
        <div className="admin-logout"><LogoutButton /></div>
      </div>
    </div>
  );
}

function currentTitle(pathname: string) {
  for (const entry of NAV) {
    if (entry.type === "link" && isLinkActive(pathname, entry.href)) return entry.label;
    if (entry.type === "group") {
      const child = entry.children.find((candidate) => isLinkActive(pathname, candidate.href));
      if (child) return `${entry.label} / ${child.label}`;
    }
  }
  return "Admin";
}

export function AdminShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [mobileOpen]);

  return (
    <div className="admin-app min-h-screen bg-[#f3f4f6] text-[#202126]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col bg-[#171713] text-white lg:flex">
        <div className="border-b border-white/10 px-5 py-5"><Link href="/admin" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#f6b73c] text-sm font-black text-[#171713]">D2</span><span><span className="block text-lg font-black tracking-[-0.035em]">Dish2Door</span><span className="block text-xs font-medium text-white/40">Admin workspace</span></span></Link></div>
        <SidebarNav pathname={pathname} />
        <SidebarFooter userName={userName} />
      </aside>

      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg bg-[#171713] text-white transition active:scale-95" aria-label="Open menu"><MenuIcon size={19} /></button>
        <p className="mx-3 truncate text-sm font-bold">{currentTitle(pathname)}</p>
        <Link href="/admin" className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6b73c] text-xs font-black text-[#171713]">D2</Link>
      </header>

      {mobileOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Close menu overlay" className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-sm" onClick={() => setMobileOpen(false)} /><aside className="absolute inset-y-0 left-0 flex w-[20rem] max-w-[88vw] flex-col bg-[#171713] text-white shadow-2xl"><div className="flex min-h-16 items-center justify-between border-b border-white/10 px-5 py-4"><Link href="/admin" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6b73c] text-xs font-black text-[#171713]">D2</span><span><span className="block font-black">Dish2Door</span><span className="block text-xs text-white/40">Admin workspace</span></span></Link><button type="button" onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white/70" aria-label="Close menu"><X size={17} /></button></div><SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} /><SidebarFooter userName={userName} /></aside></div> : null}

      <div className="lg:pl-72">
        <div className="sticky top-0 z-20 hidden min-h-16 items-center justify-between border-b border-black/8 bg-white/80 px-8 backdrop-blur-xl lg:flex"><div><p className="text-xs font-semibold text-[#8a8c93]">Admin workspace</p><p className="text-sm font-black">{currentTitle(pathname)}</p></div><Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-bold text-[#4e5057] transition hover:border-black/20">View customer site <ExternalLink size={14} /></Link></div>
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </div>
    </div>
  );
}

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10", className)}>{children}</section>;
}

export function AdminPageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col gap-5 border-b border-black/10 pb-6 sm:mb-8 sm:pb-8 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold text-[#b65a20]">{eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#70727a] sm:text-base">{description}</p></div>{children ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{children}</div> : null}</div>;
}

export function StatCard({ label, value, helper }: { label: string; value: React.ReactNode; helper?: string }) {
  return <div className="min-w-0 rounded-xl bg-white p-4 shadow-[0_10px_35px_rgba(30,32,38,0.05)] sm:p-5"><p className="truncate text-xs font-bold text-[#85878e] sm:text-sm">{label}</p><p className="mt-2 truncate text-2xl font-black tracking-[-0.04em] tabular-nums sm:text-3xl" title={typeof value === "string" ? value : undefined}>{value}</p>{helper ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#96989e]">{helper}</p> : null}</div>;
}

export function SectionCard({ title, description, actions, children, className, bodyClassName }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return <section className={cn("min-w-0 overflow-hidden rounded-xl bg-white shadow-[0_10px_35px_rgba(30,32,38,0.05)]", className)}>{title || actions ? <header className="flex flex-col gap-3 border-b border-black/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div>{title ? <h2 className="text-base font-black tracking-[-0.02em] sm:text-lg">{title}</h2> : null}{description ? <p className="mt-1 text-sm leading-5 text-[#777981]">{description}</p> : null}</div>{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}</header> : null}<div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div></section>;
}
