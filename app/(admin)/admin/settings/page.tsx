import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { StoreSettingsManager } from "@/components/admin/StoreSettingsManager";
import { getSettings } from "@/lib/settings";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminStoreSettingsPage() {
  await requireRole(["ADMIN"]);
  const settings = await getSettings();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Settings"
        title="Store & ordering"
        description="Control public ordering state, customer closure copy, and contact details."
      />
      <StoreSettingsManager initialSettings={settings} />
    </PageContainer>
  );
}
