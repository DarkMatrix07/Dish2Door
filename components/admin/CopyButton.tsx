"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

// Small icon button that copies an id to the clipboard, for the long gateway ids.
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access needs a secure page and a user gesture; say so instead of failing quietly.
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      // 36px tap area; the negative margin keeps the layout footprint of the old 28px icon.
      className="-m-1 inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 outline-none transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-950"
    >
      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  );
}
