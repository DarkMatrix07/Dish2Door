import assert from "node:assert/strict";
import test from "node:test";
import { buildNav, currentTitle, isCustomerDetailPath, isGroupActive, isLinkActive, isOrderDetailPath, type NavEntry } from "../lib/admin-nav";

const nav = buildNav({ deliveryPortal: false });
const hrefs = (entries: NavEntry[]) => entries.flatMap((entry) => (entry.type === "link" ? [entry.href] : entry.children.map((child) => child.href)));

test("the sidebar links to every page in the agreed groups, once each", () => {
  const all = hrefs(nav);
  assert.equal(new Set(all).size, all.length);
  for (const href of [
    "/admin", "/admin/orders", "/admin/orders/all", "/admin/menu/restaurants", "/admin/menu/items", "/admin/menu/combos",
    "/admin/offers/coupons", "/admin/rewards", "/admin/customers", "/admin/ratings", "/admin/analytics",
    "/admin/notifications", "/admin/activity", "/admin/settings", "/admin/pizza", "/admin/pizza/today"
  ]) assert.ok(all.includes(href), `${href} is in the nav`);
});

test("item discounts, the old campuses page and the delivery page are not links while delivery is off", () => {
  const all = hrefs(nav);
  assert.ok(!all.includes("/admin/offers/discounts"));
  assert.ok(!all.includes("/admin/settings/campuses"));
  assert.ok(!all.includes("/admin/delivery-persons"));
});

test("the delivery link only appears when the delivery portal is on", () => {
  assert.ok(hrefs(buildNav({ deliveryPortal: true })).includes("/admin/delivery-persons"));
});

test("Settings is a single link and the Domino's group sits apart from the main store", () => {
  const settings = nav.find((entry) => entry.type === "link" && entry.href === "/admin/settings");
  assert.equal(settings?.type, "link");
  const pizza = nav.find((entry) => entry.type === "group" && entry.label === "Domino's Pizza");
  assert.equal(pizza?.dividerBefore, true);
  assert.ok(nav.indexOf(pizza!) > nav.findIndex((entry) => entry.type === "link" && entry.href === "/admin/notifications"));
});

test("the Activity log sits next to the Notification log and has its own title and highlight", () => {
  const all = hrefs(nav);
  assert.equal(all.indexOf("/admin/activity"), all.indexOf("/admin/notifications") + 1);
  assert.equal(currentTitle("/admin/activity", nav), "Activity log");
  assert.equal(currentTitle("/admin/notifications", nav), "Notification log");
  assert.equal(isLinkActive("/admin/activity", "/admin/activity"), true);
  assert.equal(isLinkActive("/admin/activity", "/admin/notifications"), false);
});

test("order pages keep their sidebar highlight rules", () => {
  assert.equal(isLinkActive("/admin/orders", "/admin/orders"), true);
  assert.equal(isLinkActive("/admin/orders/new", "/admin/orders"), true);
  assert.equal(isLinkActive("/admin/orders/new", "/admin/orders/all"), false);
  assert.equal(isLinkActive("/admin/orders/ABC12345", "/admin/orders/all"), true);
  assert.equal(isLinkActive("/admin/orders/ABC12345", "/admin/orders"), false);
  assert.equal(isOrderDetailPath("/admin/orders/all"), false);
  assert.equal(isOrderDetailPath("/admin/orders/ABC12345"), true);
});

test("a customer's page highlights Customers, and only Customers", () => {
  assert.equal(isLinkActive("/admin/customers/9876543210", "/admin/customers"), true);
  assert.equal(isLinkActive("/admin/customers/9876543210", "/admin/ratings"), false);
  assert.equal(isCustomerDetailPath("/admin/customers/9876543210"), true);
  assert.equal(isCustomerDetailPath("/admin/customers"), false);
});

test("the Domino's Store link does not light up on its sub-pages", () => {
  assert.equal(isLinkActive("/admin/pizza/items", "/admin/pizza"), false);
  assert.equal(isLinkActive("/admin/pizza/items", "/admin/pizza/items"), true);
  const pizza = nav.find((entry): entry is Extract<NavEntry, { type: "group" }> => entry.type === "group" && entry.label === "Domino's Pizza")!;
  assert.equal(isGroupActive("/admin/pizza/combos", pizza), true);
  assert.equal(isGroupActive("/admin/menu/combos", pizza), false);
});

test("the top bar has a sensible title on every admin page", () => {
  const titles: Record<string, string> = {
    "/admin": "Dashboard",
    "/admin/orders": "Orders / Today",
    "/admin/orders/new": "Orders / New order",
    "/admin/orders/all": "Orders / All orders",
    "/admin/orders/ABC12345": "Orders / Order details",
    "/admin/menu/restaurants": "Menu / Restaurants",
    "/admin/menu/items": "Menu / Items",
    "/admin/menu/combos": "Menu / Combos",
    "/admin/offers/coupons": "Offers / Coupons",
    "/admin/rewards": "Offers / Discount wheel",
    "/admin/customers": "Customers",
    "/admin/customers/9876543210": "Customers / Customer",
    "/admin/ratings": "Customers / Reviews",
    "/admin/analytics": "Analytics",
    "/admin/notifications": "Notification log",
    "/admin/settings": "Settings",
    "/admin/pizza": "Domino's Pizza / Store",
    "/admin/pizza/orders": "Domino's Pizza / Orders"
  };
  for (const [path, title] of Object.entries(titles)) assert.equal(currentTitle(path, nav), title, path);
  assert.equal(currentTitle("/admin/somewhere-else", nav), "Admin");
});
