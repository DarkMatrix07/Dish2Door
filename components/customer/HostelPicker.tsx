"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { HOSTEL_BLOCKS } from "@/lib/hostels";

const HOSTEL_GROUPS = [
  { label: "Men's hostels", prefix: "MH" },
  { label: "Ladies' hostels", prefix: "LH" }
] as const;

export function HostelPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <p className="text-sm font-bold">Hostel block</p>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        className={`mt-2 flex min-h-14 w-full items-center gap-3 rounded-xl border bg-white px-4 text-left transition ${open ? "border-[#c65d24] shadow-[0_0_0_3px_rgba(198,93,36,0.1)]" : "border-black/15 hover:border-black/35"}`}
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${value ? "bg-[#f6b73c] text-[#171713]" : "bg-[#f2eee6] text-[#817a70]"}`}>
          <MapPin size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-black ${value ? "text-[#171713]" : "text-[#817a70]"}`}>{value || "Select your hostel"}</span>
          <span className="mt-0.5 block text-xs font-medium text-[#9a9388]">Choose the block for delivery</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-[#716a5f] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={listboxId}
            role="listbox"
            aria-label="Hostel block"
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute inset-x-0 top-[calc(100%+0.55rem)] z-40 overflow-hidden rounded-xl border border-black/10 bg-[#fffdf8] p-2 shadow-[0_24px_70px_rgba(58,43,22,0.18)]"
          >
            {HOSTEL_GROUPS.map((group) => {
              const blocks = HOSTEL_BLOCKS.filter((block) => block.startsWith(group.prefix));
              return (
                <div key={group.prefix} className="p-2 first:pb-3 last:border-t last:border-black/8 last:pt-3">
                  <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9a9388]">{group.label}</p>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {blocks.map((block) => {
                      const selected = value === block;
                      return (
                        <button
                          key={block}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            onChange(block);
                            setOpen(false);
                          }}
                          className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-black transition ${selected ? "border-[#171713] bg-[#171713] text-white" : "border-black/8 bg-white text-[#625b50] hover:border-[#f6b73c] hover:bg-[#fff4d4] hover:text-[#171713]"}`}
                        >
                          {selected ? <Check size={14} className="text-[#f6b73c]" /> : null}
                          {block}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}