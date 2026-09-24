import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { RestaurantsManager } from "@/components/admin/RestaurantsManager";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantsPage() {
  await requireRole(["ADMIN"]);
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
