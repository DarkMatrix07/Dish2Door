import assert from "node:assert/strict";
import test from "node:test";
import {
  boardCampusHref,
  groupSoldOut,
  soldOutItemsHref,
  summariseNudges,
  summariseToday,
  unpaidCheckoutsHref,
  type DashboardCampus,
  type SoldOutItem,
  type TodayGroupRow
} from "../lib/dashboard";
import { summariseBoard, toBoardOrder, type BoardOrder } from "../lib/today-board";

const VIT: DashboardCampus = { id: "vit_ap", code: "VIT_AP", name: "VIT-AP", active: true, sortOrder: 1 };
const SRM: DashboardCampus = { id: "srm_ap", code: "SRM_AP", name: "SRM-AP", active: true, sortOrder: 2 };
const OLD: DashboardCampus = { id: "old", code: "OLD", name: "Old campus", active: false, sortOrder: 3 };

function row(overrides: Partial<TodayGroupRow>): TodayGroupRow {
  return { campusId: "vit_ap", status: "ORDER_CONFIRMED", paymentStatus: "PAID_ONLINE", count: 1, totalPaise: 10000, ...overrides };
}

test("today is counted per campus and in total, cancelled orders left out", () => {
  const summary = summariseToday(
    [
      row({ status: "ORDER_CONFIRMED", count: 3, totalPaise: 30000 }),
      row({ status: "REACHED_CAMPUS", count: 2, totalPaise: 20000 }),
      row({ status: "DELIVERED", count: 4, totalPaise: 40000 }),
      row({ status: "CANCELLED", count: 5, totalPaise: 50000 }),
      row({ campusId: "srm_ap", status: "ORDER_CONFIRMED", count: 1, totalPaise: 9900 })
    ],
    [VIT, SRM]
  );
  assert.deepEqual(
    summary.campuses.map((c) => [c.key, c.toPrepare, c.reached, c.delivered]),
    [
      ["vit_ap", 3, 2, 4],
      ["srm_ap", 1, 0, 0]
    ]
  );
  assert.equal(summary.totals.toPrepare, 4);
  assert.equal(summary.totals.orders, 10);
  assert.equal(summary.totals.revenuePaise, 99900);
  assert.equal(summary.totals.paidOrders, 10);
  assert.equal(summary.totals.averagePaise, 9990);
});

test("revenue counts only paid orders, so pay-later orders count as orders but not money", () => {
  const summary = summariseToday(
    [row({ count: 2, totalPaise: 20000 }), row({ paymentStatus: "UNPAID", count: 1, totalPaise: 5000 })],
    [VIT]
  );
  assert.equal(summary.totals.orders, 3);
  assert.equal(summary.totals.paidOrders, 2);
  assert.equal(summary.totals.revenuePaise, 20000);
  assert.equal(summary.totals.averagePaise, 10000);
});

test("no paid orders means an average of zero, not NaN", () => {
  const summary = summariseToday([], [VIT]);
  assert.equal(summary.totals.averagePaise, 0);
  assert.equal(summary.totals.orders, 0);
});

test("active campuses always show, retired ones and the unassigned bucket only with orders", () => {
  const quiet = summariseToday([], [VIT, SRM, OLD]);
  assert.deepEqual(quiet.campuses.map((c) => c.key), ["vit_ap", "srm_ap"]);

  const busy = summariseToday(
    [row({ campusId: "old", count: 2 }), row({ campusId: null, count: 1 }), row({ campusId: "ghost", count: 1 })],
    [VIT, SRM, OLD]
  );
  // A campus id nobody knows about lands with the unassigned orders instead of vanishing.
  assert.deepEqual(
    busy.campuses.map((c) => [c.key, c.toPrepare]),
    [
      ["vit_ap", 0],
      ["srm_ap", 0],
      ["old", 2],
      ["none", 2]
    ]
  );
  assert.equal(busy.campuses.at(-1)?.campus, null);
});

