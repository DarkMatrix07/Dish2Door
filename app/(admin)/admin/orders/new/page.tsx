import Link from "next/link";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { ManualOrderForm } from "@/components/admin/ManualOrderForm";
import { linkButtonClasses } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewManualOrderPage() {
  await requireRole(["ADMIN"]);
  const campuses = await prisma.campus.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  const restaurants = await prisma.restaurant.findMany({
    where: { active: true },
    include: {
      courses: { orderBy: { sortOrder: "asc" } },
      menuItems: { where: { available: true }, orderBy: { name: "asc" } }
    },
    orderBy: { name: "asc" }
  });

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Fulfilment"
        title="New manual order"
        description="Create a counter order for phone, cash, or direct UPI customers without Razorpay."
      >
        <Link href="/admin/orders" className={linkButtonClasses("outline", "sm")}>
          Back to today&apos;s orders
        </Link>
      </AdminPageHeader>
      <ManualOrderForm restaurants={restaurants} campuses={campuses} />
    </PageContainer>
  );
}
