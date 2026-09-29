import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, csvRow } from "../lib/csv";
import { formatAgo, formatElapsed, parseIstDay } from "../lib/ist-day";
import { orderStatusLabel, paymentLabel, statusLabel } from "../lib/order-labels";
import { availableOrderActions } from "../lib/order-views";
import {
  buildOrderWhere,
  istDatePresets,
  orderListParams,
  orderSearchToParams,
  parseOrderSearch,
  parsePaging
} from "../lib/order-search";

const parse = (query: string) => parseOrderSearch(new URLSearchParams(query));

test("unknown or hostile filter values fall back to no filter", () => {
  const search = parse("status=DROP_TABLE&source=x&slot=noon&payment=nope&restaurantId=a%20b;--&campusId=all&dateFrom=2026-02-31&dateTo=yesterday");
  assert.equal(search.status, null);
  assert.equal(search.source, null);
  assert.equal(search.slot, null);
  assert.equal(search.payment, "real");
  assert.equal(search.restaurantId, null);
  assert.equal(search.campusId, null);
  assert.equal(search.dateFrom, null);
  assert.equal(search.dateTo, null);
});

test("valid filters survive a round trip through the canonical query string", () => {
  const query = "search=biryani&status=DELIVERED&slot=NIGHT&payment=pay_later&campusId=vit_ap&dateFrom=2026-09-01&dateTo=2026-09-29";
  const search = parse(query);
  assert.equal(orderSearchToParams(search).toString(), new URLSearchParams(query).toString());
  assert.deepEqual(parse(orderSearchToParams(search).toString()), search);
});

test("defaults are omitted so equal filters share one URL", () => {
  assert.equal(orderListParams(parse(""), 1, 25).toString(), "");
  assert.equal(orderListParams(parse(""), 3, 50).toString(), "page=3&pageSize=50");
});

test("paging only accepts real pages and the listed sizes", () => {
  assert.deepEqual(parsePaging(new URLSearchParams("page=abc&pageSize=9999")), { page: 1, pageSize: 25 });
  assert.deepEqual(parsePaging(new URLSearchParams("page=-4&pageSize=50")), { page: 1, pageSize: 50 });
  assert.deepEqual(parsePaging(new URLSearchParams("page=7")), { page: 7, pageSize: 25 });
});

test("the default view hides unconfirmed WhatsApp orders and unpaid online checkouts", () => {
  const where = JSON.stringify(buildOrderWhere(parse("")));
  assert.match(where, /"status":\{"not":"AWAITING_CONFIRMATION"\}/);
  assert.match(where, /"NOT":\{"source":"CUSTOMER_ONLINE"/);
});

test("the unpaid filter shows only online checkouts that were never paid", () => {
  const where = JSON.stringify(buildOrderWhere(parse("payment=unpaid")));
  assert.match(where, /"source":"CUSTOMER_ONLINE","paymentStatus":\{"in":\["PENDING","FAILED"\]\}/);
  assert.doesNotMatch(where, /"NOT"/);
});

test("date ranges are IST days, half-open at the end", () => {
  const where = buildOrderWhere(parse("dateFrom=2026-09-29&dateTo=2026-09-29")) as { AND: { createdAt?: { gte: Date; lt: Date } }[] };
  const range = where.AND.find((clause) => clause.createdAt)?.createdAt;
  // 29 Sep 00:00 IST is 28 Sep 18:30 UTC.
  assert.equal(range?.gte.toISOString(), "2026-09-28T18:30:00.000Z");
  assert.equal(range?.lt.toISOString(), "2026-09-29T18:30:00.000Z");
});

test("a typed phone number also matches the stored ten digits", () => {
  const where = JSON.stringify(buildOrderWhere(parse("search=%2B91%2098765%2043210")));
  assert.match(where, /"customerPhone":\{"contains":"9876543210"\}/);
});

test("IST day parsing rejects days that do not exist", () => {
  assert.equal(parseIstDay("2026-02-31"), undefined);
  assert.equal(parseIstDay("2026-13-01"), undefined);
  assert.equal(parseIstDay("29-09-2026"), undefined);
  assert.equal(parseIstDay("2026-09-29")?.toISOString(), "2026-09-28T18:30:00.000Z");
});

test("date presets follow the IST calendar, not the server's", () => {
  // 1 Oct 2026, 01:00 IST is still 30 Sep in UTC.
  const presets = istDatePresets(new Date("2026-09-30T19:30:00Z"));
  assert.deepEqual(presets.today, { from: "2026-10-01", to: "2026-10-01" });
  assert.deepEqual(presets.yesterday, { from: "2026-09-30", to: "2026-09-30" });
  assert.deepEqual(presets.last7, { from: "2026-09-25", to: "2026-10-01" });
  assert.deepEqual(presets.month, { from: "2026-10-01", to: "2026-10-01" });
});

test("CSV cells are quoted and neutralise spreadsheet formulas", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
  for (const lead of ["=", "+", "-", "@"]) assert.equal(csvCell(`${lead}1+1`), `'${lead}1+1`);
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell(null), "");
  assert.equal(csvRow(["a", 1, undefined, "b,c"]), 'a,1,,"b,c"');
});

