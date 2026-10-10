"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CampusesManager, type Campus } from "@/components/admin/CampusesManager";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { NotificationToggles } from "@/components/admin/NotificationToggles";
import { SettingsSection, SwitchRow } from "@/components/admin/SettingsSection";
import { type Settings, saveSettings } from "@/components/admin/settings-shared";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ORDERING_FIELDS,
  SLOT_FIELDS,
  WHEEL_FIELDS,
  buildSettingsPayload,
  isSectionDirty,
  mergeSavedSection,
  minutesToTimeInput,
  slotsPastClosing,
  timeInputToMinutes,
  validateOrdering
} from "@/lib/admin-settings";
import { formatIndiaMinutes, slotTimesFrom, validateSlotTimes, type SlotTimes } from "@/lib/order-slots";

const SECTIONS = [
  { id: "ordering", label: "Ordering" },
  { id: "slots", label: "Order slots" },
  { id: "campuses", label: "Campuses and fees" },
  { id: "notifications", label: "Notification channels" },
  { id: "wheel", label: "Discount wheel promo" }
];

type SectionKey = "ordering" | "slots" | "wheel";
type FieldKeys = typeof ORDERING_FIELDS | typeof SLOT_FIELDS | typeof WHEEL_FIELDS;
type TimeField = (typeof SLOT_FIELDS)[number] | "orderingOpenMinute" | "orderingCloseMinute";

// The two delivery slots, in the owner's words. Night is what the owner calls evening orders.
const SLOT_CARDS: { slot: keyof SlotTimes; title: string; cutoff: TimeField; delivery: TimeField }[] = [
  { slot: "AFTERNOON", title: "Afternoon", cutoff: "afternoonCutoffMinute", delivery: "afternoonDeliveryMinute" },
  { slot: "NIGHT", title: "Night (evening orders)", cutoff: "nightCutoffMinute", delivery: "nightDeliveryMinute" }
];

