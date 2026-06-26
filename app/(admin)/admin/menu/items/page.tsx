import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { ItemsManager } from "@/components/admin/ItemsManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminMenuItemsPage() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      courses: { orderBy: { sortOrder: "asc" } },
      menuItems: { include: { course: true }, orderBy: { name: "asc" } }
    },
    orderBy: { name: "asc" }
  });

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Menu items"
        description="Add items, set prices and discounts, manage stock, and update images per restaurant."
      />
      <ItemsManager initialRestaurants={restaurants} />
    </PageContainer>
  );
}
