import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaStatRow } from "@/components/admin/PizzaStatRow";
import { PizzaStoreManager } from "@/components/admin/PizzaStoreManager";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SHOP_SLUG = "dominos-pizza";

export default async function AdminPizzaStorePage() {
  await requireRole(["ADMIN"]);
  const [shop, campuses] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { slug: SHOP_SLUG },
      include: { _count: { select: { courses: true, menuItems: true, combos: true } } }
    }),
    prisma.campus.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
  ]);

  if (!shop) notFound();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Domino's Pizza"
        title="Store"
        description="Open/close the shop for orders, and keep its customer-facing profile up to date."
      />
      <PizzaStatRow
        stats={[
          { label: "Courses", value: shop._count.courses },
          { label: "Menu items", value: shop._count.menuItems },
          { label: "Combos", value: shop._count.combos }
        ]}
      />
      <PizzaStoreManager
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
