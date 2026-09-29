import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RANGE,
  averageOrderPaise,
  barPercent,
  dayLabel,
  fillDays,
  labelCampuses,
  normaliseSlots,
  parseRange,
  periodStarts,
  readPeriods,
  splitRestaurants,
  totalDiscountPaise
} from "../lib/analytics";
import { MAIN_STORE_SQL, REVENUE_SQL, dailySql, periodColumnsSql, topDishesSql, totalsByStoreSql } from "../lib/analytics-sql";

test("the range switch only accepts the listed choices", () => {
  assert.equal(parseRange("7"), 7);
  assert.equal(parseRange("90"), 90);
  assert.equal(parseRange("30"), 30);
  for (const bad of ["", "8", "0", "-7", "7 OR 1=1", "seven", undefined, null]) assert.equal(parseRange(bad), DEFAULT_RANGE);
  assert.equal(parseRange(["7", "90"]), 7);
  assert.equal(parseRange([]), DEFAULT_RANGE);
});

test("periods start at the IST midnight of today, 6 and 29 days back", () => {
  // 09:00 UTC on 29 Sep is 14:30 IST the same day; that IST day began at 18:30 UTC on the 28th.
  const starts = periodStarts(new Date("2026-09-29T09:00:00Z"));
  assert.equal(starts.today.toISOString(), "2026-09-28T18:30:00.000Z");
  assert.equal(starts.last7.toISOString(), "2026-09-22T18:30:00.000Z");
  assert.equal(starts.last30.toISOString(), "2026-08-30T18:30:00.000Z");
});

test("raw row values come back as plain numbers, even BigInt or strings", () => {
  const totals = readPeriods({
    today_revenue: 12345n,
    today_orders: "3",
    today_wheel: 500,
    today_other: null,
    all_revenue: 99999,
    all_orders: 10
  });
  assert.equal(totals.today.revenuePaise, 12345);
  assert.equal(totals.today.orders, 3);
  assert.equal(totals.today.wheelDiscountPaise, 500);
  assert.equal(totals.today.otherDiscountPaise, 0);
  assert.equal(totals.last7.revenuePaise, 0);
  assert.equal(totals.all.orders, 10);
  assert.equal(totalDiscountPaise(totals.today), 500);
  assert.deepEqual(readPeriods(undefined).all, { revenuePaise: 0, orders: 0, wheelDiscountPaise: 0, otherDiscountPaise: 0 });
});

test("average order value rounds and never divides by zero", () => {
  assert.equal(averageOrderPaise(0, 0), 0);
  assert.equal(averageOrderPaise(10000, 3), 3333);
  assert.equal(averageOrderPaise(10001, 2), 5001);
});

test("every day in the range is listed newest first, quiet days as zero", () => {
  const now = new Date("2026-09-29T20:00:00Z"); // 01:30 IST on 30 Sep
  const days = fillDays(
    [
      { day: "2026-09-30", revenuePaise: 5000, orders: 1 },
      { day: "2026-09-28", revenuePaise: 12000, orders: 3 },
      { day: "2026-08-01", revenuePaise: 1, orders: 1 }
    ],
    4,
    now
  );
  assert.deepEqual(days.map((d) => d.key), ["2026-09-30", "2026-09-29", "2026-09-28", "2026-09-27"]);
  assert.deepEqual(
    days.map((d) => [d.revenuePaise, d.orders]),
    [
      [5000, 1],
      [0, 0],
      [12000, 3],
      [0, 0]
    ]
  );
});

test("day labels read as a calendar date whatever the server timezone", () => {
  assert.equal(dayLabel("2026-09-30"), "Wed 30 Sep");
  assert.equal(dayLabel("2026-01-01"), "Thu 1 Jan");
});

test("bars get a sliver when there is anything, and none when there is nothing", () => {
  assert.equal(barPercent(0, 100), 0);
  assert.equal(barPercent(5, 0), 0);
  assert.equal(barPercent(1, 1000), 2);
  assert.equal(barPercent(50, 100), 50);
  assert.equal(barPercent(100, 100), 100);
});

