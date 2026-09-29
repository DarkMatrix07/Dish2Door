// The SQL behind Analytics. Kept apart from the loader (which needs a database connection)
// so the fragments can be unit tested. Every value goes in through a Prisma.sql
// placeholder; the only Prisma.raw text is column aliases built from the fixed lists in
// analytics.ts, never from anything a user sent.
import { Prisma } from "@prisma/client";
import { PERIOD_KEYS, periodColumn, type PeriodKey } from "@/lib/analytics";
import { PAID_PAYMENT_STATUSES, REAL_ORDER_WHERE, REVENUE_ORDER_WHERE } from "@/lib/order-filters";
import { BOARD_RESTAURANT_WHERE } from "@/lib/today-board";

// Wheel prizes are issued as one-time coupons whose code starts with this (see
// app/api/customer/spin/route.ts). Every other code was made by hand under Offers.
export const WHEEL_CODE_PREFIX = "WHEEL";

// Order timestamps are stored as UTC, and India is a fixed +05:30 with no daylight saving,
// so an IST calendar day is the UTC time plus this. Same offset as lib/ist-day.ts.
const IST_SHIFT = Prisma.sql`interval '5 hours 30 minutes'`;

// Paid and not cancelled, built from the same constants as REVENUE_ORDER_WHERE so the SQL
// cannot drift from the Prisma rule the dashboard and Today board use. It also leaves out
// orders still waiting on WhatsApp acceptance, as the board does (REAL_ORDER_WHERE).
// Expects the Order table aliased as `o`.
export const REVENUE_SQL = Prisma.sql`o."paymentStatus" IN (${Prisma.join(
  PAID_PAYMENT_STATUSES.map((status) => Prisma.sql`${status}::"PaymentStatus"`)
)}) AND o."status" <> ${REVENUE_ORDER_WHERE.status.not}::"OrderStatus" AND o."status" <> ${REAL_ORDER_WHERE.status.not}::"OrderStatus"`;

// Expects the Restaurant table aliased as `r`.
export const MAIN_STORE_SQL = Prisma.sql`r."orderMode" = ${BOARD_RESTAURANT_WHERE.orderMode}::"RestaurantOrderMode"`;

export const ORDER_JOIN_SQL = Prisma.sql`FROM "Order" o JOIN "Restaurant" r ON r."id" = o."restaurantId"`;

export function sinceSql(start: Date) {
  return Prisma.sql`o."createdAt" >= ${start}::timestamp`;
}

// Revenue, order count and coupon discounts for every fixed period, as one row of columns
// (today_revenue, today_orders, today_wheel, today_other, last7_revenue, ...). The
// sums are cast to float8 (paise stay far below 2^53, so they are exact) and the counts to
// int, so nothing arrives as a BigInt.
export function periodColumnsSql(starts: Record<Exclude<PeriodKey, "all">, Date>) {
  const columns = PERIOD_KEYS.flatMap((key) => {
    const within = key === "all" ? Prisma.sql`TRUE` : sinceSql(starts[key]);
    const alias = (column: "revenue" | "orders" | "wheel" | "other") => Prisma.raw(`"${periodColumn(key, column)}"`);
    return [
      Prisma.sql`COALESCE(SUM(o."totalPaise") FILTER (WHERE ${within}), 0)::float8 AS ${alias("revenue")}`,
      Prisma.sql`(COUNT(*) FILTER (WHERE ${within}))::int AS ${alias("orders")}`,
      Prisma.sql`COALESCE(SUM(o."couponDiscountPaise") FILTER (WHERE ${within} AND o."couponCode" LIKE ${`${WHEEL_CODE_PREFIX}%`}), 0)::float8 AS ${alias("wheel")}`,
      Prisma.sql`COALESCE(SUM(o."couponDiscountPaise") FILTER (WHERE ${within} AND (o."couponCode" IS NULL OR o."couponCode" NOT LIKE ${`${WHEEL_CODE_PREFIX}%`})), 0)::float8 AS ${alias("other")}`
    ];
  });
  return Prisma.join(columns, ", ");
}

// Fixed periods for the main store and Domino's, one row each.
export function totalsByStoreSql(starts: Record<Exclude<PeriodKey, "all">, Date>) {
  return Prisma.sql`
    SELECT r."orderMode"::text AS "orderMode", ${periodColumnsSql(starts)}
    ${ORDER_JOIN_SQL}
    WHERE ${REVENUE_SQL}
    GROUP BY r."orderMode"`;
}

// Fixed periods per campus, main store only.
export function totalsByCampusSql(starts: Record<Exclude<PeriodKey, "all">, Date>) {
  return Prisma.sql`
    SELECT o."campusId" AS "campusId", ${periodColumnsSql(starts)}
    ${ORDER_JOIN_SQL}
    WHERE ${REVENUE_SQL} AND ${MAIN_STORE_SQL}
    GROUP BY o."campusId"`;
}

// One row per IST day that had a paid order, main store, from `start` on.
export function dailySql(start: Date) {
  return Prisma.sql`
    SELECT to_char((o."createdAt" + ${IST_SHIFT})::date, 'YYYY-MM-DD') AS "day",
           COALESCE(SUM(o."totalPaise"), 0)::float8 AS "revenuePaise",
           COUNT(*)::int AS "orders"
    ${ORDER_JOIN_SQL}
    WHERE ${REVENUE_SQL} AND ${MAIN_STORE_SQL} AND ${sinceSql(start)}
    GROUP BY 1
    ORDER BY 1`;
}

// Per restaurant, both kinds of shop (the page splits them), from `start` on.
export function byRestaurantSql(start: Date) {
  return Prisma.sql`
    SELECT r."id" AS "id", r."name" AS "name", r."orderMode"::text AS "orderMode",
           COALESCE(SUM(o."totalPaise"), 0)::float8 AS "revenuePaise",
           COUNT(*)::int AS "orders"
    ${ORDER_JOIN_SQL}
    WHERE ${REVENUE_SQL} AND ${sinceSql(start)}
    GROUP BY r."id", r."name", r."orderMode"`;
}

// Per delivery slot, main store, from `start` on. Orders with no slot come back as null.
export function bySlotSql(start: Date) {
  return Prisma.sql`
    SELECT o."orderSlot"::text AS "slot",
           COALESCE(SUM(o."totalPaise"), 0)::float8 AS "revenuePaise",
           COUNT(*)::int AS "orders"
    ${ORDER_JOIN_SQL}
    WHERE ${REVENUE_SQL} AND ${MAIN_STORE_SQL} AND ${sinceSql(start)}
    GROUP BY o."orderSlot"`;
}

export type DishSort = "quantity" | "revenue";

// Top dishes from the order lines, main store, from `start` on. Grouped by the name the
// customer saw when ordering, so a dish renamed or deleted later still counts.
export function topDishesSql(start: Date, sort: DishSort, limit: number) {
  const order =
    sort === "quantity"
      ? Prisma.sql`"quantity" DESC, "revenuePaise" DESC, "name"`
      : Prisma.sql`"revenuePaise" DESC, "quantity" DESC, "name"`;
  return Prisma.sql`
    SELECT oi."nameSnapshot" AS "name",
           COALESCE(SUM(oi."quantity"), 0)::int AS "quantity",
           COALESCE(SUM(oi."linePaise"), 0)::float8 AS "revenuePaise"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "Restaurant" r ON r."id" = o."restaurantId"
    WHERE ${REVENUE_SQL} AND ${MAIN_STORE_SQL} AND ${sinceSql(start)}
    GROUP BY oi."nameSnapshot"
    ORDER BY ${order}
    LIMIT ${limit}`;
}
