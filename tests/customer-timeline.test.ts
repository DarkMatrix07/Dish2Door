import assert from "node:assert/strict";
import test from "node:test";
import {
  TIMELINE_MAX,
  TIMELINE_PAGE,
  buildCustomerTimeline,
  loyaltyProgress,
  nextTimelineLimit,
  parseTimelineFilter,
  parseTimelineLimit,
  timelineHref,
  timelineSources,
  type OrderRow,
  type PrizeRow,
  type ReviewRow,
  type SpinRow
} from "../lib/customer-timeline";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 2, 6, 0) + minutes * 60_000);

const order = (id: string, minutes: number, extra: Partial<OrderRow> = {}): OrderRow => ({
  id,
  createdAt: at(minutes),
  trackingCode: `T${id}`,
  status: "DELIVERED",
  paymentStatus: "PAID_ONLINE",
  source: "CUSTOMER_ONLINE",
  totalPaise: 25000,
  couponCode: null,
  couponDiscountPaise: 0,
  restaurant: { name: "Biryani House" },
  items: [{ nameSnapshot: "Veg Biryani", quantity: 2 }],
  ...extra
});
const review = (id: string, minutes: number): ReviewRow => ({
  id,
  createdAt: at(minutes),
  foodRating: 5,
  deliveryRating: 4,
  review: "Tasty",
  order: { trackingCode: "T1", restaurant: { name: "Biryani House" } }
});
const prize = (id: string, minutes: number, extra: Partial<PrizeRow> = {}): PrizeRow => ({
  id,
  createdAt: at(minutes),
  discountPercent: 10,
  couponCode: "WHEELABC234",
  redeemedAt: null,
  issuedNote: null,
  issuedById: null,
  issuedBy: null,
  order: null,
  coupon: null,
  ...extra
});
const spin = (id: string, minutes: number, outcome = "SPUN"): SpinRow => ({ id, createdAt: at(minutes), spinDay: "2026-10-02", outcome, mode: "REGULARS" });

test("mixes every source newest first", () => {
  const { events, hasMore } = buildCustomerTimeline(
    { orders: [order("1", 0), order("2", 30)], reviews: [review("r", 20)], prizes: [prize("p", 10)], spins: [spin("s", 5, "FORFEITED")] },
    60
  );
  assert.deepEqual(events.map((event) => event.kind), ["order", "review", "prize", "spin", "order"]);
  assert.equal(hasMore, false);
});

test("orders summarise their items and carry badges data", () => {
  const { events } = buildCustomerTimeline({ orders: [order("1", 0, { couponCode: "WHEELX", couponDiscountPaise: 2500 })], reviews: [], prizes: [], spins: [] }, 60);
  const first = events[0];
  assert.equal(first.kind, "order");
  if (first.kind === "order") {
    assert.equal(first.order.items, "2× Veg Biryani");
    assert.equal(first.order.couponCode, "WHEELX");
    assert.equal(first.order.paymentStatus, "PAID_ONLINE");
  }
});

test("a gift shows who gave it and its note; a won prize does not", () => {
  const { events } = buildCustomerTimeline(
    {
      orders: [],
      reviews: [],
      prizes: [
        prize("gift", 10, { issuedById: "a1", issuedBy: { name: "Divyesh" }, issuedNote: "Sorry for the late order", coupon: { expiresAt: at(900), heldCount: 1 } }),
        prize("won", 5, { redeemedAt: at(8), order: { trackingCode: "TX", couponDiscountPaise: 3000 } })
      ],
      spins: []
    },
    60
  );
  const [gift, won] = events;
  assert.ok(gift.kind === "prize" && won.kind === "prize");
  if (gift.kind === "prize" && won.kind === "prize") {
    assert.equal(gift.prize.gift, true);
    assert.equal(gift.prize.givenBy, "Divyesh");
    assert.equal(gift.prize.note, "Sorry for the late order");
    assert.equal(gift.prize.used, false);
    assert.equal(gift.prize.held, true);
    assert.equal(gift.prize.expiresAt?.getTime(), at(900).getTime());
    assert.equal(won.prize.gift, false);
    assert.equal(won.prize.givenBy, null);
    assert.equal(won.prize.used, true);
    assert.deepEqual(won.prize.usedOn, { trackingCode: "TX", discountPaise: 3000 });
  }
});

