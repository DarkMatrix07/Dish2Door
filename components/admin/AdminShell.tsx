"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BadgePercent, ChevronDown, ClipboardList, ExternalLink, LayoutDashboard, Menu as MenuIcon, Pizza, ScrollText, Settings, UserRoundCheck, Users, UtensilsCrossed, X } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { NAV, currentTitle, isGroupActive, isLinkActive, type NavEntry, type NavIcon } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";

const ICONS: Record<NavIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  menu: UtensilsCrossed,
  offers: BadgePercent,
  customers: Users,
  delivery: UserRoundCheck,
  analytics: BarChart3,
  log: ScrollText,
  pizza: Pizza,
  settings: Settings
};

// What sits above a nav entry that starts a new block (the Domino's shop, Settings).
function Divider() {
  return <div className="mx-3 my-3 border-t border-white/10" aria-hidden />;
}

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [seenPath, setSeenPath] = useState(pathname);

  // Moving to a page opens the group it lives in. Done while rendering (React's pattern for
  // state that follows a changing value) instead of in an effect, which would paint one
  // frame with the group still shut.
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    const active = NAV.find((entry): entry is Extract<NavEntry, { type: "group" }> => entry.type === "group" && isGroupActive(pathname, entry));
    if (active) setOpen((current) => ({ ...current, [active.label]: true }));
  }

  return (
    // min-h-0 lets this box shrink below its content inside the full-height column, and
    // overflow-y-auto then gives the link list its own scrollbar on short screens.
    <nav className="admin-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Admin navigation">
      {NAV.map((entry) => {
        const Icon = ICONS[entry.icon];
        if (entry.type === "link") {
          const active = isLinkActive(pathname, entry.href);
          return (
            <div key={entry.href}>
              {entry.dividerBefore ? <Divider /> : null}
              <Link href={entry.href} onClick={onNavigate} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition duration-200", active ? "bg-[#f6b73c] text-[#171713]" : "text-white/65 hover:bg-white/[0.07] hover:text-white")}>
                <Icon size={18} strokeWidth={1.8} className={active ? "text-[#171713]" : "text-white/40"} />{entry.label}
              </Link>
            </div>
          );
        }

        const groupActive = isGroupActive(pathname, entry);
        const expanded = open[entry.label] ?? groupActive;
        return (
          <div key={entry.label}>
            {entry.dividerBefore ? <Divider /> : null}
            <button type="button" aria-expanded={expanded} onClick={() => setOpen((current) => ({ ...current, [entry.label]: !expanded }))} className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition duration-200", groupActive ? "text-white" : "text-white/65 hover:bg-white/[0.07] hover:text-white")}>
              <Icon size={18} strokeWidth={1.8} className={groupActive ? "text-[#f6b73c]" : "text-white/40"} /><span className="flex-1 text-left">{entry.label}</span><ChevronDown size={15} className={cn("text-white/35 transition-transform", expanded && "rotate-180")} />
            </button>
            {expanded ? <div className="mb-2 mt-1 space-y-1 pl-5">{entry.children.map((child) => {
              const active = isLinkActive(pathname, child.href);
              return <Link key={child.href} href={child.href} onClick={onNavigate} className={cn("flex min-h-10 items-center rounded-r-lg border-l px-3 py-2 text-sm transition", active ? "border-[#f6b73c] bg-white/[0.07] font-semibold text-white" : "border-white/10 text-white/45 hover:border-white/30 hover:bg-white/[0.05] hover:text-white")}>{child.label}</Link>;
            })}</div> : null}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ userName }: { userName: string }) {
  return (
    <div className="shrink-0 border-t border-white/10 p-3">
      <Link href="/" className="mb-2 flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-white/55 transition hover:bg-white/[0.07] hover:text-white">Customer site <ExternalLink size={14} /></Link>
      <div className="flex items-center gap-3 rounded-lg bg-white/[0.07] p-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6b73c] text-sm font-black text-[#171713]">{userName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{userName}</p><p className="text-xs text-white/40">Administrator</p></div>
        <div className="admin-logout"><LogoutButton /></div>
      </div>
    </div>
  );
}

export function AdminShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [seenPath, setSeenPath] = useState(pathname);

  // Following a link closes the phone menu. Done while rendering rather than in an effect.
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMobileOpen(false);
  }

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
      {/* A full-height column pinned to the window: header and footer keep their size and only the link list in between scrolls, so the dark bar never ends partway down a long page. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-dvh w-72 flex-col bg-[#171713] text-white lg:flex">
        <div className="shrink-0 border-b border-white/10 px-5 py-5"><Link href="/admin" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#f6b73c] text-sm font-black text-[#171713]">D2</span><span><span className="block text-lg font-black tracking-[-0.035em]">Dish2Door</span><span className="block text-xs font-medium text-white/40">Admin workspace</span></span></Link></div>
        <SidebarNav pathname={pathname} />
        <SidebarFooter userName={userName} />
      </aside>

      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg bg-[#171713] text-white transition active:scale-95" aria-label="Open menu"><MenuIcon size={19} /></button>
        <p className="mx-3 truncate text-sm font-bold">{currentTitle(pathname)}</p>
        <Link href="/admin" className="grid h-10 w-10 place-items-center rounded-lg bg-[#f6b73c] text-xs font-black text-[#171713]">D2</Link>
      </header>

      {mobileOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Close menu overlay" className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-sm" onClick={() => setMobileOpen(false)} /><aside className="absolute inset-y-0 left-0 flex h-dvh w-[20rem] max-w-[88vw] flex-col bg-[#171713] text-white shadow-2xl"><div className="flex min-h-16 shrink-0 items-center justify-between border-b border-white/10 px-5 py-4"><Link href="/admin" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6b73c] text-xs font-black text-[#171713]">D2</span><span><span className="block font-black">Dish2Door</span><span className="block text-xs text-white/40">Admin workspace</span></span></Link><button type="button" onClick={() => setMobileOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 text-white/70" aria-label="Close menu"><X size={17} /></button></div><SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} /><SidebarFooter userName={userName} /></aside></div> : null}

      <div className="lg:pl-72">
        <div className="sticky top-0 z-20 hidden min-h-16 items-center justify-between border-b border-black/8 bg-white/80 px-8 backdrop-blur-xl lg:flex"><div><p className="text-xs font-semibold text-[#8a8c93]">Admin workspace</p><p className="text-sm font-black">{currentTitle(pathname)}</p></div><Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-bold text-[#4e5057] transition hover:border-black/20">View customer site <ExternalLink size={14} /></Link></div>
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </div>
    </div>
  );
}

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  // space-y here gives every admin page a consistent vertical rhythm; without it
  // stacked stat grids and section cards sit flush against each other.
  return <section className={cn("mx-auto max-w-[1440px] space-y-4 px-4 py-6 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10", className)}>{children}</section>;
}

export function AdminPageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  // No bottom margin: PageContainer's space-y owns the gap to the next block.
  return <div className="flex flex-col gap-5 border-b border-black/10 pb-6 sm:pb-8 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold text-[#b65a20]">{eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#70727a] sm:text-base">{description}</p></div>{children ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{children}</div> : null}</div>;
}

// `title` carries the long form of a short label (hover on desktop, read out by screen readers).
// Phones: the grid that holds these should be two columns (or three for exactly three short
// ones) and each card sits in its own grid cell, so labels stay on one line and the helper
// text wraps instead of being cut off.
export function StatCard({ label, value, helper, title, className }: { label: string; value: React.ReactNode; helper?: string; title?: string; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-white p-4 shadow-[0_10px_35px_rgba(30,32,38,0.05)] sm:p-5", className)}>
      <p className="truncate text-xs font-bold text-[#85878e] sm:text-sm" title={title}>{title ? <><span aria-hidden="true">{label}</span><span className="sr-only">{title}</span></> : label}</p>
      <p className="mt-2 truncate text-[1.375rem] font-black leading-tight tracking-[-0.04em] tabular-nums sm:text-3xl" title={typeof value === "string" ? value : undefined}>{value}</p>
      {helper ? <p className="mt-1 break-words text-xs leading-5 text-[#96989e]">{helper}</p> : null}
    </div>
  );
}

export function SectionCard({ id, title, description, actions, children, className, bodyClassName }: { id?: string; title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return <section id={id} className={cn("min-w-0 overflow-hidden rounded-xl bg-white shadow-[0_10px_35px_rgba(30,32,38,0.05)]", id && "scroll-mt-20 lg:scroll-mt-24", className)}>{title || actions ? <header className="flex flex-col gap-3 border-b border-black/8 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div>{title ? <h2 className="text-base font-black tracking-[-0.02em] sm:text-lg">{title}</h2> : null}{description ? <p className="mt-1 text-sm leading-5 text-[#777981]">{description}</p> : null}</div>{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}</header> : null}<div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div></section>;
}
