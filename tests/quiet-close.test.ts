import assert from "node:assert/strict";
import test from "node:test";
import { istTodayRange } from "../lib/ist-day";
import { availableOrderActions } from "../lib/order-views";
import { quietCloseDecision, quietCloseDeliveredAt, quietCloseTimes } from "../lib/quiet-close";
import { REVIEW_REMINDER_OFFSETS_MS } from "../lib/review-schedule";
import { lowerMeridiem } from "../lib/today-board";

// IST is UTC+5:30. 2026-09-27 10:00 IST is 04:30 UTC.
const ist = (day: string, time: string) => new Date(`${day}T${time}:00+05:30`);

test("a quiet close is recorded two hours after the order was placed", () => {
  const placed = ist("2026-09-27", "10:00");
  assert.equal(quietCloseDeliveredAt(placed).toISOString(), ist("2026-09-27", "12:00").toISOString());
});

test("an evening order is capped at the end of its own IST day, never the next day", () => {
  const placed = ist("2026-09-27", "23:30");
  const deliveredAt = quietCloseDeliveredAt(placed);
  assert.equal(deliveredAt.toISOString(), "2026-09-27T18:29:59.999Z");
  // Still the 27th in IST, one millisecond before midnight.
  assert.equal(deliveredAt.getTime(), ist("2026-09-28", "00:00").getTime() - 1);
  assert.ok(deliveredAt.getTime() >= placed.getTime());
});

test("an order placed at 21:59 gets its full two hours only when they fit in the day", () => {
  assert.equal(quietCloseDeliveredAt(ist("2026-09-27", "21:59")).getTime(), ist("2026-09-27", "23:59").getTime());
  assert.equal(quietCloseDeliveredAt(ist("2026-09-27", "22:00")).getTime(), ist("2026-09-28", "00:00").getTime() - 1);
});

test("the day is the IST day, not the UTC day", () => {
  // 00:30 IST on the 28th is 19:00 UTC on the 27th: the order still belongs to the 28th.
  const placed = ist("2026-09-28", "00:30");
  assert.equal(quietCloseDeliveredAt(placed).toISOString(), ist("2026-09-28", "02:30").toISOString());
});

test("a reached-campus time is kept unless it would sit after the delivery", () => {
  const createdAt = ist("2026-09-27", "10:00");
  const closed = ist("2026-09-27", "12:00");

  assert.equal(quietCloseTimes({ createdAt, reachedCampusAt: null }).reachedCampusAt.getTime(), closed.getTime());
  assert.equal(quietCloseTimes({ createdAt, reachedCampusAt: null }).deliveredAt.getTime(), closed.getTime());

  const early = ist("2026-09-27", "11:00");
  assert.equal(quietCloseTimes({ createdAt, reachedCampusAt: early }).reachedCampusAt.getTime(), early.getTime());

  // A late "reached" click days afterwards must not end up after "delivered".
  const late = ist("2026-09-30", "09:00");
  assert.equal(quietCloseTimes({ createdAt, reachedCampusAt: late }).reachedCampusAt.getTime(), closed.getTime());
});

test("releasedAt keeps an existing value, otherwise takes the delivery time", () => {
  const createdAt = ist("2026-09-27", "10:00");
  const released = ist("2026-09-27", "11:15");
  assert.equal(quietCloseTimes({ createdAt, reachedCampusAt: null, releasedAt: released }).releasedAt.getTime(), released.getTime());
  assert.equal(quietCloseTimes({ createdAt, reachedCampusAt: null, releasedAt: null }).releasedAt.getTime(), ist("2026-09-27", "12:00").getTime());
});

const todayStart = istTodayRange(new Date("2026-09-29T09:00:00Z")).start;

test("an open paid order from an earlier day may be closed quietly", () => {
  for (const status of ["ORDER_CONFIRMED", "REACHED_CAMPUS"]) {
    for (const paymentStatus of ["PAID_ONLINE", "PAID_MANUALLY", "UNPAID"]) {
      const decision = quietCloseDecision({ createdAt: ist("2026-09-28", "23:59"), status, paymentStatus }, todayStart);
      assert.deepEqual(decision, { ok: true }, `${status} ${paymentStatus}`);
    }
  }
});

test("today's orders are refused, since they get the normal messaging buttons", () => {
  // Midnight IST today is today: the boundary belongs to today, not to "earlier".
  for (const createdAt of [todayStart, ist("2026-09-29", "10:00")]) {
    const decision = quietCloseDecision({ createdAt, status: "ORDER_CONFIRMED", paymentStatus: "PAID_ONLINE" }, todayStart);
    assert.equal(decision.ok, false);
  }
  const lastMoment = new Date(todayStart.getTime() - 1);
  assert.equal(quietCloseDecision({ createdAt: lastMoment, status: "ORDER_CONFIRMED", paymentStatus: "PAID_ONLINE" }, todayStart).ok, true);
});

test("orders that are not open are refused", () => {
  for (const status of ["DELIVERED", "CANCELLED", "AWAITING_CONFIRMATION"]) {
    const decision = quietCloseDecision({ createdAt: ist("2026-09-20", "10:00"), status, paymentStatus: "PAID_ONLINE" }, todayStart);
    assert.equal(decision.ok, false, status);
  }
});

test("unpaid checkouts and refunded orders are refused", () => {
  for (const paymentStatus of ["PENDING", "FAILED", "REFUNDED"]) {
    const decision = quietCloseDecision({ createdAt: ist("2026-09-20", "10:00"), status: "ORDER_CONFIRMED", paymentStatus }, todayStart);
    assert.equal(decision.ok, false, paymentStatus);
  }
});

test("the buttons offer a quiet close for open paid orders only", () => {
  assert.equal(availableOrderActions({ status: "ORDER_CONFIRMED", paymentStatus: "PAID_ONLINE", source: "CUSTOMER_ONLINE" }).closeQuietly, true);
  assert.equal(availableOrderActions({ status: "REACHED_CAMPUS", paymentStatus: "UNPAID", source: "ADMIN_MANUAL" }).closeQuietly, true);
  assert.equal(availableOrderActions({ status: "ORDER_CONFIRMED", paymentStatus: "PENDING", source: "CUSTOMER_ONLINE" }).closeQuietly, false);
  assert.equal(availableOrderActions({ status: "DELIVERED", paymentStatus: "PAID_ONLINE", source: "CUSTOMER_ONLINE" }).closeQuietly, false);
  assert.equal(availableOrderActions({ status: "CANCELLED", paymentStatus: "PAID_ONLINE", source: "CUSTOMER_ONLINE" }).closeQuietly, false);
});

test("three skipped log rows use up the whole review-reminder quota", () => {
  // closeEarlierOrderAsDelivered writes one SKIPPED row per reminder offset; the reminder
  // job stops at that many rows of any status.
  assert.equal(REVIEW_REMINDER_OFFSETS_MS.length, 3);
});

test("slot cut-off wording is lowercased to match every other admin time", () => {
  assert.equal(lowerMeridiem("Deliver by 1:40 PM"), "Deliver by 1:40 pm");
  assert.equal(lowerMeridiem("6:00 AM"), "6:00 am");
  assert.equal(lowerMeridiem("SAMPLE PMS"), "SAMPLE PMS");
});
