// Pure (no database, no React) so the same rules parse the URL in the browser, build
// the query on the server and are unit-tested. Every value is checked against an
// allow-list here: nothing from the query string reaches a Prisma enum unchecked.
import type { Prisma } from "@prisma/client";
import { UNPAID_CHECKOUT_WHERE } from "@/lib/order-filters";
import { istDayKey, istDayStartUtc, parseIstDay } from "@/lib/ist-day";

export const STATUS_FILTERS = ["AWAITING_CONFIRMATION", "ORDER_CONFIRMED", "REACHED_CAMPUS", "DELIVERED", "CANCELLED"] as const;
export const DELIVERY_TYPE_FILTERS = ["GATE", "HOSTEL"] as const;
export const SOURCE_FILTERS = ["CUSTOMER_ONLINE", "ADMIN_MANUAL", "CUSTOMER_WHATSAPP"] as const;
export const SLOT_FILTERS = ["AFTERNOON", "NIGHT"] as const;
// real: everything except abandoned online checkouts (the default everywhere).
// unpaid: only those checkouts. everything: no payment rule at all.
export const PAYMENT_FILTERS = ["real", "paid_online", "paid_manually", "pay_later", "unpaid", "everything"] as const;
export const PAGE_SIZE_CHOICES = [25, 50] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type DeliveryTypeFilter = (typeof DELIVERY_TYPE_FILTERS)[number];
export type SourceFilter = (typeof SOURCE_FILTERS)[number];
export type SlotFilter = (typeof SLOT_FILTERS)[number];
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

export type OrderSearch = {
  search: string;
  status: StatusFilter | null;
  deliveryType: DeliveryTypeFilter | null;
  source: SourceFilter | null;
  slot: SlotFilter | null;
  payment: PaymentFilter;
  restaurantId: string | null;
  campusId: string | null;
  sessionId: string | null;
  // IST calendar days, yyyy-mm-dd, both inclusive.
  dateFrom: string | null;
  dateTo: string | null;
};

export const DEFAULT_ORDER_SEARCH: OrderSearch = {
  search: "",
  status: null,
  deliveryType: null,
  source: null,
  slot: null,
  payment: "real",
  restaurantId: null,
  campusId: null,
  sessionId: null,
  dateFrom: null,
  dateTo: null
};

const MAX_SEARCH_LENGTH = 80;
// Restaurant, campus and session ids are cuids or short slugs. Anything else cannot match.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function pick<T extends string>(allowed: readonly T[], value: string | null | undefined): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

// "all" is what the older orders page sent for "no filter".
function pickId(value: string | null | undefined) {
  return value && value !== "all" && ID_PATTERN.test(value) ? value : null;
}

function pickDay(value: string | null | undefined) {
  return value && parseIstDay(value) ? value : null;
}

type ParamSource = { get(name: string): string | null | undefined };

