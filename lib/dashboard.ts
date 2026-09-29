// The rules behind the Dashboard, kept pure (no database, no React) so they can be unit
// tested. The page feeds them a few grouped query results and they turn those into what
// is shown. Every rule about which orders count and what revenue is comes from
// today-board.ts, the same file the Today board reads, so the two screens cannot disagree.
import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { isUnpaidCheckout } from "@/lib/order-filters";
import { NO_CAMPUS_KEY, isRevenueOrder } from "@/lib/today-board";

// ---------------------------------------------------------------------------------
// Today, per campus
// ---------------------------------------------------------------------------------

// One row of the grouped query over today's board orders: the count and money for every
// campus, status and payment status that occurs.
export type TodayGroupRow = {
  campusId: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  count: number;
  totalPaise: number;
};

export type DashboardCampus = { id: string; code: string; name: string; active: boolean; sortOrder: number };

export type CampusToday = {
  // The campus id, or NO_CAMPUS_KEY for orders placed before campuses existed. This is
  // also what the board expects in its ?campus= parameter.
  key: string;
  campus: { code: string; name: string } | null;
  toPrepare: number;
  reached: number;
  delivered: number;
};

export type TodayTotals = {
  toPrepare: number;
  reached: number;
  delivered: number;
  // Everything the board lists as live today: cancelled orders are not orders.
  orders: number;
  revenuePaise: number;
  paidOrders: number;
  // Revenue over paid orders; 0 when there are none.
  averagePaise: number;
};

export type TodaySummary = { campuses: CampusToday[]; totals: TodayTotals };

// Active campuses always get a row (a quiet campus showing zeros is information); a
// retired campus or the "no campus" bucket only appears if it has orders today.
export function summariseToday(rows: TodayGroupRow[], campuses: DashboardCampus[]): TodaySummary {
  const byKey = new Map<string, CampusToday>();
  const rowFor = (key: string, campus: CampusToday["campus"]) => {
    let entry = byKey.get(key);
    if (!entry) {
      entry = { key, campus, toPrepare: 0, reached: 0, delivered: 0 };
      byKey.set(key, entry);
    }
    return entry;
  };

  const sorted = [...campuses].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const campus of sorted) {
    if (campus.active) rowFor(campus.id, { code: campus.code, name: campus.name });
  }

  const totals: TodayTotals = { toPrepare: 0, reached: 0, delivered: 0, orders: 0, revenuePaise: 0, paidOrders: 0, averagePaise: 0 };
  const known = new Map(sorted.map((campus) => [campus.id, campus]));

  for (const row of rows) {
    if (row.status === "CANCELLED") continue;
    const campus = row.campusId ? known.get(row.campusId) : undefined;
    // A campus id we have no record of is treated like "no campus" rather than dropped.
    const key = campus ? campus.id : NO_CAMPUS_KEY;
    const entry = rowFor(key, campus ? { code: campus.code, name: campus.name } : null);

    if (row.status === "ORDER_CONFIRMED") {
      entry.toPrepare += row.count;
      totals.toPrepare += row.count;
    } else if (row.status === "REACHED_CAMPUS") {
      entry.reached += row.count;
      totals.reached += row.count;
    } else if (row.status === "DELIVERED") {
      entry.delivered += row.count;
      totals.delivered += row.count;
    }
    totals.orders += row.count;
    if (isRevenueOrder(row)) {
      totals.revenuePaise += row.totalPaise;
      totals.paidOrders += row.count;
    }
  }
  totals.averagePaise = totals.paidOrders > 0 ? Math.round(totals.revenuePaise / totals.paidOrders) : 0;

  // Campuses in admin order, then the unassigned bucket last.
  const order = [...sorted.map((campus) => campus.id), NO_CAMPUS_KEY];
  const list = order.flatMap((key) => {
    const entry = byKey.get(key);
    if (!entry) return [];
    const inUse = entry.toPrepare + entry.reached + entry.delivered > 0;
    const isActiveCampus = known.get(key)?.active === true;
    return isActiveCampus || inUse ? [entry] : [];
  });
  return { campuses: list, totals };
}

// ---------------------------------------------------------------------------------
// Things that need attention
// ---------------------------------------------------------------------------------

// The two "look at this" counts share one grouped query (open orders from earlier days OR
// unpaid checkouts from today). The two sets never overlap, because an open order is a
// real order and an unpaid checkout is by definition not, so the payment fields alone say
// which is which.
export type NudgeRow = { source: string; paymentStatus: string; count: number };

export function summariseNudges(rows: NudgeRow[]) {
  let openEarlier = 0;
  let unpaidCheckouts = 0;
  for (const row of rows) {
    if (isUnpaidCheckout(row)) unpaidCheckouts += row.count;
    else openEarlier += row.count;
  }
  return { openEarlier, unpaidCheckouts };
}

// ---------------------------------------------------------------------------------
// Sold-out items
// ---------------------------------------------------------------------------------

export type SoldOutItem = {
  id: string;
  name: string;
  sizeLabel: string | null;
  restaurant: { id: string; name: string };
};

export type SoldOutGroup = {
  restaurantId: string;
  restaurantName: string;
  // How many are sold out in this restaurant, whatever is shown.
  total: number;
  shown: string[];
  hidden: number;
};

export const SOLD_OUT_SHOWN_LIMIT = 12;

function soldOutLabel(item: SoldOutItem) {
  return item.sizeLabel ? `${item.name} (${item.sizeLabel})` : item.name;
}

// Grouped by restaurant, with at most `limit` names shown across the whole list so a
// long run of sold-out dishes cannot take over the page. Restaurants are always all
// listed (each links to its own items), only the names are cut; restaurants that would
// get no names still show their count.
export function groupSoldOut(items: SoldOutItem[], limit = SOLD_OUT_SHOWN_LIMIT) {
  const byRestaurant = new Map<string, { name: string; labels: string[] }>();
  for (const item of items) {
    const entry = byRestaurant.get(item.restaurant.id) ?? { name: item.restaurant.name, labels: [] };
    entry.labels.push(soldOutLabel(item));
    byRestaurant.set(item.restaurant.id, entry);
  }

  let room = Math.max(0, limit);
  const groups = [...byRestaurant.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([restaurantId, entry]): SoldOutGroup => {
      const labels = [...entry.labels].sort((a, b) => a.localeCompare(b));
      const shown = labels.slice(0, room);
      room -= shown.length;
      return {
        restaurantId,
        restaurantName: entry.name,
        total: labels.length,
        shown,
        hidden: labels.length - shown.length
      };
    });
  return { groups, total: items.length, hidden: groups.reduce((sum, group) => sum + group.hidden, 0) };
}

// ---------------------------------------------------------------------------------
// Links into other admin pages
// ---------------------------------------------------------------------------------

// The board reads ?campus=<campus id>, or "none" for orders with no campus.
export function boardCampusHref(campusKey: string) {
  return `/admin/orders?campus=${encodeURIComponent(campusKey)}`;
}

// All orders, showing only today's abandoned checkouts.
export function unpaidCheckoutsHref(dayKey: string) {
  return `/admin/orders/all?payment=unpaid&dateFrom=${dayKey}&dateTo=${dayKey}`;
}

export function soldOutItemsHref(restaurantId: string) {
  return `/admin/menu/items?restaurant=${encodeURIComponent(restaurantId)}`;
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