test("the dashboard totals equal the Today board's summary for the same orders", () => {
  // The board summarises full orders; the dashboard summarises grouped rows. Same input,
  // same numbers, or the two screens would disagree.
  const base = {
    campus: { id: "vit_ap", code: "VIT_AP", name: "VIT-AP", sortOrder: 1 },
    restaurant: { id: "r1", name: "R" },
    items: []
  };
  const raw: { status: BoardOrder["status"]; paymentStatus: BoardOrder["paymentStatus"]; totalPaise: number }[] = [
    { status: "ORDER_CONFIRMED", paymentStatus: "PAID_ONLINE", totalPaise: 25000 },
    { status: "ORDER_CONFIRMED", paymentStatus: "UNPAID", totalPaise: 12000 },
    { status: "REACHED_CAMPUS", paymentStatus: "PAID_MANUALLY", totalPaise: 18000 },
    { status: "DELIVERED", paymentStatus: "PAID_ONLINE", totalPaise: 31000 },
    { status: "CANCELLED", paymentStatus: "PAID_ONLINE", totalPaise: 99000 }
  ];
  const boardOrders = raw.map((o, i) =>
    toBoardOrder({
      id: `o${i}`,
      trackingCode: `T${i}`,
      customerName: "A",
      customerPhone: "9876543210",
      deliveryType: "GATE",
      hostelBlock: null,
      source: "CUSTOMER_ONLINE",
      orderSlot: "AFTERNOON",
      couponCode: null,
      createdAt: new Date(),
      ...base,
      ...o
    })
  );
  const board = summariseBoard(boardOrders);
  const summary = summariseToday(
    raw.map((o) => ({ campusId: "vit_ap", status: o.status, paymentStatus: o.paymentStatus, count: 1, totalPaise: o.totalPaise })),
    [VIT]
  );
  assert.equal(summary.totals.toPrepare, board.toPrepare);
  assert.equal(summary.totals.reached, board.reached);
  assert.equal(summary.totals.delivered, board.delivered);
  assert.equal(summary.totals.revenuePaise, board.revenuePaise);
  assert.equal(summary.totals.toPrepare + summary.totals.reached, board.active);
});

test("one grouped query separates open earlier orders from unpaid checkouts", () => {
  assert.deepEqual(summariseNudges([]), { openEarlier: 0, unpaidCheckouts: 0 });
  assert.deepEqual(
    summariseNudges([
      { source: "CUSTOMER_ONLINE", paymentStatus: "PAID_ONLINE", count: 3 },
      { source: "ADMIN_MANUAL", paymentStatus: "UNPAID", count: 1 },
      { source: "CUSTOMER_ONLINE", paymentStatus: "PENDING", count: 2 },
      { source: "CUSTOMER_ONLINE", paymentStatus: "FAILED", count: 1 }
    ]),
    { openEarlier: 4, unpaidCheckouts: 3 }
  );
});

function item(id: string, name: string, restaurantId: string, restaurantName: string, sizeLabel: string | null = null): SoldOutItem {
  return { id, name, sizeLabel, restaurant: { id: restaurantId, name: restaurantName } };
}

test("sold-out items are grouped by restaurant and capped with a count of the rest", () => {
  const items = [
    item("1", "Veg Biryani", "r2", "Spice Hub"),
    item("2", "Coke", "r1", "Campus Cafe"),
    item("3", "Paneer Roll", "r1", "Campus Cafe"),
    item("4", "Egg Roll", "r1", "Campus Cafe"),
    item("5", "Chicken Biryani", "r2", "Spice Hub", "Full")
  ];
  const all = groupSoldOut(items, 10);
  assert.equal(all.total, 5);
  assert.equal(all.hidden, 0);
  assert.deepEqual(all.groups.map((g) => g.restaurantName), ["Campus Cafe", "Spice Hub"]);
  assert.deepEqual(all.groups[0].shown, ["Coke", "Egg Roll", "Paneer Roll"]);
  assert.deepEqual(all.groups[1].shown, ["Chicken Biryani (Full)", "Veg Biryani"]);

  const capped = groupSoldOut(items, 4);
  assert.deepEqual(
    capped.groups.map((g) => [g.shown.length, g.hidden, g.total]),
    [
      [3, 0, 3],
      [1, 1, 2]
    ]
  );
  assert.equal(capped.hidden, 1);

  // Past the cap a restaurant still appears, with its count and a link, but no names.
  const tiny = groupSoldOut(items, 3);
  assert.deepEqual(
    tiny.groups.map((g) => [g.shown.length, g.hidden]),
    [
      [3, 0],
      [0, 2]
    ]
  );
  assert.equal(tiny.hidden, 2);
});

test("no sold-out items gives no groups", () => {
  assert.deepEqual(groupSoldOut([]), { groups: [], total: 0, hidden: 0 });
});

test("links point at the exact parameters the other pages read", () => {
  assert.equal(boardCampusHref("vit_ap"), "/admin/orders?campus=vit_ap");
  assert.equal(boardCampusHref("none"), "/admin/orders?campus=none");
  assert.equal(unpaidCheckoutsHref("2026-09-30"), "/admin/orders/all?payment=unpaid&dateFrom=2026-09-30&dateTo=2026-09-30");
  assert.equal(soldOutItemsHref("abc123"), "/admin/menu/items?restaurant=abc123");
});
