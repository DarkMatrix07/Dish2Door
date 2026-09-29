// The rules behind the Today board, kept pure (no database, no React) so the server
// query, the client grouping, the bulk "reached campus" action and the printed prep sheet
// all read from one place, and so they can be unit-tested. Prisma is imported for types
// only: this file is bundled into the browser too.
import type { OrderSlot, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import {
  FULFILLABLE_PAYMENT_STATUSES,
  REAL_ORDER_WHERE,
  REVENUE_ORDER_WHERE,
  UNPAID_CHECKOUT_WHERE
} from "@/lib/order-filters";

// The board is for the shops handed over at the campus gates. WhatsApp-mode shops
// (Domino's) run their own admin under /admin/pizza, and the global "reached campus"
// sweep has always skipped them, so this one rule is shared by the board, the sweep and
// the scoped bulk action.
export const BOARD_RESTAURANT_WHERE = { orderMode: "ONLINE_PAYMENT" } satisfies Prisma.RestaurantWhereInput;

export type DayRange = { start: Date; end: Date };

// ---------------------------------------------------------------------------------
// Where-builders
// ---------------------------------------------------------------------------------

// Everything placed today (IST) that counts as a real order, in every status. Cancelled
// orders are included on purpose: the board lists them in their own section.
export function todayBoardWhere(range: DayRange): Prisma.OrderWhereInput {
  return {
    AND: [REAL_ORDER_WHERE, { createdAt: { gte: range.start, lt: range.end }, restaurant: BOARD_RESTAURANT_WHERE }]
  };
}

// Paid (or pay-later) orders from before today that nobody has delivered or cancelled.
// They are the ones that used to be forgotten once the day rolled over.
export function openEarlierWhere(todayStart: Date): Prisma.OrderWhereInput {
  return {
    AND: [
      REAL_ORDER_WHERE,
      {
        status: { in: ["ORDER_CONFIRMED", "REACHED_CAMPUS"] },
        createdAt: { lt: todayStart },
        restaurant: BOARD_RESTAURANT_WHERE
      }
    ]
  };
}

// Online checkouts opened today that were never paid. Not orders; only counted so the
// board can link to them.
export function unpaidCheckoutsTodayWhere(range: DayRange): Prisma.OrderWhereInput {
  return { AND: [UNPAID_CHECKOUT_WHERE, { createdAt: { gte: range.start, lt: range.end } }] };
}

// Domino's orders placed today, counted the way its own Today page lists them.
export function dominosTodayWhere(range: DayRange): Prisma.OrderWhereInput {
  return {
    createdAt: { gte: range.start, lt: range.end },
    restaurant: { orderMode: "WHATSAPP" },
    status: { notIn: ["CANCELLED", "AWAITING_CONFIRMATION"] }
  };
}

// Which orders a "reached campus" sweep may move. `undefined` means "do not filter on
// this"; `null` is a real value: campusId null is the orders with no campus, slot null is
// the orders with no slot. Only today's (IST) orders are ever swept, so a customer is never
// told "reached campus" about an order from an earlier day; those are handled one by one
// from the board's "still open" strip.
export type ReachedCampusScope = { campusId?: string | null; slot?: OrderSlot | null };

export function reachedCampusWhere(scope: ReachedCampusScope, range: DayRange): Prisma.OrderWhereInput {
  return {
    createdAt: { gte: range.start, lt: range.end },
    status: "ORDER_CONFIRMED",
    // Never an unpaid online checkout: nobody paid, so nobody should be told it arrived.
    paymentStatus: { in: FULFILLABLE_PAYMENT_STATUSES },
    restaurant: BOARD_RESTAURANT_WHERE,
    ...(scope.campusId !== undefined ? { campusId: scope.campusId } : {}),
    ...(scope.slot !== undefined ? { orderSlot: scope.slot } : {})
  };
}

// ---------------------------------------------------------------------------------
// Views sent to the browser
// ---------------------------------------------------------------------------------

export type BoardCampus = { id: string; code: string; name: string; sortOrder: number };

export type BoardOrder = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  source: string;
  orderSlot: OrderSlot | null;
  totalPaise: number;
  couponCode: string | null;
  createdAt: string;
  restaurant: { id: string; name: string };
  campus: BoardCampus | null;
  items: { id: string; nameSnapshot: string; quantity: number }[];
};

export type TodaySummary = {
  toPrepare: number;
  reached: number;
  delivered: number;
  cancelled: number;
  revenuePaise: number;
  active: number;
};

