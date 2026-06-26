import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { DiscountsManager } from "@/components/admin/DiscountsManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage() {
  const restaurants = await prisma.restaurant.findMany({
    include: { menuItems: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" }
  });

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Offers"
        title="Item discounts"
        description="Control per-item discounts restaurant-wise with quick presets."
      />
      <DiscountsManager initialRestaurants={restaurants} />
    </PageContainer>
  );
}
