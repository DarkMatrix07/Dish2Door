"use client";

import { useEffect, type ReactNode } from "react";
import { SectionCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One block of the Settings page. Every block saves on its own, says plainly when it holds
// changes that are not saved yet, and asks the browser before the tab is closed with such
// changes still sitting in it.
export function SettingsSection({
  id,
  title,
  description,
  dirty,
  saving,
  problem,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  children
}: {
  id: string;
  title: string;
  description: string;
  dirty: boolean;
  saving: boolean;
  // A plain-words reason the changes cannot be saved yet; shown in red and blocks Save.
  problem?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <SectionCard
      id={id}
      title={title}
      description={description}
      actions={dirty ? <Badge tone="amber">Unsaved changes</Badge> : null}
      bodyClassName="space-y-5"
    >
      {children}
      {problem ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{problem}</p> : null}
      <div className="flex flex-col gap-3 border-t border-black/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm font-semibold", dirty ? "text-amber-700" : "text-neutral-400")} aria-live="polite">
          {dirty ? "You have changes that are not saved yet." : "Everything here is saved."}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {dirty ? <Button variant="outline" disabled={saving} onClick={onDiscard}>Undo changes</Button> : null}
          <Button disabled={!dirty || saving || Boolean(problem)} onClick={onSave}>{saving ? "Saving..." : saveLabel}</Button>
        </div>
      </div>
    </SectionCard>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      // The before: layer stretches the tappable area to 40px tall without changing how the switch looks.
      className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full outline-none transition before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:opacity-50", on ? "bg-[#171713]" : "bg-[#d7d9de]")}
    >
      <span className={cn("inline-block h-5 w-5 transform rounded-full shadow transition", on ? "translate-x-6 bg-[#f6b73c]" : "translate-x-1 bg-white")} />
    </button>
  );
}

// A titled on/off row: the words on the left, the switch on the right. The whole row is a
// label for the switch, so tapping anywhere on it flips the switch.
export function SwitchRow({ title, description, on, onChange, disabled, icon }: { title: string; description: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <label className={cn("flex items-center justify-between gap-4 rounded-lg bg-[#f3f4f6] p-4", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-[#555860] shadow-sm">{icon}</span> : null}
        <div className="min-w-0">
          <p className="font-black">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[#777981]">{description}</p>
        </div>
      </div>
      <Switch on={on} onChange={onChange} label={title} disabled={disabled} />
    </label>
  );
}
