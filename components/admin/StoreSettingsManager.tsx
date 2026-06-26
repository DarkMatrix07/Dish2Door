"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { type Settings, saveSettings } from "@/components/admin/settings-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function StoreSettingsManager({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      setSettings(await saveSettings(settings));
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Public ordering"
      description="Controls what customers see before placing an order."
      actions={<Badge tone={settings.ordersOpen ? "green" : "red"}>{settings.ordersOpen ? "Open" : "Closed"}</Badge>}
    >
      <div className="max-w-xl space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-600">Ordering state</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={settings.ordersOpen ? "default" : "outline"} onClick={() => setSettings({ ...settings, ordersOpen: true })}>
              Open
            </Button>
            <Button variant={!settings.ordersOpen ? "destructive" : "outline"} onClick={() => setSettings({ ...settings, ordersOpen: false })}>
              Close
            </Button>
          </div>
        </div>

        <label className="block text-sm font-semibold text-neutral-600">
          Closed message
          <Textarea className="mt-2" value={settings.closedMessage} onChange={(event) => setSettings({ ...settings, closedMessage: event.target.value })} />
        </label>

        <label className="block text-sm font-semibold text-neutral-600">
          Contact number shown when closed
          <Input className="mt-2" value={settings.contactNumber} onChange={(event) => setSettings({ ...settings, contactNumber: event.target.value })} />
        </label>

        <Button disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </SectionCard>
  );
}
