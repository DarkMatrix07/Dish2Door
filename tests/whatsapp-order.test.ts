import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppOrderLink,
  buildWhatsAppOrderMessage,
  normalizeIndianWhatsAppNumber,
  type WhatsAppOrderSummary
} from "../lib/whatsapp-order";

function summary(overrides: Partial<WhatsAppOrderSummary> = {}): WhatsAppOrderSummary {
  return {
    shopName: "Domino's Pizza",
    trackingCode: "ABC1234",
    customerName: "Divyesh",
    customerPhone: "9063179365",
    campusName: "VIT-AP",
    deliveryType: "GATE",
    hostelBlock: null,
    slotLabel: "Deliver by 7:30 PM",
    lines: [
      { name: "Farmhouse Pizza (Medium)", quantity: 2, unitPricePaise: 25_000, linePaise: 50_000, isVeg: true },
      { name: "Chicken Wings", quantity: 1, unitPricePaise: 12_000, linePaise: 12_000, isVeg: false }
    ],
    subtotalPaise: 62_000,
    platformFeePaise: 600,
    hostelFeePaise: 0,
    totalPaise: 62_600,
    ...overrides
  };
}

test("the message carries every item, the bill and the drop-off", () => {
  const message = buildWhatsAppOrderMessage(summary());

  assert.match(message, /DOMINO'S PIZZA/);
  assert.match(message, /ABC1234/);
  // Quantities and line totals must both survive: the shop reads this to cook and bill.
  assert.match(message, /2 × Farmhouse Pizza \(Medium\) — ₹500/);
  assert.match(message, /1 × Chicken Wings — ₹120/);
  assert.match(message, /Items: ₹620/);
  assert.match(message, /Platform fee: ₹6/);
  assert.match(message, /TOTAL: ₹626/);
  assert.match(message, /Campus gate pickup/);
  assert.match(message, /VIT-AP/);
});

test("a hostel order names the block and shows the delivery fee", () => {
  const message = buildWhatsAppOrderMessage(
    summary({ deliveryType: "HOSTEL", hostelBlock: "MH-3", hostelFeePaise: 1_500, totalPaise: 64_100 })
  );

  assert.match(message, /Hostel delivery — Block MH-3/);
  assert.match(message, /Hostel delivery: ₹15/);
  assert.doesNotMatch(message, /Campus gate pickup/);
});

test("zero-value fees are left out rather than printed as ₹0", () => {
  const message = buildWhatsAppOrderMessage(summary({ platformFeePaise: 0, hostelFeePaise: 0 }));

  assert.doesNotMatch(message, /Platform fee/);
  assert.doesNotMatch(message, /Hostel delivery:/);
});

test("paise that are not whole rupees keep both decimals", () => {
  const message = buildWhatsAppOrderMessage(summary({ totalPaise: 62_650 }));
  assert.match(message, /TOTAL: ₹626\.50/);
});

test("the wa.me link strips punctuation from the number and encodes the text", () => {
  const link = buildWhatsAppOrderLink("hello world & more", "+91 63022 50978");

  assert.ok(link.startsWith("https://wa.me/916302250978?text="));
  // A raw "&" would truncate the prefilled message at the query boundary.
  assert.ok(link.includes("%26"));
  assert.ok(!link.includes("hello world"));
});

test("a bare 10-digit Indian mobile gains the 91 country code", () => {
  // wa.me resolves a country-code-less number against the viewer's locale, so this
  // is the difference between a working link and one WhatsApp refuses to open.
  assert.equal(normalizeIndianWhatsAppNumber("6302250978"), "916302250978");
  assert.equal(normalizeIndianWhatsAppNumber("+91 63022 50978"), "916302250978");
  assert.equal(normalizeIndianWhatsAppNumber("06302250978"), "916302250978");
  assert.equal(normalizeIndianWhatsAppNumber("916302250978"), "916302250978");
});

test("numbers that are not Indian mobiles are rejected", () => {
  assert.equal(normalizeIndianWhatsAppNumber("1302250978"), null); // starts below 6
  assert.equal(normalizeIndianWhatsAppNumber("630225097"), null); // too short
  assert.equal(normalizeIndianWhatsAppNumber("63022509781"), null); // too long
  assert.equal(normalizeIndianWhatsAppNumber(""), null);
});

test("an unusable shop number falls back to the support line, never a broken link", () => {
  const link = buildWhatsAppOrderLink("hi", "12345");
  assert.ok(link.startsWith("https://wa.me/916302250978?text="));
});

test("a shop number stored without its country code still builds a valid link", () => {
  const link = buildWhatsAppOrderLink("hi", "6302250978");
  assert.ok(link.startsWith("https://wa.me/916302250978?text="));
});

test("items are grouped into veg and non-veg with a count per group", () => {
  const message = buildWhatsAppOrderMessage(summary());

  assert.match(message, /🟢 \*VEG \(2\)\*/);
  assert.match(message, /🔴 \*NON-VEG \(1\)\*/);
  // The veg heading must come before its own item, and before the non-veg block.
  assert.ok(message.indexOf("VEG (2)") < message.indexOf("Farmhouse"));
  assert.ok(message.indexOf("Farmhouse") < message.indexOf("NON-VEG"));
  assert.match(message, /\*ITEMS — 3 items\*/);
});

test("an all-veg order carries no empty non-veg heading", () => {
  const message = buildWhatsAppOrderMessage(
    summary({ lines: [{ name: "Margherita (Large)", quantity: 1, unitPricePaise: 39_600, linePaise: 39_600, isVeg: true }] })
  );

  assert.match(message, /🟢 \*VEG \(1\)\*/);
  assert.doesNotMatch(message, /NON-VEG/);
  assert.match(message, /\*ITEMS — 1 item\*/);
});

test("unmarked lines like combos get their own group, never a guessed one", () => {
  const message = buildWhatsAppOrderMessage(
    summary({
      lines: [
        { name: "Veg Feast Combo", quantity: 1, unitPricePaise: 30_000, linePaise: 30_000, isVeg: null },
        { name: "Chicken Wings", quantity: 1, unitPricePaise: 12_000, linePaise: 12_000, isVeg: false }
      ]
    })
  );

  assert.match(message, /⚪ \*COMBOS & OTHER \(1\)\*/);
  assert.match(message, /🔴 \*NON-VEG \(1\)\*/);
  assert.doesNotMatch(message, /🟢/);
});

test("with no diet flags at all the list stays flat rather than sprouting headings", () => {
  const message = buildWhatsAppOrderMessage(
    summary({
      lines: [
        { name: "Mystery Item", quantity: 1, unitPricePaise: 10_000, linePaise: 10_000 },
        { name: "Another Item", quantity: 1, unitPricePaise: 10_000, linePaise: 10_000 }
      ]
    })
  );

  assert.doesNotMatch(message, /VEG|COMBOS & OTHER/);
  assert.match(message, /• 1 × Mystery Item — ₹100/);
});

test("the unit price is shown only when more than one was ordered", () => {
  const message = buildWhatsAppOrderMessage(summary());

  assert.match(message, /2 × Farmhouse Pizza \(Medium\) — ₹500 _\(₹250 each\)_/);
  // A single unit would just restate its own line total.
  assert.doesNotMatch(message, /Chicken Wings — ₹120 _/);
});
