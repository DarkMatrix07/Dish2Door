import assert from "node:assert/strict";
import test from "node:test";
import { calculateGst, calculateTotals, GST_RATE_BPS } from "../lib/money";

const fees = {
  platformFeePaise: 600,
  hostelDeliveryFeePaise: 1_500,
  paymentChargePercentBps: 300,
  paymentChargeFixedPaise: 0
};

test("GST is 5% of the food value, rounded up to the paisa", () => {
  assert.equal(GST_RATE_BPS, 500);
  assert.equal(calculateGst(20_000, GST_RATE_BPS), 1_000); // ₹200 → ₹10
  assert.equal(calculateGst(15_400, GST_RATE_BPS), 770); // ₹154 → ₹7.70
  // ₹45.90 → ₹2.295, which must not become a fraction of a paisa.
  assert.equal(calculateGst(4_590, GST_RATE_BPS), 230);
  assert.equal(calculateGst(0, GST_RATE_BPS), 0);
});

test("a GST order adds tax on food only, never on the fees", () => {
  const totals = calculateTotals(20_000, "GATE", fees, false, 0, GST_RATE_BPS);

  assert.equal(totals.taxPaise, 1_000);
  // ₹200 items + ₹10 GST + ₹6 platform. The ₹6 fee is outside the taxable base.
  assert.equal(totals.totalPaise, 21_600);
});

test("GST applies to the discounted food value, not the list price", () => {
  const totals = calculateTotals(20_000, "GATE", fees, false, 5_000, GST_RATE_BPS);

  assert.equal(totals.taxPaise, 750); // 5% of ₹150, not ₹200
  assert.equal(totals.totalPaise, 15_000 + 750 + 600);
});

test("hostel delivery is not taxed", () => {
  const gate = calculateTotals(20_000, "GATE", fees, false, 0, GST_RATE_BPS);
  const hostel = calculateTotals(20_000, "HOSTEL", fees, false, 0, GST_RATE_BPS);

  assert.equal(gate.taxPaise, hostel.taxPaise);
  assert.equal(hostel.totalPaise, gate.totalPaise + fees.hostelDeliveryFeePaise);
});

test("callers that pass no rate are completely unchanged", () => {
  // The main site must keep billing exactly as it did before GST existed.
  const totals = calculateTotals(20_000, "GATE", fees, true);

  assert.equal(totals.taxPaise, 0);
  assert.equal(totals.paymentFeePaise, Math.ceil((20_600 * 300) / 10_000));
  assert.equal(totals.totalPaise, 20_600 + totals.paymentFeePaise);
});
