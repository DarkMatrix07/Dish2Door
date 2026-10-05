import Link from "next/link";
import { Star } from "lucide-react";
import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { CampusBadge } from "@/components/admin/CampusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { Pager, readPage } from "@/components/admin/Pager";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { linkButtonClasses } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatIstDateTime } from "@/lib/ist-day";
import {
  REVIEW_PAGE_SIZE,
  REVIEW_RANGES,
  REVIEW_RANGE_LABELS,
  STAR_FILTERS,
  buildReviewDateWhere,
  buildReviewWhere,
  parseReviewSearch,
  reviewParamsFromRecord,
  reviewSearchToParams,
  type ReviewSearch,
  type StarFilter
} from "@/lib/review-search";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BASE_PATH = "/admin/ratings";

function average(value: number | null | undefined) {
  return value ? value.toFixed(1) : "—";
}

function starLabel(filter: StarFilter) {
  return filter === "low" ? "3 stars or below" : filter === 1 ? "1 star" : `${filter} stars`;
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${label}: ${value} out of 5`}>
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} size={14} className={star <= value ? "fill-amber-400 text-amber-400" : "text-neutral-300"} />
        ))}
      </span>
      <span className="text-xs font-bold tabular-nums text-neutral-600">{value}/5</span>
    </span>
  );
}

const STAR_OPTIONS = [{ value: "", label: "Any" }, ...STAR_FILTERS.map((option) => ({ value: String(option), label: starLabel(option) }))];

function StarSelect({ name, label, value }: { name: string; label: string; value: StarFilter | null }) {
  return <Dropdown name={name} label={label} defaultValue={value === null ? "" : String(value)} options={STAR_OPTIONS} />;
}

export default async function AdminRatingsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const query = reviewParamsFromRecord(await searchParams);
  const search = parseReviewSearch(query);
  const where = buildReviewWhere(search);

  // Every number is worked out in the database; only the 20 reviews on screen are loaded.
  const [restaurants, summary] = await Promise.all([
    prisma.restaurant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.rating.aggregate({ where, _count: { _all: true }, _avg: { foodRating: true, deliveryRating: true } })
  ]);

  const total = summary._count._all;
  const totalPages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE));
  const page = Math.min(readPage(query.get("page") ?? undefined), totalPages);

  // The averages table follows the date range only: it is for comparing restaurants, and
  // narrowing it by stars or comments would make every average look the same.
  const dateWhere = buildReviewDateWhere(search.range);
  const [reviews, restaurantStats] = await Promise.all([
    prisma.rating.findMany({
      where,
      select: {
        id: true,
        foodRating: true,
        deliveryRating: true,
        review: true,
        createdAt: true,
        order: {
          select: {
            customerName: true,
            customerId: true,
            trackingCode: true,
            restaurant: { select: { name: true } },
            campus: { select: { code: true, name: true } }
          }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * REVIEW_PAGE_SIZE,
      take: REVIEW_PAGE_SIZE
    }),
    Promise.all(
      restaurants.map(async (restaurant) => {
        const stats = await prisma.rating.aggregate({
          where: { AND: [dateWhere, { order: { restaurantId: restaurant.id } }] },
          _count: { _all: true },
          _avg: { foodRating: true, deliveryRating: true }
        });
        return { ...restaurant, count: stats._count._all, food: stats._avg.foodRating, delivery: stats._avg.deliveryRating };
      })
    )
  ]);
  const restaurantRows = restaurantStats.filter((row) => row.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const href = (patch: Partial<ReviewSearch>) => {
    const text = new URLSearchParams(reviewSearchToParams({ ...search, ...patch })).toString();
    return text ? `${BASE_PATH}?${text}` : BASE_PATH;
  };
  const pagerParams = reviewSearchToParams(search);
  const filtered = Object.keys(pagerParams).length > 0;
  const restaurantName = restaurants.find((restaurant) => restaurant.id === search.restaurantId)?.name;

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Customers"
        title="Reviews"
        description="What customers say about the food and the delivery. Filter by restaurant, stars or date to find what needs attention."
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={filtered ? "Matching reviews" : "Total reviews"} value={total} />
        <StatCard label="Food average" value={average(summary._avg.foodRating)} helper={total ? "out of 5" : undefined} />
        <StatCard label="Delivery average" value={average(summary._avg.deliveryRating)} helper={total ? "out of 5" : undefined} />
      </div>

      <SectionCard title="Find reviews" bodyClassName="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
          {REVIEW_RANGES.map((range) => (
            <Link
              key={range}
              href={href({ range })}
              aria-current={search.range === range ? "true" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition",
                search.range === range ? "border-neutral-950 bg-neutral-950 text-white!" : "border-neutral-200 bg-white text-neutral-700! hover:bg-neutral-50"
              )}
            >
              {REVIEW_RANGE_LABELS[range]}
            </Link>
          ))}
        </div>
        <form action={BASE_PATH} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto] lg:items-end">
          {search.range !== "all" ? <input type="hidden" name="range" value={search.range} /> : null}
          <Dropdown
            name="restaurant"
            label="Restaurant"
            defaultValue={search.restaurantId ?? ""}
            options={[{ value: "", label: "All restaurants" }, ...restaurants.map((restaurant) => ({ value: restaurant.id, label: restaurant.name }))]}
            searchPlaceholder="Search restaurants"
          />
          <StarSelect name="food" label="Food stars" value={search.food} />
          <StarSelect name="delivery" label="Delivery stars" value={search.delivery} />
          <label className="flex h-11 items-center gap-2 text-sm font-semibold text-neutral-700">
            <input type="checkbox" name="comment" value="1" defaultChecked={search.withComment} className="h-4 w-4 accent-neutral-950" />
            Has a written comment
          </label>
          <div className="flex gap-2">
            <button type="submit" className="h-11 flex-1 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white lg:flex-none">
              Show reviews
            </button>
            {filtered ? (
              <Link href={BASE_PATH} className={cn(linkButtonClasses("outline", "sm"), "h-11")}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <SectionCard
          title="Restaurant averages"
          description={`${REVIEW_RANGE_LABELS[search.range]}. Tap a restaurant to see only its reviews.`}
          bodyClassName="p-0"
        >
          <div className="divide-y divide-neutral-100">
            {restaurantRows.map((row) => {
              const selected = search.restaurantId === row.id;
              return (
                <Link
                  key={row.id}
                  href={href({ restaurantId: selected ? null : row.id })}
                  aria-current={selected ? "true" : undefined}
                  className={cn("block p-4 transition hover:bg-neutral-50 sm:p-5", selected && "bg-amber-50 hover:bg-amber-50")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">{row.name}</p>
                    <Badge tone={selected ? "amber" : "neutral"}>
                      {row.count} {row.count === 1 ? "review" : "reviews"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-neutral-50 p-3">
                      <p className="text-xs font-medium text-neutral-500">Food</p>
                      <p className="mt-1 text-2xl font-bold">{average(row.food)}</p>
                    </div>
                    <div className="rounded-xl bg-neutral-50 p-3">
                      <p className="text-xs font-medium text-neutral-500">Delivery</p>
                      <p className="mt-1 text-2xl font-bold">{average(row.delivery)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
            {!restaurantRows.length ? <EmptyState title="No reviews in this time" description="Pick a longer date range to see restaurant averages." /> : null}
          </div>
        </SectionCard>

        <SectionCard
          title={restaurantName ? `Reviews for ${restaurantName}` : "Reviews"}
          description="Newest first. Tap a name or order code to open it."
          bodyClassName="p-0"
        >
          <div className="divide-y divide-neutral-100">
            {reviews.map((rating) => {
              const comment = rating.review?.trim();
              const { order } = rating;
              return (
                <div key={rating.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      {order.customerId ? (
                        <Link href={`/admin/customers/${order.customerId}`} className="font-semibold hover:underline">
                          {order.customerName}
                        </Link>
                      ) : (
                        <p className="font-semibold">{order.customerName}</p>
                      )}
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                        <Link href={`/admin/orders/${order.trackingCode}`} className="font-mono text-xs font-bold text-neutral-700 hover:underline">
                          {order.trackingCode}
                        </Link>
                        <span>{order.restaurant.name}</span>
                        <CampusBadge campus={order.campus} />
                        <span>{formatIstDateTime(rating.createdAt)}</span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 sm:items-end">
                      <Stars value={rating.foodRating} label="Food" />
                      <Stars value={rating.deliveryRating} label="Delivery" />
                    </div>
                  </div>
                  <p className={cn("mt-3 text-sm", comment ? "text-neutral-700" : "text-neutral-400")}>{comment || "No written comment."}</p>
                </div>
              );
            })}
            {!reviews.length ? (
              <EmptyState
                title={filtered ? "No reviews match these filters" : "No customer reviews yet"}
                description={filtered ? "Try a longer date range or fewer filters." : "Reviews show up here after customers rate a delivered order."}
                action={filtered ? <Link href={BASE_PATH} className={linkButtonClasses("outline", "sm")}>Clear filters</Link> : undefined}
              />
            ) : null}
          </div>
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <Pager basePath={BASE_PATH} params={pagerParams} page={page} totalPages={totalPages} total={total} shown={reviews.length} noun="reviews" />
          </div>
        </SectionCard>
      </div>
    </PageContainer>
  );
}