export type TodayBoardData = {
  generatedAt: string;
  dayLabel: string;
  // IST calendar day, yyyy-mm-dd, for links into the All orders page.
  dayKey: string;
  orders: BoardOrder[];
  openEarlier: BoardOrder[];
  // The strip is capped, so the true number is sent separately.
  openEarlierTotal: number;
  unpaidCheckouts: number;
  dominosOrders: number;
  summary: TodaySummary;
};

// Built field by field so a column added to the database later cannot reach the browser
// by accident.
export function toBoardOrder(row: Omit<BoardOrder, "createdAt"> & { createdAt: Date }): BoardOrder {
  return {
    id: row.id,
    trackingCode: row.trackingCode,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    deliveryType: row.deliveryType,
    hostelBlock: row.hostelBlock,
    status: row.status,
    paymentStatus: row.paymentStatus,
    source: row.source,
    orderSlot: row.orderSlot,
    totalPaise: row.totalPaise,
    couponCode: row.couponCode,
    createdAt: row.createdAt.toISOString(),
    restaurant: { id: row.restaurant.id, name: row.restaurant.name },
    campus: row.campus
      ? { id: row.campus.id, code: row.campus.code, name: row.campus.name, sortOrder: row.campus.sortOrder }
      : null,
    items: row.items.map((item) => ({ id: item.id, nameSnapshot: item.nameSnapshot, quantity: item.quantity }))
  };
}

// ---------------------------------------------------------------------------------
// Order rules
// ---------------------------------------------------------------------------------

// Paid and not cancelled, read straight from the shared REVENUE_ORDER_WHERE so this
// number can never drift from the dashboard's.
export function isRevenueOrder(order: { status: string; paymentStatus: string }) {
  return (
    (REVENUE_ORDER_WHERE.paymentStatus.in as string[]).includes(order.paymentStatus) &&
    order.status !== REVENUE_ORDER_WHERE.status.not
  );
}

// What the bulk button will actually move: confirmed and paid (or pay later). The server
// applies the same rule, so the number on the button is the number that moves.
export function isBulkReachable(order: { status: string; paymentStatus: string }) {
  return order.status === "ORDER_CONFIRMED" && (FULFILLABLE_PAYMENT_STATUSES as string[]).includes(order.paymentStatus);
}

export function summariseBoard(orders: BoardOrder[]): TodaySummary {
  const summary: TodaySummary = { toPrepare: 0, reached: 0, delivered: 0, cancelled: 0, revenuePaise: 0, active: 0 };
  for (const order of orders) {
    if (order.status === "ORDER_CONFIRMED") summary.toPrepare++;
    else if (order.status === "REACHED_CAMPUS") summary.reached++;
    else if (order.status === "DELIVERED") summary.delivered++;
    else if (order.status === "CANCELLED") summary.cancelled++;
    if (isRevenueOrder(order)) summary.revenuePaise += order.totalPaise;
  }
  summary.active = summary.toPrepare + summary.reached;
  return summary;
}

// ---------------------------------------------------------------------------------
// Slots, campuses and grouping
// ---------------------------------------------------------------------------------

export type SlotKey = "AFTERNOON" | "NIGHT" | "NONE";
export const SLOT_KEYS: readonly SlotKey[] = ["AFTERNOON", "NIGHT", "NONE"];

export const NO_CAMPUS_KEY = "none";

export function slotKeyOf(order: { orderSlot: OrderSlot | null }): SlotKey {
  return order.orderSlot ?? "NONE";
}

export function campusKeyOf(order: { campus: { id: string } | null }) {
  return order.campus?.id ?? NO_CAMPUS_KEY;
}

export function campusName(campus?: { name: string } | null) {
  return campus?.name ?? "Unassigned";
}

// VIT-AP and SRM-AP are prepared and handed over by different people, so campus is always
// grouped separately. Follow the order set in admin (sortOrder) rather than a hardcoded
// list, so adding a campus needs no code change. Orders with no campus (placed before
// campuses existed) come last.
function campusSortKey(campus: BoardCampus | null) {
  return campus ? campus.sortOrder : Number.MAX_SAFE_INTEGER;
}

export function groupByCampus<T extends { campus: BoardCampus | null }>(orders: T[]) {
  const map = new Map<string, { campus: BoardCampus | null; orders: T[] }>();
  for (const order of orders) {
    const key = campusKeyOf(order);
    if (!map.has(key)) map.set(key, { campus: order.campus, orders: [] });
    map.get(key)!.orders.push(order);
  }
  return [...map.values()].sort(
    (a, b) => campusSortKey(a.campus) - campusSortKey(b.campus) || campusName(a.campus).localeCompare(campusName(b.campus))
  );
}

