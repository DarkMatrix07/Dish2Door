"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Settings = {
  ordersOpen: boolean;
  closedMessage: string;
  contactNumber: string;
  platformFeePaise: number;
  hostelDeliveryFeePaise: number;
  paymentChargePercentBps: number;
  paymentChargeFixedPaise: number;
};

function paiseToRupees(value: number) {
  return String(value / 100);
}

function rupeesToPaise(value: string) {
  return Math.round(Number(value || 0) * 100);
}

export function SettingsManager({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save settings");
      setSettings(data.settings);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card className="h-fit border-0 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black">Public ordering</h3>
            <p className="mt-1 text-sm text-neutral-500">This controls what customers see before ordering.</p>
          </div>
          <Badge tone={settings.ordersOpen ? "green" : "red"}>{settings.ordersOpen ? "Open" : "Closed"}</Badge>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant={settings.ordersOpen ? "default" : "outline"} onClick={() => setSettings({ ...settings, ordersOpen: true })}>Open</Button>
          <Button variant={!settings.ordersOpen ? "destructive" : "outline"} onClick={() => setSettings({ ...settings, ordersOpen: false })}>Close</Button>
        </div>
        <label className="mt-5 block text-sm font-bold text-neutral-600">
          Closed message
          <Textarea className="mt-2" value={settings.closedMessage} onChange={(event) => setSettings({ ...settings, closedMessage: event.target.value })} />
        </label>
        <label className="mt-4 block text-sm font-bold text-neutral-600">
          Contact number shown when closed
          <Input className="mt-2" value={settings.contactNumber} onChange={(event) => setSettings({ ...settings, contactNumber: event.target.value })} />
        </label>
      </Card>

      <Card className="border-0 bg-white p-5 shadow-sm">
        <div className="border-b border-neutral-100 pb-5">
          <h3 className="text-xl font-black">Fee configuration</h3>
          <p className="mt-1 text-sm text-neutral-500">Stored in paise internally, edited here in readable INR values.</p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-neutral-600">
            Platform fee INR
            <Input
              className="mt-2"
              type="number"
              min={0}
              value={paiseToRupees(settings.platformFeePaise)}
              onChange={(event) => setSettings({ ...settings, platformFeePaise: rupeesToPaise(event.target.value) })}
            />
          </label>
          <label className="text-sm font-bold text-neutral-600">
            Hostel delivery fee INR
            <Input
              className="mt-2"
              type="number"
              min={0}
              value={paiseToRupees(settings.hostelDeliveryFeePaise)}
              onChange={(event) => setSettings({ ...settings, hostelDeliveryFeePaise: rupeesToPaise(event.target.value) })}
            />
          </label>
          <label className="text-sm font-bold text-neutral-600">
            Razorpay charge percent
            <Input
              className="mt-2"
              type="number"
              min={0}
              step="0.01"
              value={settings.paymentChargePercentBps / 100}
              onChange={(event) => setSettings({ ...settings, paymentChargePercentBps: Math.round(Number(event.target.value || 0) * 100) })}
            />
          </label>
          <label className="text-sm font-bold text-neutral-600">
            Razorpay fixed fee INR
            <Input
              className="mt-2"
              type="number"
              min={0}
              value={paiseToRupees(settings.paymentChargeFixedPaise)}
              onChange={(event) => setSettings({ ...settings, paymentChargeFixedPaise: rupeesToPaise(event.target.value) })}
            />
          </label>
        </div>
        <div className="mt-6 rounded-3xl bg-[#fffaf1] p-5 text-sm text-neutral-600">
          <p className="font-black text-neutral-950">Checkout calculation preview</p>
          <p className="mt-2">Customers pay item subtotal, coupon discount if any, platform fee, hostel delivery fee if selected, and payment handling fee.</p>
        </div>
        <Button className="mt-5" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save settings"}</Button>
      </Card>
    </div>
  );
}
