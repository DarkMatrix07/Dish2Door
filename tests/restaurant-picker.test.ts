import assert from "node:assert/strict";
import test from "node:test";
import { filterRestaurants, initialActiveIndex, moveActiveIndex, restaurantCountsLine, restaurantInitial } from "../lib/restaurant-picker";

const list = [
  { id: "a", name: "Amrutha Resturant", itemCount: 73, soldOutCount: 2 },
  { id: "b", name: "Bowl House", itemCount: 1, soldOutCount: 0 },
  { id: "c", name: "Chai Point", itemCount: 0 }
];

test("filterRestaurants ignores case and surrounding spaces", () => {
  assert.deepEqual(filterRestaurants(list, "  BOWL ").map((r) => r.id), ["b"]);
  assert.deepEqual(filterRestaurants(list, "t").map((r) => r.id), ["a", "c"]);
});

test("filterRestaurants returns everything for a blank query and nothing for no match", () => {
  assert.equal(filterRestaurants(list, "   ").length, 3);
  assert.equal(filterRestaurants(list, "zzz").length, 0);
});

test("restaurantCountsLine uses singular and plural and only shows sold out when asked", () => {
  assert.equal(restaurantCountsLine(list[0], true), "73 items · 2 sold out");
  assert.equal(restaurantCountsLine(list[0], false), "73 items");
  assert.equal(restaurantCountsLine(list[1], true), "1 item");
  assert.equal(restaurantCountsLine(list[2], true), "0 items");
  assert.equal(restaurantCountsLine({ ...list[0], summary: "2 combos · 14 items" }, false), "2 combos · 14 items");
});

test("restaurantInitial falls back to a question mark", () => {
  assert.equal(restaurantInitial("  bowl house"), "B");
  assert.equal(restaurantInitial("   "), "?");
});

test("moveActiveIndex wraps and handles an empty list", () => {
  assert.equal(moveActiveIndex(0, 1, 3), 1);
  assert.equal(moveActiveIndex(2, 1, 3), 0);
  assert.equal(moveActiveIndex(0, -1, 3), 2);
  assert.equal(moveActiveIndex(-1, 1, 3), 0);
  assert.equal(moveActiveIndex(-1, -1, 3), 2);
  assert.equal(moveActiveIndex(5, 1, 3), 0);
  assert.equal(moveActiveIndex(0, 1, 0), -1);
});

test("initialActiveIndex starts on the selected restaurant, else the first", () => {
  assert.equal(initialActiveIndex(list, "b"), 1);
  assert.equal(initialActiveIndex(list, "gone"), 0);
  assert.equal(initialActiveIndex(list.slice(0, 1), null), 0);
  assert.equal(initialActiveIndex([], "a"), -1);
});
