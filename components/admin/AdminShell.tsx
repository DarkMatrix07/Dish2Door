"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  BellRing,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Menu as MenuIcon,
  Settings,
  Star,
  UserRoundCheck,
  UtensilsCrossed,
  X
} from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };
type NavEntry =
  | { type: "link"; href: string; label: string; icon: typeof LayoutDashboard }
  | { type: "group"; label: string; icon: typeof LayoutDashboard; children: NavLink[] };

const NAV: NavEntry[] = [
  { type: "link", href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  {
    type: "group",
    label: "Orders",
    icon: ClipboardList,
    children: [
      { href: "/admin/orders", label: "Live orders" },
      { href: "/admin/orders/new", label: "New manual order" }
    ]
  },
  {
    type: "group",
    label: "Catalogue",
    icon: UtensilsCrossed,
    children: [
      { href: "/admin/menu/restaurants", label: "Restaurants" },
      { href: "/admin/menu/items", label: "Menu items" }
    ]
  },
  {
    type: "group",
    label: "Offers",
    icon: BadgePercent,
    children: [
      { href: "/admin/offers/discounts", label: "Item discounts" },
      { href: "/admin/offers/coupons", label: "Coupons" }
    ]
  },
  { type: "link", href: "/admin/delivery-persons", label: "Delivery", icon: UserRoundCheck },
  { type: "link", href: "/admin/ratings", label: "Ratings", icon: Star },
  { type: "link", href: "/admin/notifications", label: "Notifications", icon: BellRing },
  {
    type: "group",
    label: "Settings",
    icon: Settings,
    children: [
      { href: "/admin/settings", label: "Store & ordering" },
      { href: "/admin/settings/fees", label: "Fees" }
    ]
  }
];

function isLinkActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, group: Extract<NavEntry, { type: "group" }>) {
  return group.children.some((child) => isLinkActive(pathname, child.href));
}

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Keep the group containing the active route expanded.
  useEffect(() => {
    setOpen((current) => {
      const next = { ...current };
      for (const entry of NAV) {
        if (entry.type === "group" && isGroupActive(pathname, entry)) {
          next[entry.label] = true;
        }
      }
      return next;
    });
  }, [pathname]);

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {NAV.map((entry) => {
        if (entry.type === "link") {
          const active = isLinkActive(pathname, entry.href);
          return (
            <Link
              key={entry.href}
              href={entry.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                active
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              )}
            >
              <entry.icon size={18} className={active ? "text-amber-300" : "text-neutral-400"} />
              {entry.label}
            </Link>
          );
        }

        const groupActive = isGroupActive(pathname, entry);
        const expanded = open[entry.label] ?? groupActive;
        return (
          <div key={entry.label}>
            <button
              type="button"
              onClick={() => setOpen((current) => ({ ...current, [entry.label]: !expanded }))}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                groupActive ? "text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              )}
            >
              <entry.icon size={18} className={groupActive ? "text-amber-500" : "text-neutral-400"} />
              <span className="flex-1 text-left">{entry.label}</span>
              <ChevronDown size={16} className={cn("text-neutral-400 transition-transform", expanded && "rotate-180")} />
            </button>
            {expanded ? (
              <div className="mt-1 space-y-1 pl-5">
                {entry.children.map((child) => {
                  const active = isLinkActive(pathname, child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm transition",
                        active
                          ? "border-amber-500 bg-amber-50 font-semibold text-neutral-900"
                          : "border-transparent text-neutral-500 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900"
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ userName }: { userName: string }) {
  return (
    <div className="border-t border-neutral-200 p-3">
      <Link
        href="/"
        className="mb-2 flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      >
        Customer site <ExternalLink size={14} />
      </Link>
      <div className="flex items-center gap-3 rounded-xl bg-neutral-100 p-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-900 text-sm font-bold text-white">
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{userName}</p>
          <p className="text-xs text-neutral-500">Administrator</p>
        </div>
        <LogoutButton />
      </div>
    </div>
  );
}

function currentTitle(pathname: string) {
  for (const entry of NAV) {
    if (entry.type === "link" && isLinkActive(pathname, entry.href)) return entry.label;
    if (entry.type === "group") {
      const child = entry.children.find((c) => isLinkActive(pathname, c.href));
      if (child) return `${entry.label} · ${child.label}`;
    }
  }
  return "Admin";
}

export function AdminShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-neutral-200 bg-white lg:flex">
        <div className="border-b border-neutral-200 px-5 py-5">
          <Link href="/admin" className="block">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-600">Dish2Door</p>
            <h1 className="mt-1 text-lg font-bold tracking-tight">Admin console</h1>
          </Link>
        </div>
        <SidebarNav pathname={pathname} />
        <SidebarFooter userName={userName} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-100"
          aria-label="Open menu"
        >
          <MenuIcon size={20} />
        </button>
        <p className="truncate text-sm font-semibold text-neutral-800">{currentTitle(pathname)}</p>
        <Link href="/admin" className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
          D2D
        </Link>
      </header>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[19rem] max-w-[85vw] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <Link href="/admin" className="block" onClick={() => setMobileOpen(false)}>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-600">Dish2Door</p>
                <h1 className="mt-1 text-lg font-bold tracking-tight">Admin console</h1>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter userName={userName} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <div className="min-h-screen">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Shared page-level helpers ---------- */

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8", className)}>{children}</section>;
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
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, helper }: { label: string; value: React.ReactNode; helper?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      {helper ? <p className="mt-1 text-xs text-neutral-400">{helper}</p> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm", className)}>
      {title || actions ? (
        <div className="flex flex-col gap-3 border-b border-neutral-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            {title ? <h3 className="text-base font-bold text-neutral-900 sm:text-lg">{title}</h3> : null}
            {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}
