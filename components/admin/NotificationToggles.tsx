"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Mail, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { SettingsSection, SwitchRow } from "@/components/admin/SettingsSection";

type Channels = { notifyEmail: boolean; notifyWhatsapp: boolean };

export function NotificationToggles({ initialEmail, initialWhatsapp }: { initialEmail: boolean; initialWhatsapp: boolean }) {
  const [saved, setSaved] = useState<Channels>({ notifyEmail: initialEmail, notifyWhatsapp: initialWhatsapp });
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = draft.notifyEmail !== saved.notifyEmail || draft.notifyWhatsapp !== saved.notifyWhatsapp;

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not update notifications");
      const next = { notifyEmail: Boolean(data.notifyEmail), notifyWhatsapp: Boolean(data.notifyWhatsapp) };
      setSaved(next);
      setDraft(next);
      toast.success("Notification settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update notifications");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      id="notifications"
      title="Notification channels"
      description="Choose how customers hear about their orders. Telegram alerts to you stay on all the time."
      dirty={dirty}
      saving={saving}
      onSave={save}
      onDiscard={() => setDraft(saved)}
      saveLabel="Save channels"
    >
      <div className="space-y-3">
        <SwitchRow
          icon={<Mail size={18} />}
          title="Email"
          description={draft.notifyEmail ? "Customers get order updates by email." : "Email is off. No order emails are sent."}
          on={draft.notifyEmail}
          onChange={(notifyEmail) => setDraft({ ...draft, notifyEmail })}
          disabled={saving}
        />
        <SwitchRow
          icon={<MessageCircle size={18} />}
          title="WhatsApp"
          description={draft.notifyWhatsapp ? "Customers get order updates on WhatsApp." : "WhatsApp is off. No order messages are sent."}
          on={draft.notifyWhatsapp}
          onChange={(notifyWhatsapp) => setDraft({ ...draft, notifyWhatsapp })}
          disabled={saving}
        />
        <div className="flex items-center justify-between gap-4 rounded-lg bg-[#171713] p-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 text-[#f6b73c]"><Send size={18} /></span>
            <div className="min-w-0"><p className="font-black">Telegram</p><p className="mt-1 text-xs text-white/45">Admin alerts are always on</p></div>
          </div>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f6b73c] text-[#171713]"><Check size={14} strokeWidth={3} /></span>
        </div>
      </div>
      <p className="text-sm text-neutral-500">
        To see what was sent and retry anything that failed, open the{" "}
        <Link href="/admin/notifications" className="font-bold text-[#b65a20] underline-offset-2 hover:underline">notification log</Link>.
      </p>
    </SettingsSection>
  );
}
