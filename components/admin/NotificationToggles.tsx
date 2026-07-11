"use client";

import { useState } from "react";
import { Check, Mail, MessageCircle, Send } from "lucide-react";
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
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50",
        on ? "bg-[#171713]" : "bg-[#d7d9de]"
      )}
    >
      <span className={cn("inline-block h-5 w-5 transform rounded-full shadow transition", on ? "translate-x-6 bg-[#f6b73c]" : "translate-x-1 bg-white")} />
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
    <SectionCard title="Delivery channels" description="Control customer notifications. Telegram admin alerts remain permanently enabled.">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex min-h-24 items-center justify-between gap-4 rounded-lg bg-[#f3f4f6] p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[#555860] shadow-sm">
              <Mail size={18} />
            </span>
            <div>
              <p className="font-black">Email</p>
              <p className="mt-1 text-xs text-[#777981]">{email ? "Active for order events" : "Channel disabled"}</p>
            </div>
          </div>
          <Toggle on={email} disabled={saving} onChange={() => save({ notifyEmail: !email, notifyWhatsapp: whatsapp })} />
        </div>

        <div className="flex min-h-24 items-center justify-between gap-4 rounded-lg bg-[#f3f4f6] p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[#555860] shadow-sm">
              <MessageCircle size={18} />
            </span>
            <div>
              <p className="font-black">WhatsApp</p>
              <p className="mt-1 text-xs text-[#777981]">{whatsapp ? "Active for order events" : "Channel disabled"}</p>
            </div>
          </div>
          <Toggle on={whatsapp} disabled={saving} onChange={() => save({ notifyEmail: email, notifyWhatsapp: !whatsapp })} />
        </div>
        <div className="flex min-h-24 items-center justify-between gap-4 rounded-lg bg-[#171713] p-4 text-white">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-[#f6b73c]"><Send size={18} /></span><div><p className="font-black">Telegram</p><p className="mt-1 text-xs text-white/45">Admin alerts always active</p></div></div>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f6b73c] text-[#171713]"><Check size={14} strokeWidth={3} /></span>
        </div>
      </div>
    </SectionCard>
  );
}
