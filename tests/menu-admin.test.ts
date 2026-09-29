import assert from "node:assert/strict";
import test from "node:test";
import {
  DOMINOS_MANAGED_MESSAGE,
  MAX_DISCOUNT_PERCENT,
  countItems,
  filterDishGroups,
  groupDishes,
  isMainStoreMode,
  isPlausibleId,
  menuTargetOf,
  needsSizeLabels,
  parseDiscountPercent,
  parsePricePaise,
  parseSizeOrder,
  pickRestaurantId,
  removeById,
  reorderByIds,
  restaurantDeleteBlock,
  upsertById,
  upsertManyById,
  type DishItem
} from "../lib/menu-admin";

let counter = 0;
function item(over: Partial<DishItem> = {}): DishItem {
  counter += 1;
  return {
    id: `i${counter}`,
    name: "Dish",
    courseId: "c1",
    available: true,
    discountPercent: 0,
    pricePaise: 10000,
    sizeLabel: null,
    sizeOrder: 0,
    ...over
  };
}

test("restaurantDeleteBlock refuses any restaurant that has orders", () => {
  assert.equal(restaurantDeleteBlock(0), null);
  assert.equal(
    restaurantDeleteBlock(1),
    "This restaurant has 1 past order. Switch it off instead so its history stays."
  );
  assert.equal(
    restaurantDeleteBlock(42),
    "This restaurant has 42 past orders. Switch it off instead so its history stays."
  );
});

