import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { StoreSettingsManager } from "@/components/admin/StoreSettingsManager";
import { pickSettings } from "@/lib/admin-settings";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireRole(["ADMIN"]);
  const [settings, campuses, counts] = await Promise.all([
    getSettings(),
    prisma.campus.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    // Orders per campus gives a quick sense of where volume actually is.
    prisma.order.groupBy({ by: ["campusId"], _count: { _all: true } })
  ]);
  const orderCounts = Object.fromEntries(counts.map((row) => [row.campusId ?? "", row._count._all]));

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Settings"
        title="Settings"
        description="Ordering hours, delivery slot times, campus fees, notification channels and the discount wheel promo. Each section has its own Save button."
      />
      <StoreSettingsManager
        initialSettings={pickSettings(settings)}
        notifyEmail={settings.notifyEmail}
        notifyWhatsapp={settings.notifyWhatsapp}
        campuses={campuses.map((campus) => ({
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
