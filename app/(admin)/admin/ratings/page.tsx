import { AdminPageHeader, PageContainer, SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Pager, readPage } from "@/components/admin/Pager";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatIstDateTime } from "@/lib/ist-day";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function ratingText(value: number | null | undefined) {
  return value ? value.toFixed(1) : "0.0";
}

export default async function AdminRatingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireRole(["ADMIN"]);
  const page = readPage((await searchParams).page);

  // Totals and averages are computed over every review in the database. The page used
  // to average only the latest 80, so its "Total reviews" stopped at 80.
  const [overall, restaurantRows, ratings] = await Promise.all([
    prisma.rating.aggregate({ _count: { _all: true }, _avg: { foodRating: true, deliveryRating: true } }),
    prisma.$queryRaw<Array<{ name: string; count: number; food: number; delivery: number }>>`
      SELECT res.name, COUNT(r.id)::int AS count,
             AVG(r."foodRating")::float8 AS food, AVG(r."deliveryRating")::float8 AS delivery
      FROM "Rating" r
      JOIN "Order" o ON o.id = r."orderId"
      JOIN "Restaurant" res ON res.id = o."restaurantId"
      GROUP BY res.name
      ORDER BY count DESC, res.name`,
    prisma.rating.findMany({
      select: {
        id: true,
        foodRating: true,
        deliveryRating: true,
        review: true,
        createdAt: true,
        order: {
          select: {
            customerName: true,
            trackingCode: true,
            restaurant: { select: { name: true } },
            items: { select: { quantity: true, nameSnapshot: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    })
  ]);

  const totalReviews = overall._count._all;
  const totalPages = Math.max(1, Math.ceil(totalReviews / PAGE_SIZE));

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Ratings"
        title="Reviews dashboard"
        description="Track customer feedback, restaurant-wise averages, food quality, and delivery experience."
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Total reviews" value={totalReviews} />
        <StatCard label="Food average" value={ratingText(overall._avg.foodRating)} />
        <StatCard label="Delivery average" value={ratingText(overall._avg.deliveryRating)} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[380px_1fr]">
        <SectionCard title="Restaurant averages" description="Food and delivery ratings grouped by restaurant." bodyClassName="p-0">
          <div className="divide-y divide-neutral-100">
            {restaurantRows.map((row) => (
              <div key={row.name} className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{row.name}</p>
                  <Badge>{row.count} reviews</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <p className="text-xs font-medium text-neutral-500">Food</p>
                    <p className="mt-1 text-2xl font-bold">{ratingText(row.food)}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <p className="text-xs font-medium text-neutral-500">Delivery</p>
                    <p className="mt-1 text-2xl font-bold">{ratingText(row.delivery)}</p>
                  </div>
                </div>
              </div>
            ))}
            {!restaurantRows.length ? <div className="p-8 text-center text-neutral-500">No ratings yet.</div> : null}
          </div>
        </SectionCard>

        <SectionCard title="Latest reviews" description="Customer comments with order context, newest first." bodyClassName="p-0">
          <div className="divide-y divide-neutral-100">
            {ratings.map((rating) => (
              <div key={rating.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{rating.order.customerName}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {rating.order.restaurant.name} · {rating.order.trackingCode} · {formatIstDateTime(rating.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="amber">Food {rating.foodRating}/5</Badge>
                    <Badge tone="green">Delivery {rating.deliveryRating}/5</Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm text-neutral-600">{rating.review || "No written review."}</p>
                <p className="mt-3 text-xs text-neutral-400">
                  Items: {rating.order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}
                </p>
              </div>
            ))}
            {!ratings.length ? <div className="p-8 text-center text-neutral-500">No customer reviews yet.</div> : null}
          </div>
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <Pager basePath="/admin/ratings" params={{}} page={page} totalPages={totalPages} total={totalReviews} shown={ratings.length} noun="reviews" />
          </div>
        </SectionCard>
      </div>
    </PageContainer>
  );
}
