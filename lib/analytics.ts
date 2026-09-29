// The pure half of Analytics: ranges, period figures and the day-by-day list. No database
// and no React, so it can be unit tested. The SQL that produces the rows lives in
// analytics-sql.ts and analytics-data.ts; this file only reads what they return.
import { istDayKey, istDayStartUtc } from "@/lib/ist-day";

// ---------------------------------------------------------------------------------
// Range switch (?range=7 | 30 | 90)
// ---------------------------------------------------------------------------------

export const RANGE_CHOICES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_CHOICES)[number];
export const DEFAULT_RANGE: RangeDays = 30;

// Only the listed numbers are accepted, so nothing else from the URL reaches a query.
// Next hands a repeated key over as an array; the first one wins.
export function parseRange(value: string | string[] | undefined | null): RangeDays {
  const first = Array.isArray(value) ? value[0] : value;
  const match = RANGE_CHOICES.find((choice) => String(choice) === first);
  return match ?? DEFAULT_RANGE;
}

// ---------------------------------------------------------------------------------
// Fixed periods
// ---------------------------------------------------------------------------------

export const PERIOD_KEYS = ["today", "last7", "last30", "all"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Today",
  last7: "Last 7 days",
  last30: "Last 30 days",
  all: "All time"
};

// The instant each period begins (IST days). "Last 7 days" includes today.
export function periodStarts(now = new Date()): Record<Exclude<PeriodKey, "all">, Date> {
  return { today: istDayStartUtc(0, now), last7: istDayStartUtc(6, now), last30: istDayStartUtc(29, now) };
}

export type PeriodFigures = {
  revenuePaise: number;
  orders: number;
  // Money taken off by coupons on these same orders, split by where the coupon came from.
  wheelDiscountPaise: number;
  otherDiscountPaise: number;
};

export type PeriodTotals = Record<PeriodKey, PeriodFigures>;

export const EMPTY_FIGURES: PeriodFigures = { revenuePaise: 0, orders: 0, wheelDiscountPaise: 0, otherDiscountPaise: 0 };

export function emptyTotals(): PeriodTotals {
  return { today: { ...EMPTY_FIGURES }, last7: { ...EMPTY_FIGURES }, last30: { ...EMPTY_FIGURES }, all: { ...EMPTY_FIGURES } };
}

// COUNT and SUM come back from Postgres as BigInt or string depending on the cast, so
// every figure is forced to a plain number here.
export function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// The column names analytics-sql.ts gives each period: today_revenue, today_orders, ...
export const PERIOD_COLUMNS = ["revenue", "orders", "wheel", "other"] as const;

export function periodColumn(key: PeriodKey, column: (typeof PERIOD_COLUMNS)[number]) {
  return `${key}_${column}`;
}

export function readPeriods(row: Record<string, unknown> | undefined): PeriodTotals {
  const totals = emptyTotals();
  if (!row) return totals;
  for (const key of PERIOD_KEYS) {
    totals[key] = {
      revenuePaise: num(row[periodColumn(key, "revenue")]),
      orders: num(row[periodColumn(key, "orders")]),
      wheelDiscountPaise: num(row[periodColumn(key, "wheel")]),
      otherDiscountPaise: num(row[periodColumn(key, "other")])
    };
  }
  return totals;
}

export function averageOrderPaise(revenuePaise: number, orders: number) {
  return orders > 0 ? Math.round(revenuePaise / orders) : 0;
}

export function totalDiscountPaise(figures: Pick<PeriodFigures, "wheelDiscountPaise" | "otherDiscountPaise">) {
  return figures.wheelDiscountPaise + figures.otherDiscountPaise;
}

// ---------------------------------------------------------------------------------
// Day by day
// ---------------------------------------------------------------------------------

export type DayRow = { day: string; revenuePaise: number; orders: number };

export type DayFigure = { key: string; label: string; revenuePaise: number; orders: number };

