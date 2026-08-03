import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { CampusesManager } from "@/components/admin/CampusesManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminCampusesPage() {
  const campuses = await prisma.campus.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  // Orders per campus gives a quick sense of where volume actually is.
  const counts = await prisma.order.groupBy({ by: ["campusId"], _count: { _all: true } });
  const orderCounts = Object.fromEntries(counts.map((row) => [row.campusId ?? "", row._count._all]));

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Settings"
        title="Campuses"
        description="Each campus sets its own platform fee, payment handling and hostel-delivery availability. Restaurants and menus are shared across campuses."
      />
      <CampusesManager
        initialCampuses={campuses.map((campus) => ({
          id: campus.id,
          code: campus.code,
          name: campus.name,
          active: campus.active,
          platformFeePaise: campus.platformFeePaise,
          hostelDeliveryFeePaise: campus.hostelDeliveryFeePaise,
          hostelDeliveryEnabled: campus.hostelDeliveryEnabled,
          hostelDeliveryNightOnly: campus.hostelDeliveryNightOnly,
          paymentChargePercentBps: campus.paymentChargePercentBps,
          paymentChargeFixedPaise: campus.paymentChargeFixedPaise,
          orderCount: orderCounts[campus.id] ?? 0
        }))}
      />
    </PageContainer>
  );
}
