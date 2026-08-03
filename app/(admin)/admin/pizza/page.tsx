import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer, StatCard } from "@/components/admin/AdminShell";
import { PizzaStoreManager } from "@/components/admin/PizzaStoreManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SHOP_SLUG = "dominos-pizza";

export default async function AdminPizzaStorePage() {
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
      <div className="grid gap-3 min-[430px]:grid-cols-3 sm:gap-4">
        <StatCard label="Courses" value={shop._count.courses} />
        <StatCard label="Menu items" value={shop._count.menuItems} />
        <StatCard label="Combos" value={shop._count.combos} />
      </div>
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