// "Wed 30 Sep" for a yyyy-mm-dd IST day. The key is read as a plain calendar date (UTC),
// so the server's own timezone can never shift it by a day.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Spelled out rather than left to Intl, whose short month for September ("Sept") changes
// between Node versions.
export function dayLabel(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

// Every one of the last `days` IST days, newest first, with the quiet days shown as zero
// so a gap in sales is visible instead of silently missing.
export function fillDays(rows: DayRow[], days: number, now = new Date()): DayFigure[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const figures: DayFigure[] = [];
  for (let ago = 0; ago < days; ago++) {
    const key = istDayKey(istDayStartUtc(ago, now));
    const row = byDay.get(key);
    figures.push({ key, label: dayLabel(key), revenuePaise: row?.revenuePaise ?? 0, orders: row?.orders ?? 0 });
  }
  return figures;
}

// Bar width in whole percent. Anything above zero gets a sliver so a small day is not
// mistaken for an empty one.
export function barPercent(value: number, max: number) {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(100, Math.max(2, Math.round((value / max) * 100)));
}

// ---------------------------------------------------------------------------------
// Breakdown rows
// ---------------------------------------------------------------------------------

export type SlotFigure = { slot: "AFTERNOON" | "NIGHT" | "NONE"; revenuePaise: number; orders: number };

const SLOT_ORDER: SlotFigure["slot"][] = ["AFTERNOON", "NIGHT", "NONE"];

// Afternoon and night always show (even at zero); "no slot" (counter orders, older
// orders) only when there is something in it, so the slots still add up to the total.
export function normaliseSlots(rows: { slot: string | null; revenuePaise: number; orders: number }[]): SlotFigure[] {
  const bySlot = new Map<SlotFigure["slot"], SlotFigure>(SLOT_ORDER.map((slot) => [slot, { slot, revenuePaise: 0, orders: 0 }]));
  for (const row of rows) {
    const key = row.slot === "AFTERNOON" || row.slot === "NIGHT" ? row.slot : "NONE";
    const entry = bySlot.get(key)!;
    entry.revenuePaise += row.revenuePaise;
    entry.orders += row.orders;
  }
  return SLOT_ORDER.map((slot) => bySlot.get(slot)!).filter((entry) => entry.slot !== "NONE" || entry.orders > 0);
}

export type RestaurantFigure = { id: string; name: string; orderMode: string; revenuePaise: number; orders: number };

// Main-store restaurants and WhatsApp shops are never mixed in one list: Domino's has its
// own small section so the headline numbers match the dashboard and the Today board.
export function splitRestaurants(rows: RestaurantFigure[]) {
  const byRevenue = (a: RestaurantFigure, b: RestaurantFigure) => b.revenuePaise - a.revenuePaise || a.name.localeCompare(b.name);
  return {
    main: rows.filter((row) => row.orderMode !== "WHATSAPP").sort(byRevenue),
    whatsapp: rows.filter((row) => row.orderMode === "WHATSAPP").sort(byRevenue)
  };
}

export type CampusFigure = { campusId: string | null; totals: PeriodTotals };

export type CampusLabelled = { key: string; name: string; code: string | null; totals: PeriodTotals };

// Campuses in admin order, then orders with no campus. A campus with no paid orders yet
// is left out: a row of zeros says nothing.
export function labelCampuses(
  rows: CampusFigure[],
  campuses: { id: string; code: string; name: string; sortOrder: number }[]
): CampusLabelled[] {
  const known = new Map(campuses.map((campus) => [campus.id, campus]));
  const merged = new Map<string, CampusLabelled>();
  for (const row of rows) {
    const campus = row.campusId ? known.get(row.campusId) : undefined;
    const key = campus ? campus.id : "none";
    const entry = merged.get(key) ?? {
      key,
      name: campus ? campus.name : "Unassigned",
      code: campus ? campus.code : null,
      totals: emptyTotals()
    };
    for (const period of PERIOD_KEYS) {
      entry.totals[period].revenuePaise += row.totals[period].revenuePaise;
      entry.totals[period].orders += row.totals[period].orders;
      entry.totals[period].wheelDiscountPaise += row.totals[period].wheelDiscountPaise;
      entry.totals[period].otherDiscountPaise += row.totals[period].otherDiscountPaise;
    }
    merged.set(key, entry);
  }
  const rank = (entry: CampusLabelled) => known.get(entry.key)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return [...merged.values()]
    .filter((entry) => entry.totals.all.orders > 0)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