test("a spin and the prize it produced share a moment, with the prize listed first", () => {
  const { events } = buildCustomerTimeline({ orders: [], reviews: [], prizes: [prize("p", 10)], spins: [spin("s", 10)] }, 60);
  assert.deepEqual(events.map((event) => event.kind), ["prize", "spin"]);
});

test("the limit trims the list and reports that more exist", () => {
  const orders = Array.from({ length: 5 }, (_, index) => order(String(index), index));
  const { events, hasMore } = buildCustomerTimeline({ orders, reviews: [], prizes: [], spins: [] }, 4);
  assert.equal(events.length, 4);
  assert.equal(hasMore, true);
  const exact = buildCustomerTimeline({ orders: orders.slice(0, 4), reviews: [], prizes: [], spins: [] }, 4);
  assert.equal(exact.events.length, 4);
  assert.equal(exact.hasMore, false);
});

test("limit parameter is validated and clamped", () => {
  assert.equal(parseTimelineLimit(undefined), TIMELINE_PAGE);
  assert.equal(parseTimelineLimit(""), TIMELINE_PAGE);
  assert.equal(parseTimelineLimit("abc"), TIMELINE_PAGE);
  assert.equal(parseTimelineLimit("-5"), TIMELINE_PAGE);
  assert.equal(parseTimelineLimit("12.5"), TIMELINE_PAGE);
  assert.equal(parseTimelineLimit("1e9"), TIMELINE_PAGE);
  assert.equal(parseTimelineLimit("5"), TIMELINE_PAGE);
  assert.equal(parseTimelineLimit("120"), 120);
  assert.equal(parseTimelineLimit("99999"), TIMELINE_PAGE);
  assert.equal(parseTimelineLimit("9999"), TIMELINE_MAX);
  assert.equal(nextTimelineLimit(60), 120);
  assert.equal(nextTimelineLimit(TIMELINE_MAX), TIMELINE_MAX);
});

test("filters pick which sources to load", () => {
  assert.equal(parseTimelineFilter("reviews"), "reviews");
  assert.equal(parseTimelineFilter("nonsense"), "all");
  assert.equal(parseTimelineFilter(undefined), "all");
  assert.deepEqual(timelineSources("all"), { orders: true, reviews: true, prizes: true });
  assert.deepEqual(timelineSources("orders"), { orders: true, reviews: false, prizes: false });
  assert.deepEqual(timelineSources("reviews"), { orders: false, reviews: true, prizes: false });
  assert.deepEqual(timelineSources("prizes"), { orders: false, reviews: false, prizes: true });
});

test("links keep the filter and only add a limit when it was raised", () => {
  assert.equal(timelineHref("9876543210", "all", 0), "/admin/customers/9876543210#timeline");
  assert.equal(timelineHref("9876543210", "orders", 0), "/admin/customers/9876543210?show=orders#timeline");
  assert.equal(timelineHref("9876543210", "prizes", 120), "/admin/customers/9876543210?show=prizes&limit=120#timeline");
});

test("loyalty progress counts reviewed orders since the baseline", () => {
  assert.deepEqual(loyaltyProgress(5, 3, 3), { done: 2, perReward: 3, ready: false, remaining: 1 });
  assert.deepEqual(loyaltyProgress(6, 3, 3), { done: 3, perReward: 3, ready: true, remaining: 0 });
  assert.deepEqual(loyaltyProgress(8, 3, 3), { done: 3, perReward: 3, ready: true, remaining: 0 });
  assert.deepEqual(loyaltyProgress(1, 3, 3), { done: 0, perReward: 3, ready: false, remaining: 3 });
});
