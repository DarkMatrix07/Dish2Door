import { type Settings, pickSettings } from "@/lib/admin-settings";

export type { Settings };

// The settings API requires the full object, so callers pass a complete one
// (lib/admin-settings.ts builds it from the saved values plus one section's edits).
export async function saveSettings(settings: Settings): Promise<Settings> {
  const response = await fetch("/api/admin/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not save settings");
  return pickSettings(data.settings as Settings);
}
