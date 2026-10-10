"use client";

import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { SettingsSection } from "@/components/admin/SettingsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FEATURES } from "@/lib/features";
import {
  type CampusDraft,
  type CampusForm,
  campusFromDraft,
  draftFromCampus,
  isCampusDraftDirty,
  sampleOrderTotalPaise
} from "@/lib/admin-settings";
import { cn, formatPaise } from "@/lib/utils";

export type Campus = CampusForm;

async function postCampus(campus: CampusForm) {
  const response = await fetch("/api/admin/campuses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: campus.id,
      name: campus.name,
      active: campus.active,
      platformFeePaise: campus.platformFeePaise,
      hostelDeliveryFeePaise: campus.hostelDeliveryFeePaise,
      hostelDeliveryEnabled: campus.hostelDeliveryEnabled,
      hostelDeliveryNightOnly: campus.hostelDeliveryNightOnly,
      paymentChargePercentBps: campus.paymentChargePercentBps,
      paymentChargeFixedPaise: campus.paymentChargeFixedPaise
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not save campus");
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-bold text-[#3f4046]">
      {label}
      <span className="mt-1.5 block">{children}</span>
      {error ? <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs font-medium text-neutral-500">{hint}</span> : null}
    </label>
  );
}

function Choice({ options, value, onChange }: { options: { label: string; value: boolean; tone?: "destructive" }[]; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        // Short labels, no wrapping and tight side padding so both fit side by side at 320px.
        <Button key={option.label} type="button" aria-pressed={value === option.value} variant={value === option.value ? (option.tone ?? "default") : "outline"} onClick={() => onChange(option.value)} className="min-w-0 whitespace-nowrap px-2">
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function CampusesManager({ initialCampuses }: { initialCampuses: Campus[] }) {
  const [saved, setSaved] = useState(initialCampuses);
  const [drafts, setDrafts] = useState<Record<string, CampusDraft>>(() => Object.fromEntries(initialCampuses.map((campus) => [campus.id, draftFromCampus(campus)])));
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const rows = saved.map((campus) => {
    const draft = drafts[campus.id] ?? draftFromCampus(campus);
    return { saved: campus, draft, ...campusFromDraft(campus, draft), dirty: isCampusDraftDirty(campus, draft) };
  });
  const dirty = rows.some((row) => row.dirty);
  const hasProblems = rows.some((row) => Object.keys(row.problems).length > 0);

  function edit(id: string, changes: Partial<CampusDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  }

  function discard() {
    setDrafts(Object.fromEntries(saved.map((campus) => [campus.id, draftFromCampus(campus)])));
  }

  async function save() {
    const changed = rows.filter((row) => row.dirty);
    const hiding = changed.filter((row) => row.saved.active && !row.campus.active);
    if (hiding.length) {
      const names = hiding.map((row) => row.saved.name).join(" and ");
      const ok = await confirm({
        title: `Hide ${names} from customers?`,
        description: "Customers will no longer be able to choose it when they order. Orders already placed are not affected.",
        confirmLabel: "Hide it",
        destructive: true
      });
      if (!ok) return;
    }

    setSaving(true);
    const failures: string[] = [];
    let done = 0;
    for (const row of changed) {
      try {
        await postCampus(row.campus);
        setSaved((current) => current.map((campus) => (campus.id === row.campus.id ? row.campus : campus)));
        setDrafts((current) => ({ ...current, [row.campus.id]: draftFromCampus(row.campus) }));
        done += 1;
      } catch (error) {
        failures.push(`${row.saved.name}: ${error instanceof Error ? error.message : "could not save"}`);
      }
    }
    setSaving(false);
    if (done) toast.success(done === 1 ? "Campus saved" : `${done} campuses saved`);
    if (failures.length) toast.error(failures.join(" / "));
  }

  return (
    <>
      <SettingsSection
        id="campuses"
        title="Campuses and fees"
        description="Each campus sets its own platform fee and payment handling, and whether customers can see it. Restaurants and menus are shared across campuses."
        dirty={dirty}
        saving={saving}
        problem={hasProblems ? "Fix the highlighted boxes before saving." : null}
        onSave={save}
        onDiscard={discard}
        saveLabel="Save campuses"
      >
        {rows.length === 0 ? (
          <EmptyState title="No campuses yet" description="Orders cannot be priced until a campus is set up." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ saved: base, draft, campus, problems, dirty: cardDirty }) => {
              // Hostel delivery needs the delivery portal. While it is off the controls stay out
              // of the way, except on a campus that still has it switched on so it can be turned off.
              const showHostel = FEATURES.deliveryPortal || base.hostelDeliveryEnabled || draft.hostelDeliveryEnabled;
              return (
                <div key={base.id} className={cn("min-w-0 space-y-4 rounded-lg border p-4", cardDirty ? "border-amber-300 bg-amber-50/40" : "border-black/10")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black">{base.name}</h3>
                      <p className="text-xs text-neutral-500">{base.code} · {base.orderCount} order{base.orderCount === 1 ? "" : "s"}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black", draft.active ? "bg-[#34705a]/10 text-[#2b6e56]" : "bg-[#f3f4f6] text-[#85878e]")}>
                      <GraduationCap size={13} /> {draft.active ? "Live" : "Hidden"}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Platform fee (₹)" error={problems.platformFee}>
                      <Input inputMode="decimal" value={draft.platformFee} onChange={(event) => edit(base.id, { platformFee: event.target.value })} aria-invalid={Boolean(problems.platformFee)} className={problems.platformFee ? "border-red-400" : undefined} />
                    </Field>
                    <Field label="Payment handling (%)" hint="Added to online payments." error={problems.paymentPercent}>
                      <Input inputMode="decimal" value={draft.paymentPercent} onChange={(event) => edit(base.id, { paymentPercent: event.target.value })} aria-invalid={Boolean(problems.paymentPercent)} className={problems.paymentPercent ? "border-red-400" : undefined} />
                    </Field>
                    {showHostel ? (
                      <Field label="Hostel delivery fee (₹)" error={problems.hostelDeliveryFee}>
                        <Input inputMode="decimal" value={draft.hostelDeliveryFee} onChange={(event) => edit(base.id, { hostelDeliveryFee: event.target.value })} aria-invalid={Boolean(problems.hostelDeliveryFee)} className={problems.hostelDeliveryFee ? "border-red-400" : undefined} />
                      </Field>
                    ) : null}
                    <div className="text-sm font-bold text-[#3f4046]">
                      Shown to customers
                      <div className="mt-1.5">
                        <Choice value={draft.active} onChange={(active) => edit(base.id, { active })} options={[{ label: "Live", value: true }, { label: "Hidden", value: false, tone: "destructive" }]} />
                      </div>
                    </div>
                    {showHostel ? (
                      <div className="text-sm font-bold text-[#3f4046]">
                        Hostel delivery
                        <div className="mt-1.5">
                          <Choice value={draft.hostelDeliveryEnabled} onChange={(hostelDeliveryEnabled) => edit(base.id, { hostelDeliveryEnabled })} options={[{ label: "Available", value: true }, { label: "Coming soon", value: false, tone: "destructive" }]} />
                        </div>
                      </div>
                    ) : null}
                    {showHostel && draft.hostelDeliveryEnabled ? (
                      <div className="text-sm font-bold text-[#3f4046] sm:col-span-2">
                        Hostel delivery slots
                        <div className="mt-1.5">
                          <Choice value={draft.hostelDeliveryNightOnly} onChange={(hostelDeliveryNightOnly) => edit(base.id, { hostelDeliveryNightOnly })} options={[{ label: "Night only", value: true }, { label: "Both slots", value: false }]} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <p className="rounded-lg bg-[#f3f4f6] px-3 py-2 text-xs leading-5 text-[#70727a]">
                    A ₹200 order here costs the customer{" "}
                    <span className="font-black text-[#202126]">{formatPaise(sampleOrderTotalPaise(campus))}</span>{" "}
                    (gate pickup). Razorpay takes about 2.36% of that.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>
      {confirmDialog}
    </>
  );
}
