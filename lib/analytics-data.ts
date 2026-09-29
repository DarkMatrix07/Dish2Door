import { prisma } from "@/lib/db";
import {
  labelCampuses,
  fillDays,
  normaliseSlots,
  num,
  periodStarts,
  readPeriods,
  splitRestaurants,
  type RangeDays
} from "@/lib/analytics";
import {
  byRestaurantSql,
  bySlotSql,
  dailySql,
  topDishesSql,
  totalsByCampusSql,
  totalsByStoreSql
} from "@/lib/analytics-sql";
import { istDayStartUtc } from "@/lib/ist-day";

export const TOP_DISHES_LIMIT = 10;

type RawRow = Record<string, unknown>;
type DishRow = { name: string; quantity: number; revenuePaise: number };

function dishes(rows: RawRow[]): DishRow[] {
  return rows.map((row) => ({ name: String(row.name), quantity: num(row.quantity), revenuePaise: num(row.revenuePaise) }));
}

// Everything is worked out in the database: a handful of grouped queries in parallel, so
// the page never loads a month of orders into memory. Main-store figures and Domino's
// come from the same rule (paid, not cancelled), and the main store is the same set of
// orders the dashboard and the Today board use.
export async function loadAnalytics(range: RangeDays, now = new Date()) {
  const starts = periodStarts(now);
  const rangeStart = istDayStartUtc(range - 1, now);

  const [storeRows, campusRows, campuses, dayRows, restaurantRows, slotRows, topByQuantity, topByRevenue] = await Promise.all([
    prisma.$queryRaw<RawRow[]>(totalsByStoreSql(starts)),
    prisma.$queryRaw<RawRow[]>(totalsByCampusSql(starts)),
    prisma.campus.findMany({ select: { id: true, code: true, name: true, sortOrder: true } }),
    prisma.$queryRaw<RawRow[]>(dailySql(rangeStart)),
    prisma.$queryRaw<RawRow[]>(byRestaurantSql(rangeStart)),
    prisma.$queryRaw<RawRow[]>(bySlotSql(rangeStart)),
    prisma.$queryRaw<RawRow[]>(topDishesSql(rangeStart, "quantity", TOP_DISHES_LIMIT)),
    prisma.$queryRaw<RawRow[]>(topDishesSql(rangeStart, "revenue", TOP_DISHES_LIMIT))
  ]);

  const storeRow = (mode: string) => storeRows.find((row) => row.orderMode === mode);
  const restaurants = splitRestaurants(
    restaurantRows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      orderMode: String(row.orderMode),
      revenuePaise: num(row.revenuePaise),
      orders: num(row.orders)
    }))
  );

  return {
    range,
    // The headline numbers: the main store only, matching the dashboard and Today board.
    main: readPeriods(storeRow("ONLINE_PAYMENT")),
    // Domino's runs on WhatsApp and is reported on its own.
    dominos: readPeriods(storeRow("WHATSAPP")),
    campuses: labelCampuses(
      campusRows.map((row) => ({ campusId: row.campusId === null ? null : String(row.campusId), totals: readPeriods(row) })),
      campuses
    ),
    days: fillDays(
      dayRows.map((row) => ({ day: String(row.day), revenuePaise: num(row.revenuePaise), orders: num(row.orders) })),
      range,
      now
    ),
    restaurants,
    slots: normaliseSlots(
      slotRows.map((row) => ({
        slot: row.slot === null ? null : String(row.slot),
        revenuePaise: num(row.revenuePaise),
        orders: num(row.orders)
      }))
    ),
    topByQuantity: dishes(topByQuantity),
    topByRevenue: dishes(topByRevenue)
  };
}