export function groupByRestaurantName<T extends { restaurant: { name: string } }>(orders: T[]) {
  const map = new Map<string, T[]>();
  for (const order of orders) {
    const key = order.restaurant.name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(order);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export type PrepLine = { name: string; quantity: number };

// Item totals across orders. Alphabetical by default (the printed sheet); the board sorts
// by quantity so the biggest lines lead.
export function aggregateItems(
  orders: { items: { nameSnapshot: string; quantity: number }[] }[],
  sort: "name" | "quantity" = "name"
): PrepLine[] {
  const totals = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      totals.set(item.nameSnapshot, (totals.get(item.nameSnapshot) ?? 0) + item.quantity);
    }
  }
  const lines = [...totals.entries()].map(([name, quantity]) => ({ name, quantity }));
  return lines.sort((a, b) =>
    sort === "quantity" ? b.quantity - a.quantity || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)
  );
}

// "6× Veg Biryani · 2× Coke"
export function formatPrepLine(lines: PrepLine[], separator = " · ") {
  return lines.map((line) => `${line.quantity}× ${line.name}`).join(separator);
}

export type StatusCounts = { toPrepare: number; reached: number; delivered: number };

function countStatuses(orders: { status: string }[]): StatusCounts {
  return {
    toPrepare: orders.filter((o) => o.status === "ORDER_CONFIRMED").length,
    reached: orders.filter((o) => o.status === "REACHED_CAMPUS").length,
    delivered: orders.filter((o) => o.status === "DELIVERED").length
  };
}

export type RestaurantGroup = {
  key: string;
  name: string;
  // Only what is shown; delivered orders are left out while "Show delivered" is off.
  orders: BoardOrder[];
  hiddenDelivered: number;
  counts: StatusCounts;
  // What the kitchen still has to cook: the confirmed orders, biggest lines first.
  prep: PrepLine[];
};

export type CampusGroup = {
  key: string;
  campus: BoardCampus | null;
  counts: StatusCounts;
  restaurants: RestaurantGroup[];
};

export type SlotGroup = {
  key: SlotKey;
  counts: StatusCounts;
  total: number;
  campuses: CampusGroup[];
};

const STATUS_RANK: Record<string, number> = { ORDER_CONFIRMED: 0, REACHED_CAMPUS: 1, DELIVERED: 2 };

