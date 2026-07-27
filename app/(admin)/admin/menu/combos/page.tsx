import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { CombosManager } from "@/components/admin/CombosManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminCombosPage() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      menuItems: { orderBy: { name: "asc" } },
      combos: {
        include: { items: { include: { menuItem: true } } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
      }
    },
    orderBy: { name: "asc" }
  });

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Combos"
        description="Bundle a few dishes from one restaurant into a single fixed-price combo. Customers see combos first when they open that restaurant."
      />
      <CombosManager initialRestaurants={restaurants} />
    </PageContainer>
  );
}