export function parseOrderSearch(params: ParamSource): OrderSearch {
  return {
    search: (params.get("search") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    status: pick(STATUS_FILTERS, params.get("status")),
    deliveryType: pick(DELIVERY_TYPE_FILTERS, params.get("deliveryType")),
    source: pick(SOURCE_FILTERS, params.get("source")),
    slot: pick(SLOT_FILTERS, params.get("slot")),
    payment: pick(PAYMENT_FILTERS, params.get("payment")) ?? "real",
    restaurantId: pickId(params.get("restaurantId")),
    campusId: pickId(params.get("campusId")),
    sessionId: pickId(params.get("sessionId")),
    dateFrom: pickDay(params.get("dateFrom")),
    dateTo: pickDay(params.get("dateTo"))
  };
}

// Next hands pages a plain object rather than URLSearchParams; repeated keys use the first.
export function searchParamsFromRecord(record: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

// The canonical query string: defaults are left out so equal filters always produce the
// same URL, which is also what the page compares to decide whether it must refetch.
export function orderSearchToParams(search: OrderSearch) {
  const params = new URLSearchParams();
  if (search.search) params.set("search", search.search);
  if (search.status) params.set("status", search.status);
  if (search.deliveryType) params.set("deliveryType", search.deliveryType);
  if (search.source) params.set("source", search.source);
  if (search.slot) params.set("slot", search.slot);
  if (search.payment !== "real") params.set("payment", search.payment);
  if (search.restaurantId) params.set("restaurantId", search.restaurantId);
  if (search.campusId) params.set("campusId", search.campusId);
  if (search.sessionId) params.set("sessionId", search.sessionId);
  if (search.dateFrom) params.set("dateFrom", search.dateFrom);
  if (search.dateTo) params.set("dateTo", search.dateTo);
  return params;
}

// A typed phone number may carry spaces, dashes or a +91 that the stored 10 digits lack.
function phoneDigits(term: string) {
  if (!/^[\d\s+()-]+$/.test(term)) return "";
  const digits = term.replace(/\D/g, "");
  if (digits.length < 4) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function buildOrderWhere(search: OrderSearch): Prisma.OrderWhereInput {
  const clauses: Prisma.OrderWhereInput[] = [];

  // Unconfirmed WhatsApp orders stay out unless asked for by status, so they remain on
  // their own queue until an admin accepts them.
  clauses.push(search.status ? { status: search.status } : { status: { not: "AWAITING_CONFIRMATION" } });

  switch (search.payment) {
    case "unpaid":
      clauses.push(UNPAID_CHECKOUT_WHERE);
      break;
    case "paid_online":
      clauses.push({ paymentStatus: "PAID_ONLINE" });
      break;
    case "paid_manually":
      clauses.push({ paymentStatus: "PAID_MANUALLY" });
      break;
    case "pay_later":
      clauses.push({ paymentStatus: "UNPAID" });
      break;
    case "real":
      clauses.push({ NOT: UNPAID_CHECKOUT_WHERE });
      break;
    case "everything":
      break;
  }

  if (search.search) {
    const or: Prisma.OrderWhereInput[] = [
      { customerName: { contains: search.search, mode: "insensitive" } },
      { customerPhone: { contains: search.search, mode: "insensitive" } },
      { trackingCode: { contains: search.search, mode: "insensitive" } },
      { items: { some: { nameSnapshot: { contains: search.search, mode: "insensitive" } } } }
    ];
    const digits = phoneDigits(search.search);
    if (digits && digits !== search.search) or.push({ customerPhone: { contains: digits } });
    clauses.push({ OR: or });
  }

  if (search.deliveryType) clauses.push({ deliveryType: search.deliveryType });
  if (search.source) clauses.push({ source: search.source });
  if (search.slot) clauses.push({ orderSlot: search.slot });
  if (search.restaurantId) clauses.push({ restaurantId: search.restaurantId });
  if (search.campusId) clauses.push({ campusId: search.campusId });
  if (search.sessionId) clauses.push({ sessionId: search.sessionId });

  const from = search.dateFrom ? parseIstDay(search.dateFrom) : undefined;
  const to = search.dateTo ? parseIstDay(search.dateTo) : undefined;
  if (from || to) {
    // Half-open [start of first day, start of the day after the last): no off-by-a-
    // millisecond gap at midnight.
    clauses.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: new Date(to.getTime() + 24 * 60 * 60 * 1000) } : {})
      }
    });
  }

  return { AND: clauses };
}

// Quick date chips. Days are IST calendar days so "Today" agrees with the Today board.
export function istDatePresets(now = new Date()) {
  const today = istDayKey(now);
  return {
    today: { from: today, to: today },
    yesterday: { from: istDayKey(istDayStartUtc(1, now)), to: istDayKey(istDayStartUtc(1, now)) },
    last7: { from: istDayKey(istDayStartUtc(6, now)), to: today },
    month: { from: `${today.slice(0, 8)}01`, to: today }
  };
}

// What the results list needs per order. Deliberately a subset of the admin order view.
export type OrderListRow = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  deliveryType: "GATE" | "HOSTEL";
  hostelBlock: string | null;
  status: StatusFilter;
  paymentStatus: string;
  orderSlot: SlotFilter | null;
  source: string;
  totalPaise: number;
  createdAt: string | Date;
  restaurant: { name: string };
  campus: { id: string; code: string; name: string } | null;
  items: { id: string; nameSnapshot: string; quantity: number }[];
};

export type OrderSummary = {
  orders: number;
  // Paid and not cancelled, the same rule as every other admin screen.
  revenuePaise: number;
  revenueOrders: number;
  averagePaise: number;
  byStatus: Record<StatusFilter, number>;
};

export type OrderSearchResult = {
  orders: OrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  summary?: OrderSummary;
};

export const DEFAULT_PAGE_SIZE = 25;

// Paging lives in the URL beside the filters. Only the listed page sizes are honoured.
export function parsePaging(params: ParamSource) {
  const page = Math.floor(Number(params.get("page")));
  return {
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 100_000) : 1,
    pageSize: Number(params.get("pageSize")) === 50 ? 50 : DEFAULT_PAGE_SIZE
  };
}

// Filters plus paging as one canonical query string (defaults omitted). The page compares
// these to know whether the data it holds is the data the URL asks for.
export function orderListParams(search: OrderSearch, page: number, pageSize: number) {
  const params = orderSearchToParams(search);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
  return params;
}
