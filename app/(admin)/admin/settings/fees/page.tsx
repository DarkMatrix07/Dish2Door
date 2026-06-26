import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { FeeSettingsManager } from "@/components/admin/FeeSettingsManager";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminFeeSettingsPage() {
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
