import assert from "node:assert/strict";
import test from "node:test";
import {
  ORDERING_FIELDS,
  WHEEL_FIELDS,
  buildSettingsPayload,
  isCampusDirty,
  isSectionDirty,
  mergeSavedSection,
  minutesToTimeInput,
  parsePercentToBps,
  parseRupeesToPaise,
  pickSettings,
  sampleOrderTotalPaise,
  timeInputToMinutes,
  unitsToDecimalText,
  campusFromDraft,
  draftFromCampus,
  isCampusDraftDirty,
  validateOrdering,
  type CampusForm,
  type Settings
} from "../lib/admin-settings";

const saved: Settings = {
  ordersOpen: true,
  closedMessage: "Orders are closed for today.",
  contactNumber: "9999999999",
  platformFeePaise: 200,
  hostelDeliveryFeePaise: 1500,
  paymentChargePercentBps: 250,
  paymentChargeFixedPaise: 0,
  orderingOpenMinute: 360,
  orderingCloseMinute: 1380,
  spinWheelForEveryone: false
};

test("a section is unsaved only when one of its own fields changed", () => {
  assert.equal(isSectionDirty(saved, saved, ORDERING_FIELDS), false);
  assert.equal(isSectionDirty(saved, { ...saved, ordersOpen: false }, ORDERING_FIELDS), true);
  assert.equal(isSectionDirty(saved, { ...saved, spinWheelForEveryone: true }, ORDERING_FIELDS), false);
  assert.equal(isSectionDirty(saved, { ...saved, spinWheelForEveryone: true }, WHEEL_FIELDS), true);
});

test("saving one section never sends another section's unsaved edits", () => {
  const draft = { ...saved, contactNumber: "1234567", spinWheelForEveryone: true };
  const wheelPayload = buildSettingsPayload(saved, draft, WHEEL_FIELDS);
  assert.equal(wheelPayload.spinWheelForEveryone, true);
  assert.equal(wheelPayload.contactNumber, saved.contactNumber);
  const orderingPayload = buildSettingsPayload(saved, draft, ORDERING_FIELDS);
  assert.equal(orderingPayload.contactNumber, "1234567");
  assert.equal(orderingPayload.spinWheelForEveryone, false);
  // The legacy fee fields ride along unchanged because the API still requires them.
  assert.equal(orderingPayload.platformFeePaise, 200);
});

test("after a save, edits still waiting in other sections are kept", () => {
  const draft = { ...saved, closedMessage: "Back at 6am!", spinWheelForEveryone: true };
  const fromServer = { ...saved, closedMessage: "Back at 6am!" };
  const merged = mergeSavedSection(draft, fromServer, ORDERING_FIELDS);
  assert.equal(merged.spinWheelForEveryone, true);
  assert.equal(merged.closedMessage, "Back at 6am!");
});

test("pickSettings drops database columns the page does not use", () => {
  const row = { ...saved, id: "default", notifyEmail: true, createdAt: "x" } as unknown as Settings;
  assert.deepEqual(Object.keys(pickSettings(row)).sort(), Object.keys(saved).sort());
});

test("time boxes convert both ways and ignore a cleared box", () => {
  assert.equal(minutesToTimeInput(360), "06:00");
  assert.equal(minutesToTimeInput(1380), "23:00");
  assert.equal(timeInputToMinutes("06:30"), 390);
  assert.equal(timeInputToMinutes(""), null);
  assert.equal(timeInputToMinutes("25:00"), null);
  assert.equal(timeInputToMinutes(minutesToTimeInput(1439)), 1439);
});

test("ordering validation explains the problem in plain words", () => {
  assert.equal(validateOrdering(saved), null);
  assert.match(validateOrdering({ ...saved, orderingOpenMinute: 1380, orderingCloseMinute: 360 }) ?? "", /earlier in the day/);
  assert.match(validateOrdering({ ...saved, orderingOpenMinute: 600, orderingCloseMinute: 600 }) ?? "", /earlier in the day/);
  assert.match(validateOrdering({ ...saved, closedMessage: "  ab " }) ?? "", /closed message/);
  assert.match(validateOrdering({ ...saved, closedMessage: "x".repeat(241) }) ?? "", /240/);
  assert.match(validateOrdering({ ...saved, contactNumber: " 1 " }) ?? "", /contact number/);
});

