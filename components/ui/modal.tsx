"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

const widths = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl"
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof widths;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={onClose}
    >
      <div
        className={`my-6 w-full ${widths[size]} rounded-2xl border border-neutral-200 bg-white shadow-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 p-5">
          <div>
            <h2 className="text-lg font-black text-neutral-950">{title}</h2>
            {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-neutral-100 p-5">{footer}</div> : null}
      </div>
    </div>
  );
}
