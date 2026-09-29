import { FEATURES } from "./features";

// The admin sidebar's contents and the rules for which link is "current". Kept apart from
// the component (which only adds icons and styling) so the routing rules can be tested.

export type NavIcon =
  | "dashboard"
  | "orders"
  | "menu"
  | "offers"
  | "customers"
  | "delivery"
  | "analytics"
  | "log"
  | "pizza"
  | "settings";

export type NavLink = { href: string; label: string };
export type NavEntry =
  | { type: "link"; href: string; label: string; icon: NavIcon; dividerBefore?: boolean }
  | { type: "group"; label: string; icon: NavIcon; children: NavLink[]; dividerBefore?: boolean };

export function buildNav(features: { deliveryPortal: boolean }): NavEntry[] {
  return [
    { type: "link", href: "/admin", label: "Dashboard", icon: "dashboard" },
    { type: "group", label: "Orders", icon: "orders", children: [{ href: "/admin/orders", label: "Today" }, { href: "/admin/orders/all", label: "All orders" }] },
    { type: "group", label: "Menu", icon: "menu", children: [{ href: "/admin/menu/restaurants", label: "Restaurants" }, { href: "/admin/menu/items", label: "Items" }, { href: "/admin/menu/combos", label: "Combos" }] },
    { type: "group", label: "Offers", icon: "offers", children: [{ href: "/admin/offers/coupons", label: "Coupons" }, { href: "/admin/rewards", label: "Discount wheel" }] },
    { type: "group", label: "Customers", icon: "customers", children: [{ href: "/admin/customers", label: "Customers" }, { href: "/admin/ratings", label: "Reviews" }] },
    // Hidden while the delivery portal is switched off (lib/features.ts).
    ...(features.deliveryPortal ? [{ type: "link" as const, href: "/admin/delivery-persons", label: "Delivery", icon: "delivery" as const }] : []),
    { type: "link", href: "/admin/analytics", label: "Analytics", icon: "analytics" },
    { type: "link", href: "/admin/notifications", label: "Notification log", icon: "log" },
    // The Domino's shop is a separate business inside the admin, so it sits apart from the
    // main store's links.
    {
      type: "group",
      label: "Domino's Pizza",
      icon: "pizza",
      dividerBefore: true,
      children: [
        { href: "/admin/pizza", label: "Store" },
        { href: "/admin/pizza/courses", label: "Courses" },
        { href: "/admin/pizza/items", label: "Items" },
        { href: "/admin/pizza/combos", label: "Combos" },
        { href: "/admin/pizza/orders", label: "Orders" },
        { href: "/admin/pizza/today", label: "Today" }
      ]
    },
    { type: "link", href: "/admin/settings", label: "Settings", icon: "settings", dividerBefore: true }
  ];
}

export const NAV: NavEntry[] = buildNav(FEATURES);

// /admin/orders/<TRACKINGCODE>: an order's own page. Tracking codes are 4-12 letters and
// digits, so the fixed sub-pages ("all", "new", "today") are excluded by name.
export function isOrderDetailPath(pathname: string) {
  const match = /^\/admin\/orders\/([^/]+)$/.exec(pathname);
  return match !== null && !["all", "new", "today"].includes(match[1]);
}

// /admin/customers/<phone>: one customer's page.
export function isCustomerDetailPath(pathname: string) {
  return /^\/admin\/customers\/[^/]+$/.test(pathname);
}

export function isLinkActive(pathname: string, href: string) {
  // Today is the board itself and the "New order" form it links to; an order's own page
  // belongs to "All orders", which is where a search for it starts.
  if (href === "/admin/orders") return pathname === href || pathname === "/admin/orders/new";
  if (href === "/admin/orders/all") return pathname === href || pathname.startsWith(`${href}/`) || isOrderDetailPath(pathname);
  // Any of these have sibling routes nested one level deeper ("/x/y"), so a prefix
  // match would wrongly light up both the parent link and its sibling at once.
  if (href === "/admin" || href === "/admin/pizza") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isGroupActive(pathname: string, group: Extract<NavEntry, { type: "group" }>) {
  return group.children.some((child) => isLinkActive(pathname, child.href));
}

export function currentTitle(pathname: string, nav: NavEntry[] = NAV) {
  // These pages are not sidebar links of their own, so they get a name here rather than
  // borrowing the link that highlights for them.
  if (pathname === "/admin/orders/new") return "Orders / New order";
  if (isOrderDetailPath(pathname)) return "Orders / Order details";
  if (isCustomerDetailPath(pathname)) return "Customers / Customer";
  for (const entry of nav) {
    if (entry.type === "link" && isLinkActive(pathname, entry.href)) return entry.label;
    if (entry.type === "group") {
      const child = entry.children.find((candidate) => isLinkActive(pathname, candidate.href));
      // "Customers / Customers" reads as a stutter; the page name alone is enough.
      if (child) return child.label === entry.label ? child.label : `${entry.label} / ${child.label}`;
    }
  }
  return "Admin";
}
