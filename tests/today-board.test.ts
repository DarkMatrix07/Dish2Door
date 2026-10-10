import assert from "node:assert/strict";
import test from "node:test";
import { istTodayRange } from "../lib/ist-day";
import { REAL_ORDER_WHERE } from "../lib/order-filters";
import { buildPrepSheet, prepSheetCount, prepSheetOrders } from "../lib/prep-sheet";
import {
  aggregateItems,
  boardCampusOptions,
  boardDeliveryLabel,
  boardViewToParams,
  bulkReachableCount,
  dominosTodayWhere,
  filterBoardOrders,
  formatPrepLine,
  groupBoard,
  isBulkReachable,
  isRevenueOrder,
  matchesBoardSearch,
  openEarlierWhere,
  parseBoardView,
  phoneLinks,
  reachedCampusWhere,
  scopeForSlot,
  summariseBoard,
  todayBoardWhere,
  toBoardOrder,
  unpaidCheckoutsTodayWhere,
  type BoardOrder
} from "../lib/today-board";

const VIT = { id: "vit_ap", code: "VIT_AP", name: "VIT-AP", sortOrder: 1 };
const SRM = { id: "srm_ap", code: "SRM_AP", name: "SRM-AP", sortOrder: 2 };
const BIRYANI = { id: "r1", name: "Biryani House" };
const CAFE = { id: "r2", name: "Campus Cafe" };

let counter = 0;
function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  counter += 1;
  return {
    id: `o${counter}`,
    trackingCode: `TRK${String(counter).padStart(4, "0")}`,
    customerName: "Ravi Kumar",
    customerPhone: "9876543210",
    deliveryType: "GATE",
    hostelBlock: null,
    status: "ORDER_CONFIRMED",
    paymentStatus: "PAID_ONLINE",
    source: "CUSTOMER_ONLINE",
    orderSlot: "AFTERNOON",
    totalPaise: 20000,
    couponCode: null,
    // Spread across the day so oldest-first ordering is testable.
    createdAt: new Date(Date.UTC(2026, 8, 29, 4, counter)).toISOString(),
    restaurant: BIRYANI,
    campus: VIT,
    items: [{ id: `i${counter}`, nameSnapshot: "Veg Biryani", quantity: 1 }],
    ...overrides
  };
}

const range = istTodayRange(new Date("2026-09-29T09:00:00Z"));

test("the reached-campus scope only ever touches today's confirmed, paid, non-WhatsApp orders", () => {
  const where = reachedCampusWhere({}, range) as Record<string, unknown>;
  assert.deepEqual(where.createdAt, { gte: range.start, lt: range.end });
  assert.equal(where.status, "ORDER_CONFIRMED");
  // UNPAID (pay later) is real; PENDING and FAILED (abandoned online checkouts) are not.
  assert.deepEqual(where.paymentStatus, { in: ["PAID_ONLINE", "PAID_MANUALLY", "UNPAID"] });
  assert.deepEqual(where.restaurant, { orderMode: "ONLINE_PAYMENT" });
});

test("a scope key that is left out is not filtered on, while null means unassigned", () => {
  const all = reachedCampusWhere({}, range);
  assert.equal("campusId" in all, false);
  assert.equal("orderSlot" in all, false);

  const slotOnly = reachedCampusWhere({ slot: "NIGHT" }, range);
  assert.equal("campusId" in slotOnly, false);
  assert.equal((slotOnly as Record<string, unknown>).orderSlot, "NIGHT");

  const unassigned = reachedCampusWhere({ campusId: null, slot: null }, range) as Record<string, unknown>;
  assert.equal(unassigned.campusId, null);
  assert.equal(unassigned.orderSlot, null);
  assert.ok("campusId" in unassigned && "orderSlot" in unassigned);

  const exact = reachedCampusWhere({ campusId: "vit_ap", slot: "AFTERNOON" }, range) as Record<string, unknown>;
  assert.equal(exact.campusId, "vit_ap");
  assert.equal(exact.orderSlot, "AFTERNOON");
});

