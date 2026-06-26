import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { DeliveryPersonsManager } from "@/components/admin/DeliveryPersonsManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryPersonsPage() {
  const users = await prisma.user.findMany({
    where: { role: "DELIVERY" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      createdAt: true,
      _count: { select: { deliveries: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Delivery"
        title="Delivery persons"
        description="Create delivery logins, edit contact details, reset passwords, and control active access."
      />
      <DeliveryPersonsManager initialUsers={users} />
    </PageContainer>
  );
}
