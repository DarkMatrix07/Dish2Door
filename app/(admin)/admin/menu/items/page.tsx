import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { ItemsManager } from "@/components/admin/ItemsManager";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { MAIN_STORE_MODE, pickRestaurantId } from "@/lib/menu-admin";

export const dynamic = "force-dynamic";

export default async function AdminMenuItemsPage({ searchParams }: { searchParams: Promise<{ restaurant?: string | string[] }> }) {
  await requireRole(["ADMIN"]);
  const { restaurant: requested } = await searchParams;

  // Only the restaurant list and its counts load here. The chosen restaurant's dishes are
  // loaded below (and the others on demand), never the whole catalogue at once.
  const [rows, soldOut] = await Promise.all([
    prisma.restaurant.findMany({
      where: { orderMode: MAIN_STORE_MODE },
      select: { id: true, name: true, _count: { select: { menuItems: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.menuItem.groupBy({
      by: ["restaurantId"],
      where: { available: false, restaurant: { orderMode: MAIN_STORE_MODE } },
      _count: { _all: true }
    })
  ]);
  const soldOutByRestaurant = new Map(soldOut.map((row) => [row.restaurantId, row._count._all]));
  const restaurants = rows.map((row) => ({
    id: row.id,
    name: row.name,
    itemCount: row._count.menuItems,
    soldOutCount: soldOutByRestaurant.get(row.id) ?? 0
  }));

  const selectedId = pickRestaurantId(typeof requested === "string" ? requested : null, restaurants.map((row) => row.id));
  const selected = selectedId
    ? await prisma.restaurant.findUnique({
        where: { id: selectedId },
        select: {
          courses: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
          menuItems: {
            select: {
              id: true,
              name: true,
              pricePaise: true,
              discountPercent: true,
              available: true,
              imageUrl: true,
              courseId: true,
              sizeLabel: true,
              sizeOrder: true,
              course: { select: { name: true } }
            },
            orderBy: { name: "asc" }
          }
        }
      })
    : null;

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Menu"
        title="Items"
        description="Set prices, discounts and stock for each restaurant's dishes. Tick items to give several a discount at once."
      />
      <ItemsManager
        restaurants={restaurants}
        initialRestaurantId={selectedId}
        initialMenu={selected ? { courses: selected.courses, items: selected.menuItems } : null}
      />
    </PageContainer>
  );
}