test("the day is bounded to IST, half open, so midnight belongs to exactly one day", () => {
  assert.equal(range.start.toISOString(), "2026-09-28T18:30:00.000Z");
  assert.equal(range.end.getTime() - range.start.getTime(), 24 * 60 * 60 * 1000);
  assert.deepEqual((todayBoardWhere(range) as { AND: unknown[] }).AND[1], {
    createdAt: { gte: range.start, lt: range.end },
    restaurant: { orderMode: "ONLINE_PAYMENT" }
  });
});

test("the board and the strip both start from the shared real-order rule and skip WhatsApp shops", () => {
  const today = todayBoardWhere(range) as { AND: unknown[] };
  assert.equal(today.AND[0], REAL_ORDER_WHERE);

  const earlier = openEarlierWhere(range.start) as { AND: Record<string, unknown>[] };
  assert.equal(earlier.AND[0], REAL_ORDER_WHERE);
  assert.deepEqual(earlier.AND[1], {
    status: { in: ["ORDER_CONFIRMED", "REACHED_CAMPUS"] },
    createdAt: { lt: range.start },
    restaurant: { orderMode: "ONLINE_PAYMENT" }
  });
});

test("unpaid checkouts and Domino's are counted for their links, never shown as orders", () => {
  const unpaid = unpaidCheckoutsTodayWhere(range) as { AND: Record<string, unknown>[] };
  assert.deepEqual(unpaid.AND[0], { source: "CUSTOMER_ONLINE", paymentStatus: { in: ["PENDING", "FAILED"] } });

  const dominos = dominosTodayWhere(range) as Record<string, unknown>;
  assert.deepEqual(dominos.restaurant, { orderMode: "WHATSAPP" });
  assert.deepEqual(dominos.status, { notIn: ["CANCELLED", "AWAITING_CONFIRMATION"] });
});

test("only confirmed paid orders count as bulk-reachable", () => {
  assert.equal(isBulkReachable(order()), true);
  assert.equal(isBulkReachable(order({ paymentStatus: "UNPAID", source: "ADMIN_MANUAL" })), true);
  assert.equal(isBulkReachable(order({ status: "REACHED_CAMPUS" })), false);
  assert.equal(isBulkReachable(order({ status: "DELIVERED" })), false);
  assert.equal(isBulkReachable(order({ status: "CANCELLED" })), false);
  assert.equal(isBulkReachable(order({ paymentStatus: "PENDING" })), false);
  assert.equal(isBulkReachable(order({ paymentStatus: "REFUNDED" })), false);
});

test("the bulk count matches the server scope for a slot and campus", () => {
  const orders = [
    order(),
    order(),
    order({ campus: SRM }),
    order({ campus: null }),
    order({ orderSlot: "NIGHT" }),
    order({ orderSlot: null }),
    order({ status: "DELIVERED" }),
    order({ paymentStatus: "REFUNDED" })
  ];
  assert.equal(bulkReachableCount(orders, "AFTERNOON", "vit_ap"), 2);
  assert.equal(bulkReachableCount(orders, "AFTERNOON", "srm_ap"), 1);
  assert.equal(bulkReachableCount(orders, "AFTERNOON", null), 1);
  assert.equal(bulkReachableCount(orders, "NIGHT", "vit_ap"), 1);
  assert.equal(bulkReachableCount(orders, "NONE", "vit_ap"), 1);
  assert.equal(scopeForSlot("NONE"), null);
  assert.equal(scopeForSlot("NIGHT"), "NIGHT");
});

test("groups are slot, then campus, then restaurant, in a stable order", () => {
  const orders = [
    order({ orderSlot: "NIGHT", campus: SRM }),
    order({ orderSlot: "AFTERNOON", campus: SRM, restaurant: CAFE }),
    order({ orderSlot: "AFTERNOON", campus: VIT, restaurant: CAFE }),
    order({ orderSlot: "AFTERNOON", campus: VIT, restaurant: BIRYANI }),
    order({ orderSlot: "AFTERNOON", campus: null }),
    order({ orderSlot: null, campus: VIT })
  ];
  const groups = groupBoard(orders, true);
  assert.deepEqual(groups.map((g) => g.key), ["AFTERNOON", "NIGHT", "NONE"]);
  const afternoon = groups[0];
  // sortOrder puts VIT before SRM; orders with no campus come last.
  assert.deepEqual(afternoon.campuses.map((c) => c.key), ["vit_ap", "srm_ap", "none"]);
  assert.deepEqual(afternoon.campuses[0].restaurants.map((r) => r.name), ["Biryani House", "Campus Cafe"]);
  assert.equal(afternoon.total, 4);
});