test("slots always list afternoon and night, and no-slot only when it holds orders", () => {
  assert.deepEqual(normaliseSlots([]).map((s) => s.slot), ["AFTERNOON", "NIGHT"]);
  const withNone = normaliseSlots([
    { slot: "NIGHT", revenuePaise: 300, orders: 1 },
    { slot: null, revenuePaise: 100, orders: 1 }
  ]);
  assert.deepEqual(
    withNone.map((s) => [s.slot, s.revenuePaise, s.orders]),
    [
      ["AFTERNOON", 0, 0],
      ["NIGHT", 300, 1],
      ["NONE", 100, 1]
    ]
  );
});

test("WhatsApp shops are kept out of the main restaurant list", () => {
  const split = splitRestaurants([
    { id: "a", name: "Zed", orderMode: "ONLINE_PAYMENT", revenuePaise: 100, orders: 1 },
    { id: "b", name: "Domino's", orderMode: "WHATSAPP", revenuePaise: 900, orders: 4 },
    { id: "c", name: "Alpha", orderMode: "ONLINE_PAYMENT", revenuePaise: 500, orders: 2 }
  ]);
  assert.deepEqual(split.main.map((r) => r.name), ["Alpha", "Zed"]);
  assert.deepEqual(split.whatsapp.map((r) => r.name), ["Domino's"]);
});

test("campuses follow admin order, merge unknown ids into unassigned and skip empty ones", () => {
  const figures = (orders: number) => readPeriods({ all_revenue: orders * 1000, all_orders: orders });
  const list = labelCampuses(
    [
      { campusId: null, totals: figures(1) },
      { campusId: "srm_ap", totals: figures(2) },
      { campusId: "ghost", totals: figures(3) },
      { campusId: "vit_ap", totals: figures(0) }
    ],
    [
      { id: "vit_ap", code: "VIT_AP", name: "VIT-AP", sortOrder: 1 },
      { id: "srm_ap", code: "SRM_AP", name: "SRM-AP", sortOrder: 2 }
    ]
  );
  assert.deepEqual(
    list.map((c) => [c.key, c.totals.all.orders]),
    [
      ["srm_ap", 2],
      ["none", 4]
    ]
  );
});

// ---- SQL ----------------------------------------------------------------------------

test("the revenue SQL is built from the shared rule: paid, not cancelled, not awaiting", () => {
  assert.deepEqual(REVENUE_SQL.values, ["PAID_ONLINE", "PAID_MANUALLY", "CANCELLED", "AWAITING_CONFIRMATION"]);
  assert.match(REVENUE_SQL.text, /"paymentStatus" IN \(\$1::"PaymentStatus",\$2::"PaymentStatus"\)/);
  assert.match(REVENUE_SQL.text, /"status" <> \$3::"OrderStatus"/);
  assert.deepEqual(MAIN_STORE_SQL.values, ["ONLINE_PAYMENT"]);
});

test("values only ever reach SQL as placeholders", () => {
  const starts = periodStarts(new Date("2026-09-29T09:00:00Z"));
  const totals = totalsByStoreSql(starts);
  // 3 dated periods x 4 columns = 12 uses of a start date (the all-time columns have none).
  assert.equal(totals.values.filter((value) => value instanceof Date).length, 12);
  // 4 periods x (revenue, orders, wheel, other) = 16 aliased columns.
  assert.equal(periodColumnsSql(starts).sql.match(/ AS "/g)?.length, 16);
  assert.match(totals.sql, /GROUP BY r\."orderMode"/);

  const dishes = topDishesSql(new Date("2026-09-01T00:00:00Z"), "quantity", 10);
  assert.doesNotMatch(dishes.sql, /2026/);
  assert.ok(dishes.values.includes(10));
});

test("IST day bucketing shifts the UTC column by five and a half hours before taking the date", () => {
  const sql = dailySql(new Date("2026-09-01T00:00:00Z")).sql;
  assert.match(sql, /\(o\."createdAt" \+ interval '5 hours 30 minutes'\)::date/);
  assert.match(sql, /to_char\(/);
});
