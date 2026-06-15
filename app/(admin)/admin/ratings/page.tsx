import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function ratingText(value: number) {
  return value ? value.toFixed(1) : "0.0";
}

export default async function AdminRatingsPage() {
  const ratings = await prisma.rating.findMany({
    include: {
      order: {
        include: {
          restaurant: true,
          items: true,
          deliveredBy: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 80
  });

  const byRestaurant = new Map<string, typeof ratings>();
  for (const rating of ratings) {
    const key = rating.order.restaurant.name;
    byRestaurant.set(key, [...(byRestaurant.get(key) ?? []), rating]);
  }

  const restaurantRows = Array.from(byRestaurant.entries()).map(([name, rows]) => ({
    name,
    count: rows.length,
    food: avg(rows.map((row) => row.foodRating)),
    delivery: avg(rows.map((row) => row.deliveryRating))
  }));

  const foodAverage = avg(ratings.map((rating) => rating.foodRating));
  const deliveryAverage = avg(ratings.map((rating) => rating.deliveryRating));

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader
        eyebrow="Ratings"
        title="Reviews dashboard"
        description="Track customer feedback, restaurant-wise averages, food quality, and delivery experience."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Total reviews", ratings.length],
          ["Food average", ratingText(foodAverage)],
          ["Delivery average", ratingText(deliveryAverage)]
        ].map(([label, value]) => (
          <Card key={label} className="border-0 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit overflow-hidden border-0 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5">
            <h3 className="text-xl font-black">Restaurant averages</h3>
            <p className="mt-1 text-sm text-neutral-500">Food and delivery ratings grouped by restaurant.</p>
          </div>
          <div className="divide-y divide-neutral-100">
            {restaurantRows.map((row) => (
              <div key={row.name} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{row.name}</p>
                  <Badge>{row.count} reviews</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <p className="text-xs font-bold text-neutral-500">Food</p>
                    <p className="mt-1 text-2xl font-black">{ratingText(row.food)}</p>
                  </div>
                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <p className="text-xs font-bold text-neutral-500">Delivery</p>
                    <p className="mt-1 text-2xl font-black">{ratingText(row.delivery)}</p>
                  </div>
                </div>
              </div>
            ))}
            {!restaurantRows.length ? <div className="p-8 text-center text-neutral-500">No ratings yet.</div> : null}
          </div>
        </Card>

        <Card className="overflow-hidden border-0 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5">
            <h3 className="text-xl font-black">Latest reviews</h3>
            <p className="mt-1 text-sm text-neutral-500">Customer comments with order context.</p>
          </div>
          <div className="divide-y divide-neutral-100">
            {ratings.map((rating) => (
              <div key={rating.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black">{rating.order.customerName}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {rating.order.restaurant.name} - {rating.order.trackingCode}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="amber">Food {rating.foodRating}/5</Badge>
                    <Badge tone="green">Delivery {rating.deliveryRating}/5</Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm text-neutral-600">
                  {rating.review || "No written review."}
                </p>
                <p className="mt-3 text-xs text-neutral-400">
                  Items: {rating.order.items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ")}
                </p>
              </div>
            ))}
            {!ratings.length ? <div className="p-8 text-center text-neutral-500">No customer reviews yet.</div> : null}
          </div>
        </Card>
      </div>
    </section>
  );
}
