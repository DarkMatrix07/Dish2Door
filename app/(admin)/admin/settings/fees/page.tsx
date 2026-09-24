import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { FeeSettingsManager } from "@/components/admin/FeeSettingsManager";
import { getSettings } from "@/lib/settings";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminFeeSettingsPage() {
  await requireRole(["ADMIN"]);
  const settings = await getSettings();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Settings"
        title="Fees"
        description="Configure platform, hostel delivery, and Razorpay handling fees applied at checkout."
      />
      <FeeSettingsManager initialSettings={settings} />
    </PageContainer>
  );
}
