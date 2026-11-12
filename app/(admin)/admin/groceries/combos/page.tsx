import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaCombosManager } from "@/components/admin/PizzaCombosManager";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GROCERIES_SLUG } from "@/lib/whatsapp-shops";

export const dynamic = "force-dynamic";

export default async function AdminGroceriesCombosPage() {
  await requireRole(["ADMIN"]);
  const shop = await prisma.restaurant.findUnique({
    where: { slug: GROCERIES_SLUG },
    include: {
      menuItems: { orderBy: { name: "asc" } },
      combos: { include: { items: { include: { menuItem: true } } }, orderBy: { sortOrder: "asc" } }
    }
  });

  if (!shop) notFound();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Groceries"
        title="Combos"
        description="Bundle menu items into a fixed-price deal customers see first."
      />
      <PizzaCombosManager imageFallback="/dish-placeholder.webp" restaurant={{ id: shop.id, menuItems: shop.menuItems, combos: shop.combos }} />
    </PageContainer>
  );
}
