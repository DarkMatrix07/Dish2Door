import assert from "node:assert/strict";
import test from "node:test";
import { PublicError } from "../lib/public-error";
import {
  DEFAULT_SLOT_SETTINGS,
  DEFAULT_SLOT_TIMES,
  assertOrderSlotAvailable,
  isOrderSlotAvailable,
  slotTimesFrom,
  validateSlotTimes
} from "../lib/order-slots";

// 10:30 AM, 12:30 PM and 6:00 PM India time (IST is UTC+5:30).
const at = (hh: number, mm: number) => new Date(Date.UTC(2026, 9, 5, hh, mm) - 330 * 60_000);

test("the defaults are the slots the site always had", () => {
  assert.deepEqual(DEFAULT_SLOT_TIMES.AFTERNOON, {
    cutoffMinutes: 720,
    deliveryMinutes: 820,
    cutoffLabel: "Order before 12:00 PM",
    deliveryLabel: "Deliver by 1:40 PM"
  });
  assert.deepEqual(DEFAULT_SLOT_TIMES.NIGHT, {
    cutoffMinutes: 1065,
    deliveryMinutes: 1170,
    cutoffLabel: "Order before 5:45 PM",
    deliveryLabel: "Deliver by 7:30 PM"
  });
  assert.equal(validateSlotTimes(DEFAULT_SLOT_SETTINGS), null);
});

test("slotTimesFrom builds labels from the saved minutes and ignores unrelated columns", () => {
  const times = slotTimesFrom({ ...DEFAULT_SLOT_SETTINGS, afternoonCutoffMinute: 11 * 60 + 30, nightDeliveryMinute: 20 * 60, ordersOpen: true } as never);
  assert.equal(times.AFTERNOON.cutoffLabel, "Order before 11:30 AM");
  assert.equal(times.AFTERNOON.deliveryLabel, "Deliver by 1:40 PM");
  assert.equal(times.NIGHT.cutoffMinutes, 1065);
  assert.equal(times.NIGHT.deliveryLabel, "Deliver by 8:00 PM");
});

test("slotTimesFrom falls back to the defaults for anything missing", () => {
  assert.deepEqual(slotTimesFrom(), DEFAULT_SLOT_TIMES);
  assert.deepEqual(slotTimesFrom({}), DEFAULT_SLOT_TIMES);
  assert.equal(slotTimesFrom({ nightCutoffMinute: 1100 }).AFTERNOON.cutoffMinutes, 720);
});

test("a slot is open strictly before its order-by time, using the times passed in", () => {
  assert.equal(isOrderSlotAvailable("AFTERNOON", DEFAULT_SLOT_TIMES, at(11, 59)), true);
  assert.equal(isOrderSlotAvailable("AFTERNOON", DEFAULT_SLOT_TIMES, at(12, 0)), false);
  assert.equal(isOrderSlotAvailable("NIGHT", DEFAULT_SLOT_TIMES, at(17, 44)), true);
  assert.equal(isOrderSlotAvailable("NIGHT", DEFAULT_SLOT_TIMES, at(17, 45)), false);

  const later = slotTimesFrom({ afternoonCutoffMinute: 13 * 60, afternoonDeliveryMinute: 15 * 60 });
  assert.equal(isOrderSlotAvailable("AFTERNOON", later, at(12, 30)), true);
  assert.equal(isOrderSlotAvailable("AFTERNOON", DEFAULT_SLOT_TIMES, at(12, 30)), false);
});

test("a closed slot is refused with the time it closed", () => {
  assert.doesNotThrow(() => assertOrderSlotAvailable("NIGHT", DEFAULT_SLOT_TIMES, at(12, 30)));
  assert.throws(
    () => assertOrderSlotAvailable("AFTERNOON", DEFAULT_SLOT_TIMES, at(12, 30)),
    (error) => error instanceof PublicError && error.message === "Afternoon orders closed at 12:00 PM. Please choose an available slot."
  );
  const custom = slotTimesFrom({ nightCutoffMinute: 18 * 60, nightDeliveryMinute: 20 * 60 });
  assert.throws(
    () => assertOrderSlotAvailable("NIGHT", custom, at(18, 0)),
    (error) => error instanceof PublicError && error.message === "Night orders closed at 6:00 PM. Please choose an available slot."
  );
});

test("validateSlotTimes accepts sensible times", () => {
  assert.equal(validateSlotTimes({ afternoonCutoffMinute: 0, afternoonDeliveryMinute: 1, nightCutoffMinute: 2, nightDeliveryMinute: 1439 }), null);
  assert.equal(validateSlotTimes({ ...DEFAULT_SLOT_SETTINGS, nightCutoffMinute: 1100, nightDeliveryMinute: 1200 }), null);
});

test("validateSlotTimes explains each way the times can be wrong", () => {
  const bad = (patch: Partial<typeof DEFAULT_SLOT_SETTINGS>) => validateSlotTimes({ ...DEFAULT_SLOT_SETTINGS, ...patch });

  assert.match(bad({ afternoonCutoffMinute: 820 })!, /Afternoon slot.*before the delivery time/);
  assert.match(bad({ afternoonCutoffMinute: 900 })!, /Afternoon slot.*before the delivery time/);
  assert.match(bad({ nightCutoffMinute: 1170 })!, /Night slot.*before the delivery time/);
  assert.match(bad({ nightCutoffMinute: 1200, nightDeliveryMinute: 1300, afternoonCutoffMinute: 1250, afternoonDeliveryMinute: 1260 })!, /Afternoon order-by time must be earlier than the Night/);
  // Same order-by time for both slots is not allowed either.
  assert.match(bad({ afternoonCutoffMinute: 1065, afternoonDeliveryMinute: 1100 })!, /Afternoon order-by time must be earlier/);
});

test("validateSlotTimes rejects values outside a day or that are not whole minutes", () => {
  assert.match(bad(-1), /between 12:00 AM and 11:59 PM/);
  assert.match(bad(1440), /between 12:00 AM and 11:59 PM/);
  assert.match(bad(720.5), /between 12:00 AM and 11:59 PM/);
  assert.match(bad(Number.NaN), /between 12:00 AM and 11:59 PM/);

  function bad(minute: number) {
    return validateSlotTimes({ ...DEFAULT_SLOT_SETTINGS, afternoonCutoffMinute: minute })!;
  }
});
