import { AdminPageHeader } from "@/components/admin/AdminShell";
import { ModerationManager } from "@/components/admin/ModerationManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminModerationPage() {
  const [restaurants, coupons] = await Promise.all([
    prisma.restaurant.findMany({
      include: {
        menuItems: { orderBy: { name: "asc" } }
      },
      orderBy: { name: "asc" }
    }),
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader
        eyebrow="Moderation"
        title="Offers and coupons"
        description="Control item discounts restaurant-wise, generate coupon codes, set validity, and watch usage."
      />
      <ModerationManager initialRestaurants={restaurants} initialCoupons={coupons} />
    </section>
  );
}
