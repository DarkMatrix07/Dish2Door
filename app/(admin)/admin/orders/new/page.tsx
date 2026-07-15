import Link from "next/link";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { ManualOrderForm } from "@/components/admin/ManualOrderForm";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewManualOrderPage() {
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
        <Link href="/admin/orders">
          <Button variant="outline" size="sm">
            Back to orders
          </Button>
        </Link>
      </AdminPageHeader>
      <ManualOrderForm restaurants={restaurants} />
    </PageContainer>
  );
}
