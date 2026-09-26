"use client";

import { Check } from "lucide-react";

// Opt-in "remember me" for checkout contact details. Unticking forgets them straight
// away, so a separate "Forget saved details" button next to it isn't needed.
export function RememberDetails({
  checked,
  onChange,
  accent = "#171713"
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  accent?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 bg-white/60 p-3 transition hover:border-black/20">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px] transition peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1"
        style={checked ? { backgroundColor: accent, borderColor: accent, color: "#fff" } : { borderColor: "rgba(0,0,0,0.25)" }}
      >
        {checked ? <Check size={13} strokeWidth={3} /> : null}
      </span>
      <span>
        <span className="block text-sm font-bold">Remember my details</span>
        <span className="mt-0.5 block text-xs leading-5 opacity-65">Saved on this device for 30 days. Untick to forget them.</span>
      </span>
    </label>
  );
}