test("only ONLINE_PAYMENT counts as the main store", () => {
  assert.equal(isMainStoreMode("ONLINE_PAYMENT"), true);
  assert.equal(isMainStoreMode("WHATSAPP"), false);
  assert.match(DOMINOS_MANAGED_MESSAGE, /managed from the Domino's Pizza section/);
});

test("menuTargetOf names the row each mutation touches", () => {
  assert.deepEqual(menuTargetOf({ action: "restaurant.delete", id: "r1" }), { kind: "restaurant", id: "r1" });
  assert.deepEqual(menuTargetOf({ action: "restaurant.active", id: "r1", active: false }), { kind: "restaurant", id: "r1" });
  assert.deepEqual(menuTargetOf({ action: "course.create", restaurantId: "r1", name: "x" }), { kind: "restaurant", id: "r1" });
  assert.deepEqual(menuTargetOf({ action: "course.reorder", restaurantId: "r1", orderedIds: ["a"] }), { kind: "restaurant", id: "r1" });
  assert.deepEqual(menuTargetOf({ action: "course.update", id: "c1" }), { kind: "course", id: "c1" });
  assert.deepEqual(menuTargetOf({ action: "course.delete", id: "c1" }), { kind: "course", id: "c1" });
  assert.deepEqual(menuTargetOf({ action: "item.create", restaurantId: "r1" }), { kind: "restaurant", id: "r1" });
  assert.deepEqual(menuTargetOf({ action: "item.update", id: "m1" }), { kind: "item", id: "m1" });
  assert.deepEqual(menuTargetOf({ action: "item.stock", id: "m1" }), { kind: "item", id: "m1" });
  assert.deepEqual(menuTargetOf({ action: "item.delete", id: "m1" }), { kind: "item", id: "m1" });
  assert.deepEqual(menuTargetOf({ action: "combo.create", restaurantId: "r1" }), { kind: "restaurant", id: "r1" });
  assert.deepEqual(menuTargetOf({ action: "combo.update", id: "b1" }), { kind: "combo", id: "b1" });
  assert.deepEqual(menuTargetOf({ action: "combo.active", id: "b1" }), { kind: "combo", id: "b1" });
  assert.deepEqual(menuTargetOf({ action: "combo.delete", id: "b1" }), { kind: "combo", id: "b1" });
});

test("menuTargetOf leaves coupons, restaurant.create and the bulk discount alone", () => {
  assert.equal(menuTargetOf({ action: "coupon.create", code: "ABC" }), null);
  assert.equal(menuTargetOf({ action: "coupon.delete", id: "x" }), null);
  assert.equal(menuTargetOf({ action: "restaurant.create", name: "New" }), null);
  assert.equal(menuTargetOf({ action: "item.discount", ids: ["a"], discountPercent: 10 }), null);
  // A malformed body never yields a target with a non-string id.
  assert.equal(menuTargetOf({ action: "item.delete", id: 5 }), null);
});

test("items sharing a name in one course become one dish, sizes in order", () => {
  const large = item({ name: "Margherita", sizeLabel: "Large", sizeOrder: 2, pricePaise: 30000 });
  const small = item({ name: "Margherita", sizeLabel: "Small", sizeOrder: 0, pricePaise: 15000 });
  const medium = item({ name: "Margherita", sizeLabel: "Medium", sizeOrder: 1, pricePaise: 22000 });
  const other = item({ name: "Garlic Bread" });
  const groups = groupDishes([large, other, small, medium]);
  assert.equal(groups.length, 2);
  const margherita = groups.find((group) => group.name === "Margherita")!;
  assert.deepEqual(margherita.items.map((entry) => entry.sizeLabel), ["Small", "Medium", "Large"]);
  assert.equal(margherita.needsSizeLabels, false);
  assert.equal(groups.find((group) => group.name === "Garlic Bread")!.items.length, 1);
});

test("the same name in a different course is a different dish", () => {
  const groups = groupDishes([item({ name: "Fries", courseId: "c1" }), item({ name: "Fries", courseId: "c2" })]);
  assert.equal(groups.length, 2);
});

test("equal sizeOrder falls back to price", () => {
  const dear = item({ name: "Dosa", sizeLabel: "Big", pricePaise: 9000 });
  const cheap = item({ name: "Dosa", sizeLabel: "Mini", pricePaise: 5000 });
  assert.deepEqual(groupDishes([dear, cheap])[0].items.map((entry) => entry.sizeLabel), ["Mini", "Big"]);
});

test("several prices with a missing size label raise the warning", () => {
  assert.equal(needsSizeLabels([{ sizeLabel: null }]), false);
  assert.equal(needsSizeLabels([{ sizeLabel: "Large" }]), false);
  assert.equal(needsSizeLabels([{ sizeLabel: "Small" }, { sizeLabel: "Large" }]), false);
  assert.equal(needsSizeLabels([{ sizeLabel: "Small" }, { sizeLabel: null }]), true);
  assert.equal(needsSizeLabels([{ sizeLabel: "Small" }, { sizeLabel: "  " }]), true);
  const groups = groupDishes([item({ name: "Pizza" }), item({ name: "Pizza", sizeLabel: "Large" })]);
  assert.equal(groups[0].needsSizeLabels, true);
});

test("groups follow the course order, then the dish name", () => {
  const groups = groupDishes(
    [item({ name: "Zucchini", courseId: "starters" }), item({ name: "Apple pie", courseId: "desserts" }), item({ name: "Bread", courseId: "starters" })],
    ["starters", "desserts"]
  );
  assert.deepEqual(groups.map((group) => group.name), ["Bread", "Zucchini", "Apple pie"]);
});

test("search matches the dish name and the filter keeps only matching sizes", () => {
  const groups = groupDishes([
    item({ name: "Margherita", sizeLabel: "Small", available: false }),
    item({ name: "Margherita", sizeLabel: "Large", discountPercent: 10 }),
    item({ name: "Garlic Bread", discountPercent: 0 })
  ]);

  assert.equal(filterDishGroups(groups, { query: "", filter: "all" }).length, 2);
  assert.equal(filterDishGroups(groups, { query: "  MARG ", filter: "all" }).length, 1);
  assert.equal(filterDishGroups(groups, { query: "pasta", filter: "all" }).length, 0);

  const soldOut = filterDishGroups(groups, { query: "", filter: "soldOut" });
  assert.equal(soldOut.length, 1);
  assert.deepEqual(soldOut[0].items.map((entry) => entry.sizeLabel), ["Small"]);

  const discounted = filterDishGroups(groups, { query: "", filter: "discounted" });
  assert.deepEqual(discounted.flatMap((group) => group.items.map((entry) => entry.sizeLabel)), ["Large"]);
});

test("filtering never hides the whole-dish size warning", () => {
  const groups = groupDishes([item({ name: "Pizza", available: false }), item({ name: "Pizza", sizeLabel: "Large" })]);
  const [group] = filterDishGroups(groups, { query: "", filter: "soldOut" });
  assert.equal(group.items.length, 1);
  assert.equal(group.needsSizeLabels, true);
});

test("countItems counts sold-out and discounted rows", () => {
  assert.deepEqual(
    countItems([item({ available: false }), item({ discountPercent: 5 }), item({ available: false, discountPercent: 20 }), item()]),
    { total: 4, soldOut: 2, discounted: 2 }
  );
});

test("upsertById replaces a row in place and appends a new one", () => {
  const rows = [{ id: "a", n: 1, extra: "keep" }, { id: "b", n: 2, extra: "keep" }];
  const replaced = upsertById(rows, { id: "a", n: 9 } as (typeof rows)[number]);
  assert.deepEqual(replaced, [{ id: "a", n: 9, extra: "keep" }, { id: "b", n: 2, extra: "keep" }]);
  assert.equal(rows[0].n, 1, "the input list is not changed");
  assert.equal(upsertById(rows, { id: "c", n: 3, extra: "x" }).length, 3);
});

test("upsertManyById, removeById and reorderByIds", () => {
  const rows = [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 3 }];
  assert.deepEqual(upsertManyById(rows, [{ id: "a", n: 10 }, { id: "c", n: 30 }]).map((row) => row.n), [10, 2, 30]);
  assert.deepEqual(removeById(rows, "b").map((row) => row.id), ["a", "c"]);
  assert.deepEqual(reorderByIds(rows, ["c", "a", "b"]).map((row) => row.id), ["c", "a", "b"]);
  assert.deepEqual(reorderByIds(rows, ["b"]).map((row) => row.id), ["b", "a", "c"]);
});

