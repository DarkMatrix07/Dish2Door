import assert from "node:assert/strict";
import test from "node:test";
import { istDayStartUtc } from "../lib/ist-day";
import {
  buildReviewDateWhere,
  buildReviewWhere,
  parseReviewSearch,
  reviewParamsFromRecord,
  reviewRangeStart,
  reviewSearchToParams,
  DEFAULT_REVIEW_SEARCH
} from "../lib/review-search";

const params = (record: Record<string, string>) => ({ get: (name: string) => record[name] ?? null });

test("an empty address means no filters", () => {
  assert.deepEqual(parseReviewSearch(params({})), DEFAULT_REVIEW_SEARCH);
});

test("only allow-listed values survive parsing", () => {
  const search = parseReviewSearch(params({ restaurant: "../etc", food: "9", delivery: "x", comment: "yes", range: "forever" }));
  assert.deepEqual(search, DEFAULT_REVIEW_SEARCH);
});

test("star filters accept 1 to 5 and low", () => {
  assert.equal(parseReviewSearch(params({ food: "4" })).food, 4);
  assert.equal(parseReviewSearch(params({ delivery: "low" })).delivery, "low");
  assert.equal(parseReviewSearch(params({ food: "0" })).food, null);
  assert.equal(parseReviewSearch(params({ food: "6" })).food, null);
});

test("filters round-trip through the address without defaults", () => {
  const search = parseReviewSearch(params({ restaurant: "abc_123", food: "low", delivery: "2", comment: "1", range: "7d" }));
  assert.deepEqual(reviewSearchToParams(search), { restaurant: "abc_123", food: "low", delivery: "2", comment: "1", range: "7d" });
  assert.deepEqual(reviewSearchToParams(DEFAULT_REVIEW_SEARCH), {});
});

test("a repeated key uses its first value", () => {
  const query = reviewParamsFromRecord({ food: ["3", "5"], range: undefined });
  assert.equal(query.get("food"), "3");
  assert.equal(query.has("range"), false);
});

test("date presets start on an IST day boundary, counting today", () => {
  const now = new Date("2026-10-02T10:00:00Z");
  assert.equal(reviewRangeStart("all", now), null);
  assert.equal(reviewRangeStart("today", now)?.getTime(), istDayStartUtc(0, now).getTime());
  assert.equal(reviewRangeStart("7d", now)?.getTime(), istDayStartUtc(6, now).getTime());
  assert.equal(reviewRangeStart("30d", now)?.getTime(), istDayStartUtc(29, now).getTime());
  // 02:30 IST on the 3rd is still the 2nd in UTC: today must start at the IST midnight.
  const early = new Date("2026-10-02T21:00:00Z");
  assert.equal(reviewRangeStart("today", early)?.toISOString(), "2026-10-02T18:30:00.000Z");
});

test("the date-only filter is empty for all time", () => {
  assert.deepEqual(buildReviewDateWhere("all"), {});
});

test("the query combines every chosen filter", () => {
  const now = new Date("2026-10-02T10:00:00Z");
  const where = buildReviewWhere({ restaurantId: "r1", food: "low", delivery: 5, withComment: true, range: "today" }, now);
  assert.deepEqual(where, {
    AND: [
      { createdAt: { gte: istDayStartUtc(0, now) } },
      { order: { restaurantId: "r1" } },
      { foodRating: { lte: 3 } },
      { deliveryRating: { equals: 5 } },
      { review: { not: null } },
      { NOT: { review: "" } }
    ]
  });
});

test("no filters produce a query that matches everything", () => {
  assert.deepEqual(buildReviewWhere(DEFAULT_REVIEW_SEARCH), { AND: [{}] });
});
