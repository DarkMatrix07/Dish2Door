import { AdminPageHeader } from "@/components/admin/AdminShell";
import { MenuManager } from "@/components/admin/MenuManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      courses: { orderBy: { sortOrder: "asc" } },
      menuItems: { include: { course: true }, orderBy: { name: "asc" } }
    },
    orderBy: { name: "asc" }
  });

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Menu management"
        description="Create restaurants, polish customer-facing profiles, organize courses, and control item availability."
      />
      <MenuManager initialRestaurants={restaurants} />
    </section>
  );
}