test("cancelled orders never appear in the groups", () => {
  const groups = groupBoard([order(), order({ status: "CANCELLED" })], true);
  assert.equal(groups[0].total, 1);
  assert.equal(groups[0].campuses[0].restaurants[0].orders.length, 1);
});

test("hiding delivered orders collapses them into a count and keeps the group", () => {
  const orders = [order({ status: "DELIVERED" }), order({ status: "DELIVERED" }), order({ status: "REACHED_CAMPUS" })];
  const hidden = groupBoard(orders, false)[0].campuses[0].restaurants[0];
  assert.equal(hidden.orders.length, 1);
  assert.equal(hidden.hiddenDelivered, 2);
  assert.deepEqual(hidden.counts, { toPrepare: 0, reached: 1, delivered: 2 });

  const shown = groupBoard(orders, true)[0].campuses[0].restaurants[0];
  assert.equal(shown.orders.length, 3);
  assert.equal(shown.hiddenDelivered, 0);

  // A restaurant whose orders are all delivered still gets its heading and count.
  const allDone = groupBoard([order({ status: "DELIVERED" })], false)[0].campuses[0];
  assert.equal(allDone.restaurants[0].orders.length, 0);
  assert.equal(allDone.restaurants[0].hiddenDelivered, 1);
  assert.equal(allDone.counts.delivered, 1);
});

test("rows go still-to-do first, oldest first", () => {
  const a = order({ status: "DELIVERED" });
  const b = order({ status: "ORDER_CONFIRMED" });
  const c = order({ status: "REACHED_CAMPUS" });
  const d = order({ status: "ORDER_CONFIRMED" });
  const ids = groupBoard([a, b, c, d], true)[0].campuses[0].restaurants[0].orders.map((o) => o.id);
  assert.deepEqual(ids, [b.id, d.id, c.id, a.id]);
});

test("the prep line totals the confirmed orders only, biggest first", () => {
  const orders = [
    order({ items: [{ id: "a", nameSnapshot: "Veg Biryani", quantity: 4 }, { id: "b", nameSnapshot: "Coke", quantity: 1 }] }),
    order({ items: [{ id: "c", nameSnapshot: "Veg Biryani", quantity: 2 }, { id: "d", nameSnapshot: "Coke", quantity: 1 }] }),
    order({ status: "REACHED_CAMPUS", items: [{ id: "e", nameSnapshot: "Veg Biryani", quantity: 9 }] })
  ];
  const prep = groupBoard(orders, true)[0].campuses[0].restaurants[0].prep;
  assert.equal(formatPrepLine(prep), "6× Veg Biryani · 2× Coke");
});

test("aggregateItems sorts by name unless asked for quantity", () => {
  const orders = [{ items: [{ nameSnapshot: "Coke", quantity: 5 }, { nameSnapshot: "Aloo Paratha", quantity: 1 }] }];
  assert.deepEqual(aggregateItems(orders).map((l) => l.name), ["Aloo Paratha", "Coke"]);
  assert.deepEqual(aggregateItems(orders, "quantity").map((l) => l.name), ["Coke", "Aloo Paratha"]);
  assert.equal(formatPrepLine(aggregateItems(orders), ", "), "1× Aloo Paratha, 5× Coke");
});

