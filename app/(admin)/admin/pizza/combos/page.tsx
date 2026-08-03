import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaCombosManager } from "@/components/admin/PizzaCombosManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SHOP_SLUG = "dominos-pizza";

export default async function AdminPizzaCombosPage() {
  const shop = await prisma.restaurant.findUnique({
    where: { slug: SHOP_SLUG },
    include: {
      menuItems: { orderBy: { name: "asc" } },
      combos: { include: { items: { include: { menuItem: true } } }, orderBy: { sortOrder: "asc" } }
    }
  });

  if (!shop) notFound();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Domino's Pizza"
        title="Combos"
        description="Bundle menu items into a fixed-price deal customers see first."
      />
      <PizzaCombosManager restaurant={{ id: shop.id, menuItems: shop.menuItems, combos: shop.combos }} />
    </PageContainer>
  );
}
