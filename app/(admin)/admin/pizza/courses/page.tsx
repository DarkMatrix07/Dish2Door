import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaCoursesManager } from "@/components/admin/PizzaCoursesManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SHOP_SLUG = "dominos-pizza";

export default async function AdminPizzaCoursesPage() {
  const shop = await prisma.restaurant.findUnique({
    where: { slug: SHOP_SLUG },
    include: { courses: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { items: true } } } } }
  });

  if (!shop) notFound();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Domino's Pizza"
        title="Courses"
        description="Menu sections that group items. Order controls how they appear on the customer menu."
      />
      <PizzaCoursesManager
        restaurantId={shop.id}
        initialCourses={shop.courses.map((course) => ({ id: course.id, name: course.name, sortOrder: course.sortOrder, itemCount: course._count.items }))}
      />
    </PageContainer>
  );
}
