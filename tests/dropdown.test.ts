import assert from "node:assert/strict";
import test from "node:test";
import {
  LIST_MAX,
  edgeIndex,
  filterByText,
  initialActiveIndex,
  moveActiveIndex,
  optionInitial,
  placePanel,
  samePlacement,
  shouldSearch
} from "../lib/dropdown";
import { restaurantToOption } from "../lib/restaurant-picker";

test("shouldSearch turns on after seven options unless the caller decides", () => {
  assert.equal(shouldSearch(7), false);
  assert.equal(shouldSearch(8), true);
  assert.equal(shouldSearch(3, true), true);
  assert.equal(shouldSearch(40, false), false);
});

test("filterByText ignores case and surrounding spaces", () => {
  const list = [{ label: "Top spenders" }, { label: "Most orders" }];
  assert.deepEqual(filterByText(list, "  ORDERS ", (entry) => entry.label), [list[1]]);
  assert.equal(filterByText(list, "", (entry) => entry.label).length, 2);
  assert.equal(filterByText(list, "zzz", (entry) => entry.label).length, 0);
});

test("optionInitial falls back to a question mark", () => {
  assert.equal(optionInitial(" gate"), "G");
  assert.equal(optionInitial("  "), "?");
});

test("moveActiveIndex skips disabled rows and wraps", () => {
  const disabled = (index: number) => index === 1;
  assert.equal(moveActiveIndex(0, 1, 3, disabled), 2);
  assert.equal(moveActiveIndex(2, -1, 3, disabled), 0);
  assert.equal(moveActiveIndex(2, 1, 3, disabled), 0);
  assert.equal(moveActiveIndex(-1, 1, 3, disabled), 0);
  assert.equal(moveActiveIndex(-1, -1, 3, disabled), 2);
});

test("moveActiveIndex gives up when nothing can be picked", () => {
  assert.equal(moveActiveIndex(0, 1, 2, () => true), -1);
  assert.equal(moveActiveIndex(0, 1, 0), -1);
});

test("edgeIndex finds the first and last row that can be picked", () => {
  const disabled = (index: number) => index === 0 || index === 3;
  assert.equal(edgeIndex(4, "first", disabled), 1);
  assert.equal(edgeIndex(4, "last", disabled), 2);
  assert.equal(edgeIndex(2, "first", () => true), -1);
});

test("initialActiveIndex starts on the chosen option, else the first one that can be picked", () => {
  const list = [{ value: "a", disabled: true }, { value: "b" }, { value: "c" }];
  assert.equal(initialActiveIndex(list, "c"), 2);
  assert.equal(initialActiveIndex(list, "a"), 1);
  assert.equal(initialActiveIndex(list, "gone"), 1);
  assert.equal(initialActiveIndex([], "a"), -1);
});

test("placePanel hangs below the button when it fits", () => {
  const placement = placePanel({
    rect: { top: 100, bottom: 144, left: 40, width: 300 },
    viewport: { width: 1200, height: 800 },
    extraHeight: 68,
    listWanted: 320
  });
  assert.equal(placement.top, 152);
  assert.equal(placement.bottom, null);
  assert.equal(placement.left, 40);
  assert.equal(placement.width, 300);
  assert.equal(placement.listMax, LIST_MAX);
});

test("placePanel flips above the button near the bottom of the screen", () => {
  const placement = placePanel({
    rect: { top: 600, bottom: 644, left: 40, width: 300 },
    viewport: { width: 1200, height: 700 },
    extraHeight: 68,
    listWanted: 320
  });
  assert.equal(placement.top, null);
  assert.equal(placement.bottom, 700 - 600 + 8);
  assert.equal(placement.listMax, LIST_MAX);
});

test("placePanel shrinks the list when neither side has room", () => {
  const placement = placePanel({
    rect: { top: 200, bottom: 244, left: 0, width: 300 },
    viewport: { width: 1200, height: 420 },
    extraHeight: 68,
    listWanted: 320
  });
  assert.ok(placement.listMax < LIST_MAX);
  assert.ok(placement.listMax >= 120);
});

test("placePanel widens a narrow button and keeps the panel on screen", () => {
  const placement = placePanel({
    rect: { top: 100, bottom: 136, left: 1100, width: 80 },
    viewport: { width: 1200, height: 800 },
    extraHeight: 12,
    listWanted: 100
  });
  assert.equal(placement.width, 176);
  assert.equal(placement.left, 1200 - 12 - 176);
});

test("samePlacement compares every field", () => {
  const a = { left: 1, width: 2, top: 3, bottom: null, listMax: 4 };
  assert.equal(samePlacement(a, { ...a }), true);
  assert.equal(samePlacement(a, { ...a, listMax: 5 }), false);
  assert.equal(samePlacement(null, null), true);
  assert.equal(samePlacement(a, null), false);
});

test("restaurantToOption keeps the picker's badges and two description lines", () => {
  const option = restaurantToOption({ id: "r1", name: "Bowl House", itemCount: 12, soldOutCount: 2, active: false });
  assert.equal(option.value, "r1");
  assert.equal(option.label, "Bowl House");
  assert.equal(option.imageUrl, null);
  assert.equal(option.description, "12 items");
  assert.equal(option.selectedDescription, "12 items · 2 sold out");
  assert.deepEqual(option.badge, { text: "Switched off", tone: "red" });
  assert.deepEqual(option.endBadge, { text: "Sold out: 2", tone: "amber" });

  const quiet = restaurantToOption({ id: "r2", name: "Chai Point", itemCount: 1, imageUrl: "/x.png" });
  assert.equal(quiet.imageUrl, "/x.png");
  assert.equal(quiet.badge, undefined);
  assert.equal(quiet.endBadge, undefined);
});
