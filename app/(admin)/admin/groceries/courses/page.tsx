import { notFound } from "next/navigation";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { PizzaCoursesManager } from "@/components/admin/PizzaCoursesManager";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GROCERIES_SLUG } from "@/lib/whatsapp-shops";

export const dynamic = "force-dynamic";

export default async function AdminGroceriesCoursesPage() {
  await requireRole(["ADMIN"]);
  const shop = await prisma.restaurant.findUnique({
    where: { slug: GROCERIES_SLUG },
    include: { courses: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { items: true } } } } }
  });

  if (!shop) notFound();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Snacks"
        title="Courses"
        description="Menu sections that group items. Order controls how they appear on the customer page."
      />
      <PizzaCoursesManager
        restaurantId={shop.id}
        initialCourses={shop.courses.map((course) => ({ id: course.id, name: course.name, sortOrder: course.sortOrder, itemCount: course._count.items }))}
      />
    </PageContainer>
  );
}
