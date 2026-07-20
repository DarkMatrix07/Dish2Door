"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { type Settings, minutesToTimeInput, saveSettings, timeInputToMinutes } from "@/components/admin/settings-shared";
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

        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-600">Daily ordering hours (IST)</p>
          <p className="mb-2 text-xs text-neutral-500">Customers can only place online orders within this window. Outside it (e.g. overnight), ordering is closed.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-neutral-500">
              Opens at
              <Input className="mt-1" type="time" value={minutesToTimeInput(settings.orderingOpenMinute)} onChange={(event) => setSettings({ ...settings, orderingOpenMinute: timeInputToMinutes(event.target.value) })} />
            </label>
            <label className="text-xs font-semibold text-neutral-500">
              Closes at
              <Input className="mt-1" type="time" value={minutesToTimeInput(settings.orderingCloseMinute)} onChange={(event) => setSettings({ ...settings, orderingCloseMinute: timeInputToMinutes(event.target.value) })} />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-600">Discount wheel</p>
          <p className="mb-2 text-xs text-neutral-500">
            By default the spin wheel is only offered to regulars (3–6 reviewed orders). Turn this on to offer a
            spin to every customer at checkout, regardless of how many orders they&apos;ve placed.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={settings.spinWheelForEveryone ? "default" : "outline"}
              onClick={() => setSettings({ ...settings, spinWheelForEveryone: true })}
            >
              Everyone
            </Button>
            <Button
              variant={!settings.spinWheelForEveryone ? "default" : "outline"}
              onClick={() => setSettings({ ...settings, spinWheelForEveryone: false })}
            >
              Regulars only
            </Button>
          </div>
        </div>

        <Button disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </SectionCard>
  );
}