test("typed amounts become paise without losing a decimal point mid-typing", () => {
  assert.equal(parseRupeesToPaise("12.5"), 1250);
  assert.equal(parseRupeesToPaise("12."), 1200);
  assert.equal(parseRupeesToPaise(".5"), 50);
  assert.equal(parseRupeesToPaise("0"), 0);
  assert.equal(parseRupeesToPaise("1.15"), 115);
  assert.equal(parseRupeesToPaise(""), null);
  assert.equal(parseRupeesToPaise("-3"), null);
  assert.equal(parseRupeesToPaise("1.234"), null);
  assert.equal(parseRupeesToPaise("abc"), null);
  assert.equal(parsePercentToBps("2.36"), 236);
  assert.equal(unitsToDecimalText(1250), "12.5");
  assert.equal(unitsToDecimalText(200), "2");
});

const campus: CampusForm = {
  id: "c1",
  code: "SRM",
  name: "SRM",
  active: true,
  platformFeePaise: 200,
  hostelDeliveryFeePaise: 1500,
  hostelDeliveryEnabled: false,
  hostelDeliveryNightOnly: false,
  paymentChargePercentBps: 250,
  paymentChargeFixedPaise: 0,
  orderCount: 12
};

test("a campus is unsaved only when a saveable field changed", () => {
  assert.equal(isCampusDirty(campus, { ...campus }), false);
  assert.equal(isCampusDirty(campus, { ...campus, orderCount: 99 }), false);
  assert.equal(isCampusDirty(campus, { ...campus, active: false }), true);
  assert.equal(isCampusDirty(campus, { ...campus, platformFeePaise: 300 }), true);
});

test("campus drafts show fees as typed text and round-trip unchanged", () => {
  const draft = draftFromCampus(campus);
  assert.deepEqual(draft, { active: true, hostelDeliveryEnabled: false, hostelDeliveryNightOnly: false, platformFee: "2", hostelDeliveryFee: "15", paymentPercent: "2.5" });
  assert.equal(isCampusDraftDirty(campus, draft), false);
  assert.deepEqual(campusFromDraft(campus, draft).campus, campus);
});

test("editing a campus card turns typed text into paise and basis points", () => {
  const draft = { ...draftFromCampus(campus), platformFee: "3.5", paymentPercent: "2.36", active: false };
  const { campus: next, problems } = campusFromDraft(campus, draft);
  assert.deepEqual(problems, {});
  assert.equal(next.platformFeePaise, 350);
  assert.equal(next.paymentChargePercentBps, 236);
  assert.equal(next.active, false);
  assert.equal(next.paymentChargeFixedPaise, 0);
  assert.equal(isCampusDraftDirty(campus, draft), true);
  // "2.0" is the same fee as "2", so it is not a change.
  assert.equal(isCampusDraftDirty(campus, { ...draftFromCampus(campus), platformFee: "2.0" }), false);
});

test("a campus box that is not a usable amount is a problem and keeps the saved value", () => {
  const cleared = campusFromDraft(campus, { ...draftFromCampus(campus), platformFee: "" });
  assert.match(cleared.problems.platformFee ?? "", /number/);
  assert.equal(cleared.campus.platformFeePaise, 200);
  assert.equal(isCampusDraftDirty(campus, { ...draftFromCampus(campus), platformFee: "" }), true);
  const tooBig = campusFromDraft(campus, { ...draftFromCampus(campus), hostelDeliveryFee: "1001", paymentPercent: "10.01" });
  assert.match(tooBig.problems.hostelDeliveryFee ?? "", /1,000/);
  assert.match(tooBig.problems.paymentPercent ?? "", /10%/);
  assert.deepEqual(campusFromDraft(campus, { ...draftFromCampus(campus), paymentPercent: "10" }).problems, {});
});

test("the sample order total uses the checkout calculator", () => {
  // 20000 + 200 platform = 20200; 2.5% of that rounds up to 505 -> 20705.
  assert.equal(sampleOrderTotalPaise(campus), 20_705);
  assert.equal(sampleOrderTotalPaise({ ...campus, platformFeePaise: 0, paymentChargePercentBps: 0 }), 20_000);
});
