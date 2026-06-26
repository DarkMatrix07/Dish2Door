"use client";

import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50",
        on ? "bg-emerald-500" : "bg-neutral-300"
      )}
    >
      <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition", on ? "translate-x-5" : "translate-x-1")} />
    </button>
  );
}

export function NotificationToggles({ initialEmail, initialWhatsapp }: { initialEmail: boolean; initialWhatsapp: boolean }) {
  const [email, setEmail] = useState(initialEmail);
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp);
  const [saving, setSaving] = useState(false);

  async function save(next: { notifyEmail: boolean; notifyWhatsapp: boolean }) {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update notifications");
      setEmail(data.notifyEmail);
      setWhatsapp(data.notifyWhatsapp);
      toast.success("Notification settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update notifications");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Notification channels" description="Turn customer notifications on or off per channel. Telegram order alerts are always on.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
              <Mail size={18} />
            </span>
            <div>
              <p className="font-semibold">Email</p>
              <p className="text-xs text-neutral-500">{email ? "Sending on order events" : "Currently disabled"}</p>
            </div>
          </div>
          <Toggle on={email} disabled={saving} onChange={() => save({ notifyEmail: !email, notifyWhatsapp: whatsapp })} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
              <MessageCircle size={18} />
            </span>
            <div>
              <p className="font-semibold">WhatsApp</p>
              <p className="text-xs text-neutral-500">{whatsapp ? "Sending on order events" : "Currently disabled"}</p>
            </div>
          </div>
          <Toggle on={whatsapp} disabled={saving} onChange={() => save({ notifyEmail: email, notifyWhatsapp: !whatsapp })} />
        </div>
      </div>
    </SectionCard>
  );
}
