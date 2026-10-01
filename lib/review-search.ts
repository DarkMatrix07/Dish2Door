// Pure rules for the Reviews page filters (no database, no React) so the URL parsing and
// the query they build can be unit-tested. Every value from the address bar is checked
// against an allow-list here before it can reach a Prisma query.
import type { Prisma } from "@prisma/client";
import { istDayStartUtc } from "@/lib/ist-day";

export const REVIEW_PAGE_SIZE = 20;

export const REVIEW_RANGES = ["all", "today", "7d", "30d"] as const;
export type ReviewRange = (typeof REVIEW_RANGES)[number];

export const REVIEW_RANGE_LABELS: Record<ReviewRange, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days"
};

// 1 to 5 stars exactly, or "low" for three stars and below.
export type StarFilter = 1 | 2 | 3 | 4 | 5 | "low";
export const STAR_FILTERS: readonly StarFilter[] = [1, 2, 3, 4, 5, "low"];

export type ReviewSearch = {
  restaurantId: string | null;
  food: StarFilter | null;
  delivery: StarFilter | null;
  withComment: boolean;
  range: ReviewRange;
};

export const DEFAULT_REVIEW_SEARCH: ReviewSearch = {
  restaurantId: null,
  food: null,
  delivery: null,
  withComment: false,
  range: "all"
};

// Restaurant ids are cuids or short slugs; anything else cannot match a row.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type ParamSource = { get(name: string): string | null | undefined };

function pickStars(value: string | null | undefined): StarFilter | null {
  if (value === "low") return "low";
  return (["1", "2", "3", "4", "5"] as const).includes(value as "1") ? (Number(value) as StarFilter) : null;
}

export function parseReviewSearch(params: ParamSource): ReviewSearch {
  const restaurant = params.get("restaurant");
  const range = params.get("range");
  return {
    restaurantId: restaurant && ID_PATTERN.test(restaurant) ? restaurant : null,
    food: pickStars(params.get("food")),
    delivery: pickStars(params.get("delivery")),
    withComment: params.get("comment") === "1",
    range: REVIEW_RANGES.includes(range as ReviewRange) ? (range as ReviewRange) : "all"
  };
}

// Next hands pages a plain object; a repeated key uses its first value.
export function reviewParamsFromRecord(record: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

// Defaults are left out so equal filters always produce the same address.
export function reviewSearchToParams(search: ReviewSearch) {
  const params: Record<string, string> = {};
  if (search.restaurantId) params.restaurant = search.restaurantId;
  if (search.food !== null) params.food = String(search.food);
  if (search.delivery !== null) params.delivery = String(search.delivery);
  if (search.withComment) params.comment = "1";
  if (search.range !== "all") params.range = search.range;
  return params;
}

function starsWhere(filter: StarFilter): Prisma.IntFilter {
  return filter === "low" ? { lte: 3 } : { equals: filter };
}

// The moment a date preset starts, as a UTC instant on an IST day boundary. "7d" and
// "30d" count today as one of the days, the same as the date chips on All orders.
export function reviewRangeStart(range: ReviewRange, now = new Date()): Date | null {
  if (range === "all") return null;
  return istDayStartUtc(range === "today" ? 0 : range === "7d" ? 6 : 29, now);
}

// Just the date part, for the per-restaurant averages that ignore the star filters.
export function buildReviewDateWhere(range: ReviewRange, now = new Date()): Prisma.RatingWhereInput {
  const start = reviewRangeStart(range, now);
  return start ? { createdAt: { gte: start } } : {};
}

export function buildReviewWhere(search: ReviewSearch, now = new Date()): Prisma.RatingWhereInput {
  const clauses: Prisma.RatingWhereInput[] = [buildReviewDateWhere(search.range, now)];
  if (search.restaurantId) clauses.push({ order: { restaurantId: search.restaurantId } });
  if (search.food !== null) clauses.push({ foodRating: starsWhere(search.food) });
  if (search.delivery !== null) clauses.push({ deliveryRating: starsWhere(search.delivery) });
  // Reviews are stored as typed, so an empty string counts as no comment, like null does.
  if (search.withComment) clauses.push({ review: { not: null } }, { NOT: { review: "" } });
  return { AND: clauses };
}