test("parseDiscountPercent takes whole numbers from 0 to 90", () => {
  assert.deepEqual(parseDiscountPercent(""), { ok: true, value: 0 });
  assert.deepEqual(parseDiscountPercent(" 15 "), { ok: true, value: 15 });
  assert.deepEqual(parseDiscountPercent(String(MAX_DISCOUNT_PERCENT)), { ok: true, value: 90 });
  assert.equal(parseDiscountPercent("91").ok, false);
  assert.equal(parseDiscountPercent("-5").ok, false);
  assert.equal(parseDiscountPercent("7.5").ok, false);
  assert.equal(parseDiscountPercent("ten").ok, false);
});

test("parsePricePaise turns rupees into paise and rejects bad input", () => {
  assert.deepEqual(parsePricePaise("249"), { ok: true, value: 24900 });
  assert.deepEqual(parsePricePaise("249.50"), { ok: true, value: 24950 });
  assert.deepEqual(parsePricePaise("0.1"), { ok: false, error: "The price must be at least ₹1." });
  assert.equal(parsePricePaise("").ok, false);
  assert.equal(parsePricePaise("abc").ok, false);
  assert.equal(parsePricePaise("12.345").ok, false);
  assert.equal(parsePricePaise("-40").ok, false);
});

test("parseSizeOrder falls back to 0", () => {
  assert.equal(parseSizeOrder(""), 0);
  assert.equal(parseSizeOrder("2"), 2);
  assert.equal(parseSizeOrder("x"), 0);
});

test("pickRestaurantId only trusts ids from this page", () => {
  const ids = ["r1", "r2"];
  assert.equal(pickRestaurantId("r2", ids), "r2");
  assert.equal(pickRestaurantId("dominos-id", ids), "r1");
  assert.equal(pickRestaurantId(null, ids), "r1");
  assert.equal(pickRestaurantId("r1", []), null);
});

test("isPlausibleId accepts database ids and nothing odd", () => {
  assert.equal(isPlausibleId("cmabc123xyz"), true);
  assert.equal(isPlausibleId(""), false);
  assert.equal(isPlausibleId(null), false);
  assert.equal(isPlausibleId("a b"), false);
  assert.equal(isPlausibleId("x".repeat(65)), false);
});
