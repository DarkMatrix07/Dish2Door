import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaStatRow } from "@/components/admin/PizzaStatRow";
import { PizzaStoreManager } from "@/components/admin/PizzaStoreManager";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GROCERIES_SLUG } from "@/lib/whatsapp-shops";

export const dynamic = "force-dynamic";

export default async function AdminGroceriesStorePage() {
  await requireRole(["ADMIN"]);
  const [shop, campuses] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { slug: GROCERIES_SLUG },
      include: { _count: { select: { courses: true, menuItems: true, combos: true } } }
    }),
    prisma.campus.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
  ]);

  if (!shop) notFound();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Snacks"
        title="Store"
        description="Open or close the shop for orders, and keep its customer-facing profile up to date."
      />
      <PizzaStatRow
        stats={[
          { label: "Courses", value: shop._count.courses },
          { label: "Menu items", value: shop._count.menuItems },
          { label: "Combos", value: shop._count.combos }
        ]}
      />
      <PizzaStoreManager
        imageFallback="/dish-placeholder.webp"
        initialShop={{
          id: shop.id,
          slug: shop.slug,
          name: shop.name,
          description: shop.description,
          imageUrl: shop.imageUrl,
          acceptingOrders: shop.acceptingOrders,
          whatsappNumber: shop.whatsappNumber,
          restrictedToCampusCode: shop.restrictedToCampusCode
        }}
        campuses={campuses.map((campus) => ({ code: campus.code, name: campus.name }))}
      />
    </PageContainer>
  );
}