// The whole Settings page below its header. The sections share one saved copy of the
// store settings, so saving one never overwrites another section's saved values.
export function StoreSettingsManager({
  initialSettings,
  campuses,
  notifyEmail,
  notifyWhatsapp
}: {
  initialSettings: Settings;
  campuses: Campus[];
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
}) {
  const [saved, setSaved] = useState(initialSettings);
  const [draft, setDraft] = useState(initialSettings);
  const [saving, setSaving] = useState<SectionKey | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const orderingDirty = isSectionDirty(saved, draft, ORDERING_FIELDS);
  const wheelDirty = isSectionDirty(saved, draft, WHEEL_FIELDS);
  const slotsDirty = isSectionDirty(saved, draft, SLOT_FIELDS);
  const orderingProblem = orderingDirty ? validateOrdering(draft) : null;
  const slotsProblem = slotsDirty ? validateSlotTimes(draft) : null;
  const draftSlotTimes = slotTimesFrom(draft);
  const pastClosing = slotsPastClosing(draft);

  async function saveSection(key: SectionKey, keys: FieldKeys, done: string) {
    setSaving(key);
    try {
      const next = await saveSettings(buildSettingsPayload(saved, draft, keys));
      setSaved(next);
      setDraft((current) => mergeSavedSection(current, next, keys));
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(null);
    }
  }

  async function saveOrdering() {
    if (saved.ordersOpen && !draft.ordersOpen) {
      const ok = await confirm({
        title: "Stop taking orders?",
        description: "Customers will not be able to place new orders until you switch ordering back on.",
        confirmLabel: "Stop orders",
        destructive: true
      });
      if (!ok) return;
    }
    await saveSection("ordering", ORDERING_FIELDS, "Ordering settings saved");
  }

  function undo(keys: FieldKeys) {
    setDraft((current) => mergeSavedSection(current, saved, keys));
  }

  function setTime(field: TimeField, value: string) {
    const minutes = timeInputToMinutes(value);
    if (minutes !== null) setDraft({ ...draft, [field]: minutes });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <nav aria-label="Sections on this page" className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-bold text-neutral-500">Jump to</span>
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="inline-flex min-h-10 items-center rounded-full border border-black/10 bg-white px-3.5 text-sm font-bold text-[#3f4046] transition hover:border-black/25">
            {section.label}
          </a>
        ))}
      </nav>

      <SettingsSection
        id="ordering"
        title="Ordering"
        description="Whether customers can order right now, and the hours they can order in."
        dirty={orderingDirty}
        saving={saving === "ordering"}
        problem={orderingProblem}
        onSave={saveOrdering}
        onDiscard={() => undo(ORDERING_FIELDS)}
        saveLabel="Save ordering settings"
      >
        <div className="max-w-xl space-y-5">
          <div className="space-y-2">
            <SwitchRow
              title="Taking orders"
              description={draft.ordersOpen ? "Ordering is open. Customers can order during the hours below." : "Ordering is closed. Customers see the closed message instead."}
              on={draft.ordersOpen}
              onChange={(ordersOpen) => setDraft({ ...draft, ordersOpen })}
              disabled={saving === "ordering"}
            />
            <div className="flex items-center gap-2 px-1 text-xs text-neutral-500">
              Right now, customers see: <Badge tone={saved.ordersOpen ? "green" : "red"}>{saved.ordersOpen ? "Open" : "Closed"}</Badge>
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold text-neutral-600">Daily ordering hours (India time)</p>
            <p className="mb-3 text-xs text-neutral-500">Customers can only place orders between these times. Outside them, for example overnight, ordering is closed.</p>
            <div className="grid gap-3 min-[340px]:grid-cols-2">
              <label className="text-xs font-semibold text-neutral-500">
                Opens at
                <Input className="mt-1" type="time" value={minutesToTimeInput(draft.orderingOpenMinute)} onChange={(event) => setTime("orderingOpenMinute", event.target.value)} />
              </label>
              <label className="text-xs font-semibold text-neutral-500">
                Closes at
                <Input className="mt-1" type="time" value={minutesToTimeInput(draft.orderingCloseMinute)} onChange={(event) => setTime("orderingCloseMinute", event.target.value)} />
              </label>
            </div>
          </div>

          <label className="block text-sm font-semibold text-neutral-600">
            Closed message
            <Textarea className="mt-2" maxLength={240} value={draft.closedMessage} onChange={(event) => setDraft({ ...draft, closedMessage: event.target.value })} />
            <span className="mt-1 block text-right text-xs font-normal text-neutral-400">{draft.closedMessage.length} / 240</span>
          </label>

          <label className="block text-sm font-semibold text-neutral-600">
            Contact number shown when closed
            <Input className="mt-2" maxLength={40} value={draft.contactNumber} onChange={(event) => setDraft({ ...draft, contactNumber: event.target.value })} />
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        id="slots"
        title="Order slots"
        description="The Afternoon and Night delivery slots customers pick from at checkout: the time they must order by, and the time you promise delivery."
        dirty={slotsDirty}
        saving={saving === "slots"}
        problem={slotsProblem}
        onSave={() => saveSection("slots", SLOT_FIELDS, "Order slots saved")}
        onDiscard={() => undo(SLOT_FIELDS)}
        saveLabel="Save order slots"
      >
        <div className="grid max-w-3xl gap-4 md:grid-cols-2">
          {SLOT_CARDS.map((card) => {
            const times = draftSlotTimes[card.slot];
            return (
              <div key={card.slot} className="rounded-lg bg-[#f3f4f6] p-4">
                <p className="font-black">{card.title}</p>
                {/* Stacked on narrow phones: two time boxes plus long labels do not fit side by side there. */}
                <div className="mt-3 grid gap-3 min-[380px]:grid-cols-2">
                  <label className="text-xs font-semibold text-neutral-500">
                    Customers order by
                    <Input className="mt-1" type="time" value={minutesToTimeInput(draft[card.cutoff])} onChange={(event) => setTime(card.cutoff, event.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-neutral-500">
                    We deliver by
                    <Input className="mt-1" type="time" value={minutesToTimeInput(draft[card.delivery])} onChange={(event) => setTime(card.delivery, event.target.value)} />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-500">
                  Customers will see: <span className="font-bold text-neutral-700">{times.cutoffLabel} · {times.deliveryLabel}</span>
                </p>
                {pastClosing.includes(card.slot) ? (
                  <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    Heads up: ordering closes at {formatIndiaMinutes(draft.orderingCloseMinute)} (see Ordering above), which is before this time. Customers will not be able to order for this slot after {formatIndiaMinutes(draft.orderingCloseMinute)}.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="max-w-3xl text-xs leading-5 text-neutral-500">
          Changes apply straight away to new orders. Orders already placed keep the slot they chose. Each slot&apos;s order-by time must be earlier than its delivery time, and Afternoon must close before Night.
        </p>
      </SettingsSection>

      <CampusesManager initialCampuses={campuses} />

      <NotificationToggles initialEmail={notifyEmail} initialWhatsapp={notifyWhatsapp} />

      <SettingsSection
        id="wheel"
        title="Discount wheel promo"
        description="Who gets offered a spin of the discount wheel at checkout."
        dirty={wheelDirty}
        saving={saving === "wheel"}
        onSave={() => saveSection("wheel", WHEEL_FIELDS, "Discount wheel promo saved")}
        onDiscard={() => undo(WHEEL_FIELDS)}
        saveLabel="Save wheel promo"
      >
        <div className="max-w-xl space-y-3">
          <SwitchRow
            title="Offer a spin to every customer"
            description={draft.spinWheelForEveryone ? "On. Everyone gets a spin at checkout, however many orders they have placed." : "Off. Only regulars (3 to 6 reviewed orders) are offered a spin."}
            on={draft.spinWheelForEveryone}
            onChange={(spinWheelForEveryone) => setDraft({ ...draft, spinWheelForEveryone })}
            disabled={saving === "wheel"}
          />
          <p className="text-xs leading-5 text-neutral-500">
            Once switched on, this turns itself off again when ordering closes for the day, so it cannot be left on by accident.
            Set up the prizes on the{" "}
            <Link href="/admin/rewards" className="font-bold text-[#b65a20] underline-offset-2 hover:underline">Discount wheel</Link> page.
          </p>
        </div>
      </SettingsSection>

      {confirmDialog}
    </div>
  );
}
