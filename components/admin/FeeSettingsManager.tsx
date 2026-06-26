"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { type Settings, paiseToRupees, rupeesToPaise, saveSettings } from "@/components/admin/settings-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FeeSettingsManager({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      setSettings(await saveSettings(settings));
      toast.success("Fees saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save fees");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Fee configuration" description="Stored in paise internally, edited here in readable INR values.">
      <div className="max-w-2xl space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-neutral-600">
            Platform fee (INR)
            <Input
              className="mt-2"
              type="number"
              min={0}
              value={paiseToRupees(settings.platformFeePaise)}
              onChange={(event) => setSettings({ ...settings, platformFeePaise: rupeesToPaise(event.target.value) })}
            />
          </label>
          <label className="text-sm font-semibold text-neutral-600">
            Hostel delivery fee (INR)
            <Input
              className="mt-2"
              type="number"
              min={0}
              value={paiseToRupees(settings.hostelDeliveryFeePaise)}
              onChange={(event) => setSettings({ ...settings, hostelDeliveryFeePaise: rupeesToPaise(event.target.value) })}
            />
          </label>
          <label className="text-sm font-semibold text-neutral-600">
            Razorpay charge (%)
            <Input
              className="mt-2"
              type="number"
              min={0}
              step="0.01"
              value={settings.paymentChargePercentBps / 100}
              onChange={(event) => setSettings({ ...settings, paymentChargePercentBps: Math.round(Number(event.target.value || 0) * 100) })}
            />
          </label>
          <label className="text-sm font-semibold text-neutral-600">
            Razorpay fixed fee (INR)
            <Input
              className="mt-2"
              type="number"
              min={0}
              value={paiseToRupees(settings.paymentChargeFixedPaise)}
              onChange={(event) => setSettings({ ...settings, paymentChargeFixedPaise: rupeesToPaise(event.target.value) })}
            />
          </label>
        </div>

        <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">
          <p className="font-semibold text-neutral-900">Checkout calculation</p>
          <p className="mt-1">Customers pay: item subtotal − coupon discount + platform fee + hostel delivery fee (if selected) + payment handling fee.</p>
        </div>

        <Button disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save fees"}
        </Button>
      </div>
    </SectionCard>
  );
}
