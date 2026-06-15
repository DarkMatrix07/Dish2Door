import { AdminPageHeader } from "@/components/admin/AdminShell";
import { SettingsManager } from "@/components/admin/SettingsManager";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getSettings();

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader
        eyebrow="Settings"
        title="System settings"
        description="Control public ordering state, customer closure copy, contact details, and checkout fee rules."
      />
      <SettingsManager initialSettings={settings} />
    </section>
  );
}