test("labels read the same everywhere", () => {
  assert.equal(statusLabel("REACHED_CAMPUS"), "Reached campus");
  assert.equal(paymentLabel({ paymentStatus: "PENDING", source: "CUSTOMER_ONLINE" }), "Unpaid checkout");
  assert.equal(paymentLabel({ paymentStatus: "UNPAID", source: "CUSTOMER_WHATSAPP" }), "Pay later");
  assert.equal(paymentLabel({ paymentStatus: "PAID_MANUALLY", source: "ADMIN_MANUAL" }), "Paid manually");
  // An abandoned checkout must not read as a confirmed order.
  assert.equal(orderStatusLabel({ status: "ORDER_CONFIRMED", paymentStatus: "PENDING", source: "CUSTOMER_ONLINE" }), "Awaiting payment");
  assert.equal(orderStatusLabel({ status: "ORDER_CONFIRMED", paymentStatus: "UNPAID", source: "CUSTOMER_WHATSAPP" }), "Confirmed");
});

test("elapsed time is compact", () => {
  assert.equal(formatElapsed(20_000), "under a minute");
  assert.equal(formatElapsed(45 * 60_000), "45m");
  assert.equal(formatElapsed(130 * 60_000), "2h 10m");
  assert.equal(formatElapsed(27 * 3_600_000), "1d 3h");
});

test("an unpaid online checkout can only be cancelled, never moved along", () => {
  const unpaid = { paymentStatus: "PENDING", source: "CUSTOMER_ONLINE" };
  assert.deepEqual(availableOrderActions({ ...unpaid, status: "ORDER_CONFIRMED" }), { unpaidCheckout: true, reached: false, delivered: false, closeQuietly: false, cancel: true });
  assert.deepEqual(availableOrderActions({ ...unpaid, paymentStatus: "FAILED", status: "REACHED_CAMPUS" }), { unpaidCheckout: true, reached: false, delivered: false, closeQuietly: false, cancel: true });
});

test("real orders get the next step and cancel; finished ones get nothing", () => {
  const paid = { paymentStatus: "PAID_ONLINE", source: "CUSTOMER_ONLINE" };
  assert.deepEqual(availableOrderActions({ ...paid, status: "ORDER_CONFIRMED" }), { unpaidCheckout: false, reached: true, delivered: false, closeQuietly: true, cancel: true });
  assert.deepEqual(availableOrderActions({ ...paid, status: "REACHED_CAMPUS" }), { unpaidCheckout: false, reached: false, delivered: true, closeQuietly: true, cancel: true });
  // Pay-later WhatsApp orders are real orders even though nothing has been paid yet.
  assert.equal(availableOrderActions({ paymentStatus: "UNPAID", source: "CUSTOMER_WHATSAPP", status: "ORDER_CONFIRMED" }).reached, true);
  for (const status of ["DELIVERED", "CANCELLED", "AWAITING_CONFIRMATION"]) {
    assert.deepEqual(availableOrderActions({ ...paid, status }), { unpaidCheckout: false, reached: false, delivered: false, closeQuietly: false, cancel: false });
  }
});

test("ago is measured from now and stays coarse for old orders", () => {
  assert.equal(formatAgo(10_000), "just now");
  assert.equal(formatAgo(42 * 60_000), "42m ago");
  assert.equal(formatAgo(185 * 60_000), "3h 5m ago");
  assert.equal(formatAgo((3 * 24 + 5) * 3_600_000), "3d ago");
});
