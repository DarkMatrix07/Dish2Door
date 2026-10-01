import { itemsSummary } from "@/lib/order-labels";

// One newest-first story of a customer: orders, reviews, wheel prizes and the days they
// spun or gave up the wheel. Pure, so the merge, the filters and the "show more" paging can
// be tested without a database.

export const TIMELINE_PAGE = 60;
export const TIMELINE_MAX = 600;

export type TimelineFilter = "all" | "orders" | "reviews" | "prizes";
export const TIMELINE_FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "orders", label: "Orders" },
  { key: "reviews", label: "Reviews" },
  { key: "prizes", label: "Prizes" }
];

export function parseTimelineFilter(value: string | undefined): TimelineFilter {
  return TIMELINE_FILTERS.some((filter) => filter.key === value) ? (value as TimelineFilter) : "all";
}

// ?limit= comes from the address bar, so anything that is not a whole number in range falls
// back to the first page instead of reaching the database as a huge take.
export function parseTimelineLimit(value: string | undefined) {
  if (!value || !/^\d{1,4}$/.test(value)) return TIMELINE_PAGE;
  const limit = Number(value);
  if (limit < TIMELINE_PAGE) return TIMELINE_PAGE;
  return Math.min(limit, TIMELINE_MAX);
}

// Which sources a filter needs, so "Reviews" does not load every order.
export function timelineSources(filter: TimelineFilter) {
  return {
    orders: filter === "all" || filter === "orders",
    reviews: filter === "all" || filter === "reviews",
    // Spin and gave-up days belong with the prizes: they are the wheel's side of the story.
    prizes: filter === "all" || filter === "prizes"
  };
}

export type OrderRow = {
  id: string;
  createdAt: Date;
  trackingCode: string;
  status: string;
  paymentStatus: string;
  source: string;
  totalPaise: number;
  couponCode: string | null;
  couponDiscountPaise: number;
  restaurant: { name: string };
  items: { nameSnapshot: string; quantity: number }[];
};
export type ReviewRow = {
  id: string;
  createdAt: Date;
  foodRating: number;
  deliveryRating: number;
  review: string | null;
  order: { trackingCode: string; restaurant: { name: string } };
};
export type PrizeRow = {
  id: string;
  createdAt: Date;
  discountPercent: number;
  couponCode: string;
  redeemedAt: Date | null;
  issuedNote: string | null;
  issuedBy: { name: string } | null;
  issuedById: string | null;
  order: { trackingCode: string; couponDiscountPaise: number } | null;
  // The prize's coupon, for the expiry time and whether a checkout is holding it.
  coupon: { expiresAt: Date | null; heldCount: number } | null;
};
export type SpinRow = { id: string; createdAt: Date; spinDay: string; outcome: string; mode: string };

export type TimelineEvent =
  | { kind: "order"; id: string; at: Date; order: Omit<OrderRow, "createdAt" | "id" | "items"> & { items: string } }
  | { kind: "review"; id: string; at: Date; review: Omit<ReviewRow, "createdAt" | "id"> }
  | {
      kind: "prize";
      id: string;
      at: Date;
      prize: {
        rewardId: string;
        percent: number;
        code: string;
        // "Given by <admin>" when an admin gave it, otherwise the customer won it.
        gift: boolean;
        givenBy: string | null;
        note: string | null;
        used: boolean;
        expiresAt: Date | null;
        held: boolean;
        usedOn: { trackingCode: string; discountPaise: number } | null;
      };
    }
  | { kind: "spin"; id: string; at: Date; spin: { day: string; spun: boolean; promo: boolean } };

// When two things share a moment (a spin and the prize it produced are written in one
// transaction) the prize reads first, because newest-first puts the later event on top.
const KIND_RANK = { prize: 3, review: 2, order: 1, spin: 0 } as const;

export function buildCustomerTimeline(
  sources: { orders: OrderRow[]; reviews: ReviewRow[]; prizes: PrizeRow[]; spins: SpinRow[] },
  limit: number
) {
  const events: TimelineEvent[] = [
    ...sources.orders.map((row): TimelineEvent => ({
      kind: "order",
      id: row.id,
      at: row.createdAt,
      order: {
        trackingCode: row.trackingCode,
        status: row.status,
        paymentStatus: row.paymentStatus,
        source: row.source,
        totalPaise: row.totalPaise,
        couponCode: row.couponCode,
        couponDiscountPaise: row.couponDiscountPaise,
        restaurant: row.restaurant,
        items: itemsSummary(row.items)
      }
    })),
    ...sources.reviews.map((row): TimelineEvent => ({
      kind: "review",
      id: row.id,
      at: row.createdAt,
      review: { foodRating: row.foodRating, deliveryRating: row.deliveryRating, review: row.review, order: row.order }
    })),
    ...sources.prizes.map((row): TimelineEvent => ({
      kind: "prize",
      id: row.id,
      at: row.createdAt,
      prize: {
        rewardId: row.id,
        percent: row.discountPercent,
        code: row.couponCode,
        gift: row.issuedById !== null,
        givenBy: row.issuedBy?.name ?? null,
        note: row.issuedNote,
        used: row.redeemedAt !== null,
        expiresAt: row.coupon?.expiresAt ?? null,
        held: (row.coupon?.heldCount ?? 0) > 0,
        usedOn: row.order ? { trackingCode: row.order.trackingCode, discountPaise: row.order.couponDiscountPaise } : null
      }
    })),
    ...sources.spins.map((row): TimelineEvent => ({
      kind: "spin",
      id: row.id,
      at: row.createdAt,
      spin: { day: row.spinDay, spun: row.outcome === "SPUN", promo: row.mode === "EVERYONE" }
    }))
  ];

  events.sort(
    (a, b) => b.at.getTime() - a.at.getTime() || KIND_RANK[b.kind] - KIND_RANK[a.kind] || (a.id < b.id ? 1 : -1)
  );
  // Each source is loaded with one row more than the limit, so having more than `limit`
  // events here means something older is still waiting.
  return { events: events.slice(0, limit), hasMore: events.length > limit };
}

// "Show more" address for the customer page: keeps the chosen filter, raises the limit.
export function timelineHref(phone: string, filter: TimelineFilter, limit: number) {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("show", filter);
  if (limit > TIMELINE_PAGE) query.set("limit", String(limit));
  const text = query.toString();
  return `/admin/customers/${phone}${text ? `?${text}` : ""}#timeline`;
}

export function nextTimelineLimit(limit: number) {
  return Math.min(limit + TIMELINE_PAGE, TIMELINE_MAX);
}

// Loyalty progress: reviewed orders since the customer's last spin or gave-up day.
export function loyaltyProgress(reviewedTotal: number, baseline: number, perReward: number) {
  const cycle = Math.max(0, reviewedTotal - baseline);
  const done = Math.min(cycle, perReward);
  return { done, perReward, ready: cycle >= perReward, remaining: Math.max(0, perReward - cycle) };
}
