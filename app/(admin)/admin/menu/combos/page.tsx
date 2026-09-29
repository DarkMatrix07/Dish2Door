import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { CombosManager } from "@/components/admin/CombosManager";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { MAIN_STORE_MODE } from "@/lib/menu-admin";

export const dynamic = "force-dynamic";

export default async function AdminCombosPage() {
  await requireRole(["ADMIN"]);
  // Main store only: Domino's combos are managed from the Domino's Pizza section.
  const restaurants = await prisma.restaurant.findMany({
    where: { orderMode: MAIN_STORE_MODE },
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
        eyebrow="Menu"
        title="Combos"
        description="Bundle a few dishes from one restaurant into a single fixed-price combo. Customers see combos first when they open that restaurant."
      />
      <CombosManager initialRestaurants={restaurants} />
    </PageContainer>
  );
}
