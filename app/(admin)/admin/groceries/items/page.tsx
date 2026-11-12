import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaItemsManager } from "@/components/admin/PizzaItemsManager";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GROCERIES_SLUG } from "@/lib/whatsapp-shops";

export const dynamic = "force-dynamic";

export default async function AdminGroceriesItemsPage() {
  await requireRole(["ADMIN"]);
  const shop = await prisma.restaurant.findUnique({
    where: { slug: GROCERIES_SLUG },
    include: {
      courses: { orderBy: { sortOrder: "asc" } },
      menuItems: { include: { course: true }, orderBy: { name: "asc" } }
    }
  });

  if (!shop) notFound();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Groceries"
        title="Menu items"
        description="Add items, set prices and discounts, manage stock, and update images."
      />
      <PizzaItemsManager
        imageFallback="/dish-placeholder.webp"
        restaurant={{ id: shop.id, courses: shop.courses, menuItems: shop.menuItems }}
      />
    </PageContainer>
  );
}
