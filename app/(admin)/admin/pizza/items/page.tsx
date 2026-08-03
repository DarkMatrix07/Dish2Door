import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaItemsManager } from "@/components/admin/PizzaItemsManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SHOP_SLUG = "dominos-pizza";

export default async function AdminPizzaItemsPage() {
  const shop = await prisma.restaurant.findUnique({
    where: { slug: SHOP_SLUG },
    include: {
      courses: { orderBy: { sortOrder: "asc" } },
      menuItems: { include: { course: true }, orderBy: { name: "asc" } }
    }
  });

  if (!shop) notFound();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Domino's Pizza"
        title="Menu items"
        description="Add items, set prices and discounts, manage stock, and update images."
      />
      <PizzaItemsManager
        restaurant={{ id: shop.id, courses: shop.courses, menuItems: shop.menuItems }}
      />
    </PageContainer>
  );
}
