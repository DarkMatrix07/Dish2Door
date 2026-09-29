import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { DeliveryPersonsManager } from "@/components/admin/DeliveryPersonsManager";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryPersonsPage() {
  await requireRole(["ADMIN"]);
  if (!FEATURES.deliveryPortal) redirect("/admin");
  const users = await prisma.user.findMany({
    where: { role: "DELIVERY" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      assignedHostelBlocks: true,
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
