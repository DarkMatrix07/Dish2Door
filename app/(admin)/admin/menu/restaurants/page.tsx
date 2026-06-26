import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { RestaurantsManager } from "@/components/admin/RestaurantsManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantsPage() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      courses: { orderBy: { sortOrder: "asc" } },
      menuItems: { select: { id: true } }
    },
    orderBy: { name: "asc" }
  });

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Restaurants"
        description="Create restaurants, polish customer-facing profiles, and organize courses."
      />
      <RestaurantsManager initialRestaurants={restaurants} />
    </PageContainer>
  );
}