test("the summary counts each status and only paid, uncancelled orders as revenue", () => {
  const orders = [
    order({ totalPaise: 10000 }),
    order({ status: "REACHED_CAMPUS", totalPaise: 20000 }),
    order({ status: "DELIVERED", paymentStatus: "PAID_MANUALLY", totalPaise: 30000 }),
    order({ status: "DELIVERED", paymentStatus: "UNPAID", totalPaise: 40000 }),
    order({ status: "CANCELLED", totalPaise: 50000 })
  ];
  const summary = summariseBoard(orders);
  assert.deepEqual(summary, {
    toPrepare: 1,
    reached: 1,
    delivered: 2,
    cancelled: 1,
    // Pay-later and the cancelled (paid) order are not revenue.
    revenuePaise: 60000,
    active: 2
  });
  assert.equal(isRevenueOrder({ status: "ORDER_CONFIRMED", paymentStatus: "REFUNDED" }), false);
});

test("search matches name, phone, code and item, every word at once", () => {
  const o = order({
    customerName: "Ravi Kumar",
    customerPhone: "9876543210",
    trackingCode: "ABC1234",
    items: [{ id: "x", nameSnapshot: "Chicken Biryani", quantity: 2 }]
  });
  for (const term of ["ravi", "KUMAR", "98765", "+91 98765 43210", "abc12", "biryani", "ravi biryani", "  "]) {
    assert.equal(matchesBoardSearch(o, term), true, term);
  }
  for (const term of ["sita", "12345", "pizza", "ravi pizza"]) {
    assert.equal(matchesBoardSearch(o, term), false, term);
  }
});

test("filters combine slot, campus and search", () => {
  const orders = [
    order({ orderSlot: "NIGHT", campus: SRM, customerName: "Sita" }),
    order({ orderSlot: "NIGHT", campus: VIT, customerName: "Ravi" }),
    order({ orderSlot: "AFTERNOON", campus: VIT, customerName: "Ravi" }),
    order({ orderSlot: null, campus: null, customerName: "Ravi" })
  ];
  const count = (filters: Parameters<typeof filterBoardOrders>[1]) => filterBoardOrders(orders, filters).length;
  assert.equal(count({ slot: null, campus: null, search: "" }), 4);
  assert.equal(count({ slot: "NIGHT", campus: null, search: "" }), 2);
  assert.equal(count({ slot: "NIGHT", campus: "vit_ap", search: "" }), 1);
  assert.equal(count({ slot: null, campus: null, search: "ravi" }), 3);
  assert.equal(count({ slot: "NONE", campus: "none", search: "" }), 1);
  assert.deepEqual(boardCampusOptions(orders).map((o) => o.key), ["vit_ap", "srm_ap", "none"]);
});

test("view state parses from an allow-list and round-trips through the URL", () => {
  const hostile = parseBoardView(new URLSearchParams("slot=noon&campus=a%20b;--&delivered=yes&search=%20%20"));
  // Delivered orders show unless explicitly hidden, so junk values leave them visible.
  assert.deepEqual(hostile, { slot: null, campus: null, showDelivered: true, search: "" });

  const query = "slot=NIGHT&campus=vit_ap&delivered=0&search=ravi";
  const view = parseBoardView(new URLSearchParams(query));
  assert.deepEqual(view, { slot: "NIGHT", campus: "vit_ap", showDelivered: false, search: "ravi" });
  assert.equal(boardViewToParams(view).toString(), query);
  // Old bookmarks with delivered=1 still mean "shown", which is now simply the default.
  assert.equal(parseBoardView(new URLSearchParams("delivered=1")).showDelivered, true);
  assert.equal(boardViewToParams(parseBoardView(new URLSearchParams(""))).toString(), "");
  assert.equal(parseBoardView(new URLSearchParams("slot=NONE&campus=none")).slot, "NONE");
});

test("phone links use the 10 digits, with and without a country code", () => {
  assert.deepEqual(phoneLinks("9876543210"), { tel: "tel:+919876543210", whatsapp: "https://wa.me/919876543210" });
  assert.deepEqual(phoneLinks("+91 98765-43210"), { tel: "tel:+919876543210", whatsapp: "https://wa.me/919876543210" });
  assert.deepEqual(phoneLinks("12345"), { tel: "tel:12345", whatsapp: null });
  assert.deepEqual(phoneLinks(""), { tel: null, whatsapp: null });
});

