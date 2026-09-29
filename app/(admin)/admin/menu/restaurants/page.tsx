import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { RestaurantsManager } from "@/components/admin/RestaurantsManager";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { MAIN_STORE_MODE } from "@/lib/menu-admin";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantsPage() {
  await requireRole(["ADMIN"]);
  // Main store only: Domino's is managed from its own section.
  const rows = await prisma.restaurant.findMany({
    where: { orderMode: MAIN_STORE_MODE },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      active: true,
      courses: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
      _count: { select: { menuItems: true, combos: true, orders: true } }
    },
    orderBy: { name: "asc" }
  });
  const restaurants = rows.map(({ _count, ...restaurant }) => ({
    ...restaurant,
    itemCount: _count.menuItems,
    comboCount: _count.combos,
    orderCount: _count.orders
  }));

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Menu"
        title="Restaurants"
        description="Add restaurants, update what customers see, and arrange their courses. To stop taking orders for a restaurant, switch it off."
      />
      <RestaurantsManager initialRestaurants={restaurants} />
    </PageContainer>
  );
}