// Still-to-do orders first, oldest first within each, so the top of a list is always the
// next thing to hand over.
function compareForBoard(a: BoardOrder, b: BoardOrder) {
  return (
    (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
    a.id.localeCompare(b.id)
  );
}

// Slot, then campus, then restaurant. Expects the orders to be filtered already. Cancelled
// orders are never grouped: they have their own section.
export function groupBoard(orders: BoardOrder[], showDelivered: boolean): SlotGroup[] {
  const live = orders.filter((order) => order.status !== "CANCELLED");
  const groups: SlotGroup[] = [];

  for (const slot of SLOT_KEYS) {
    const slotOrders = live.filter((order) => slotKeyOf(order) === slot);
    if (slotOrders.length === 0) continue;

    const campuses = groupByCampus(slotOrders).map(({ campus, orders: campusOrders }): CampusGroup => {
      const byRestaurant = new Map<string, BoardOrder[]>();
      for (const order of campusOrders) {
        const list = byRestaurant.get(order.restaurant.id) ?? [];
        list.push(order);
        byRestaurant.set(order.restaurant.id, list);
      }
      const restaurants = [...byRestaurant.entries()]
        .map(([key, restaurantOrders]): RestaurantGroup => {
          const sorted = [...restaurantOrders].sort(compareForBoard);
          const visible = showDelivered ? sorted : sorted.filter((order) => order.status !== "DELIVERED");
          return {
            key,
            name: restaurantOrders[0].restaurant.name,
            orders: visible,
            hiddenDelivered: sorted.length - visible.length,
            counts: countStatuses(sorted),
            prep: aggregateItems(
              sorted.filter((order) => order.status === "ORDER_CONFIRMED"),
              "quantity"
            )
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return { key: campusKeyOf({ campus }), campus, counts: countStatuses(campusOrders), restaurants };
    });

    groups.push({ key: slot, counts: countStatuses(slotOrders), total: slotOrders.length, campuses });
  }
  return groups;
}

// How many orders the bulk button for one slot and campus will move. `campusId` null is
// the unassigned-campus orders, matching the server scope.
export function bulkReachableCount(orders: BoardOrder[], slot: SlotKey, campusId: string | null) {
  return orders.filter(
    (order) => isBulkReachable(order) && slotKeyOf(order) === slot && (order.campus?.id ?? null) === campusId
  ).length;
}

// The scope the API takes for a board slot: no slot is sent as null, never as "NONE".
export function scopeForSlot(slot: SlotKey): OrderSlot | null {
  return slot === "NONE" ? null : slot;
}

// ---------------------------------------------------------------------------------
// Search and filters (all client side)
// ---------------------------------------------------------------------------------

export type BoardFilters = { slot: SlotKey | null; campus: string | null; search: string };

// A typed phone number may carry spaces, dashes or a +91 that the stored 10 digits lack.
function phoneDigits(token: string) {
  if (!/^[\d\s+()-]+$/.test(token)) return "";
  const digits = token.replace(/\D/g, "");
  if (digits.length < 3) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Every word must match something on the order (name, phone, tracking code or an item),
// so "ravi biryani" finds Ravi's biryani order.
export function matchesBoardSearch(order: BoardOrder, search: string) {
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [order.customerName, order.trackingCode, ...order.items.map((item) => item.nameSnapshot)]
    .join("\n")
    .toLowerCase();
  const phone = order.customerPhone.replace(/\D/g, "");
  // A whole number pasted with spaces or a +91 ("+91 98765 43210") would be cut into
  // meaningless words, so try the search as one phone number first.
  const wholeDigits = phoneDigits(search.trim());
  if (wholeDigits !== "" && phone.includes(wholeDigits)) return true;
  return tokens.every((token) => {
    if (haystack.includes(token) || order.customerPhone.toLowerCase().includes(token)) return true;
    const digits = phoneDigits(token);
    return digits !== "" && phone.includes(digits);
  });
}

export function filterBoardOrders(orders: BoardOrder[], filters: BoardFilters) {
  return orders.filter(
    (order) =>
      (filters.slot === null || slotKeyOf(order) === filters.slot) &&
      (filters.campus === null || campusKeyOf(order) === filters.campus) &&
      matchesBoardSearch(order, filters.search)
  );
}

// Campus chips: every campus that has an order today, whatever its status.
export function boardCampusOptions(orders: BoardOrder[]) {
  return groupByCampus(orders).map(({ campus }) => ({ key: campusKeyOf({ campus }), campus }));
}

// ---------------------------------------------------------------------------------
// View state kept in the URL
// ---------------------------------------------------------------------------------

export type BoardView = { slot: SlotKey | null; campus: string | null; showDelivered: boolean; search: string };

export const DEFAULT_BOARD_VIEW: BoardView = { slot: null, campus: null, showDelivered: false, search: "" };

const MAX_SEARCH_LENGTH = 80;
// Campus ids are short slugs or cuids. Anything else cannot match a campus.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type ParamSource = { get(name: string): string | null | undefined };

export function parseBoardView(params: ParamSource): BoardView {
  const slot = params.get("slot");
  const campus = params.get("campus");
  return {
    slot: (SLOT_KEYS as readonly string[]).includes(slot ?? "") ? (slot as SlotKey) : null,
    campus: campus && ID_PATTERN.test(campus) ? campus : null,
    showDelivered: params.get("delivered") === "1",
    search: (params.get("search") ?? "").trim().slice(0, MAX_SEARCH_LENGTH)
  };
}

// Defaults are left out so equal views always share one URL.
export function boardViewToParams(view: BoardView) {
  const params = new URLSearchParams();
  if (view.slot) params.set("slot", view.slot);
  if (view.campus) params.set("campus", view.campus);
  if (view.showDelivered) params.set("delivered", "1");
  const search = view.search.trim().slice(0, MAX_SEARCH_LENGTH);
  if (search) params.set("search", search);
  return params;
}

// ---------------------------------------------------------------------------------
// Contact and labels
// ---------------------------------------------------------------------------------

// tel: and WhatsApp links from a stored phone number (normally the bare 10 digits).
export function phoneLinks(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return { tel: digits ? `tel:${digits}` : null, whatsapp: null };
  const local = digits.slice(-10);
  return { tel: `tel:+91${local}`, whatsapp: `https://wa.me/91${local}` };
}

// The slot cut-off labels are written "1:40 PM" for the customer site; every admin time
// (and formatIstTime) is lowercase, so the board lowercases the meridiem to match.
export function lowerMeridiem(text: string) {
  return text.replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
}

export function boardDeliveryLabel(order: { deliveryType: string; hostelBlock: string | null }) {
  if (order.deliveryType !== "HOSTEL") return "Gate pickup";
  return order.hostelBlock ? `Hostel · ${order.hostelBlock}` : "Hostel";
}