test("delivery wording names the hostel block, otherwise gate pickup", () => {
  assert.equal(boardDeliveryLabel({ deliveryType: "HOSTEL", hostelBlock: "B4" }), "Hostel · B4");
  assert.equal(boardDeliveryLabel({ deliveryType: "HOSTEL", hostelBlock: null }), "Hostel");
  assert.equal(boardDeliveryLabel({ deliveryType: "GATE", hostelBlock: null }), "Gate pickup");
});

test("the browser view is built field by field and drops anything else on the row", () => {
  const row = { ...order(), createdAt: new Date("2026-09-29T05:00:00Z"), customerEmail: "a@b.c", trackingPasscodeHash: "secret" };
  const view = toBoardOrder(row);
  assert.equal(view.createdAt, "2026-09-29T05:00:00.000Z");
  assert.equal(JSON.stringify(view).includes("secret"), false);
  assert.equal("customerEmail" in view, false);
});

test("the prep sheet holds today's paid, uncancelled orders for the slot, delivered ones included", () => {
  const orders = [
    order({ status: "DELIVERED" }),
    order({ status: "CANCELLED" }),
    order({ paymentStatus: "REFUNDED" }),
    order({ orderSlot: "NIGHT" }),
    order({ orderSlot: null }),
    order({ paymentStatus: "UNPAID", source: "ADMIN_MANUAL" })
  ];
  assert.equal(prepSheetOrders(orders).length, 4);
  assert.equal(prepSheetCount(orders, "AFTERNOON"), 2);
  assert.equal(prepSheetCount(orders, "NIGHT"), 1);
});

test("the prep sheet prints one page per campus with escaped names, totals and the old wording", () => {
  const orders = [
    order({
      customerName: "Ravi <b>K</b>",
      deliveryType: "HOSTEL",
      hostelBlock: "B4",
      totalPaise: 12500,
      items: [{ id: "a", nameSnapshot: "Veg Biryani", quantity: 2 }, { id: "b", nameSnapshot: "Coke", quantity: 1 }]
    }),
    order({ campus: SRM, items: [{ id: "c", nameSnapshot: "Veg Biryani", quantity: 1 }] }),
    order({ orderSlot: "NIGHT" })
  ];
  const now = new Date(2026, 8, 29, 14, 5);
  const sheet = buildPrepSheet({ orders, slot: "AFTERNOON", dateLabel: "Tuesday, 29 September 2026", now });
  assert.equal(sheet.count, 2);
  assert.equal(sheet.title, "2026-09-29 Afternoon orders 14-05");
  const { html } = sheet;
  assert.match(html, /<h1>Dish2Door — Deliver by Afternoon<\/h1>/);
  assert.match(html, /Tuesday, 29 September 2026 · 2 orders/);
  assert.match(html, /<h1 class="campus-heading">VIT-AP <span class="muted">\(1 order\)<\/span><\/h1>/);
  assert.match(html, /<section class="campus page-break">/);
  // Alphabetical, as the sheet always was (the board itself sorts by quantity).
  assert.match(html, /Campus total to prepare:<\/strong> 1× Coke, 2× Veg Biryani/);
  assert.match(html, /<strong>To prepare:<\/strong> 1× Coke, 2× Veg Biryani/);
  assert.match(html, /Ravi &lt;b&gt;K&lt;\/b&gt;/);
  assert.equal(html.includes("<b>K</b>"), false);
  assert.match(html, /<td>Hostel B4<\/td>/);
  assert.match(html, /<td>Gate<\/td>/);
  assert.match(html, /<td class="right">₹125<\/td>/);
  // The first campus does not start on a new page; later ones do.
  assert.equal((html.match(/page-break">/g) ?? []).length, 1);
});

test("an empty slot still prints a sheet that says so", () => {
  const sheet = buildPrepSheet({ orders: [order({ orderSlot: "NIGHT" })], slot: "AFTERNOON", dateLabel: "Today", now: new Date(2026, 0, 2, 3, 4) });
  assert.equal(sheet.count, 0);
  assert.match(sheet.html, /<p>No orders in this slot\.<\/p>/);
  assert.match(sheet.html, /Today · 0 orders/);
});
