"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/admin/CopyButton";
import { Button, linkButtonClasses } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import {
  GIFT_DAYS,
  GIFT_NOTE_MAX,
  GIFT_PERCENTS,
  daysLabel,
  giftWhatsAppMessage,
  giftWhatsAppUrl
} from "@/lib/admin-rewards";
import { readApiJson } from "@/lib/api-client";
import { formatIstFull } from "@/lib/ist-day";
import { cn } from "@/lib/utils";

type WaitingPrize = { percent: number; code: string; expiresAt: string | null; held: boolean };
type Given = { couponCode: string; percent: number; expiresAt: Date; replacedCode: string | null };

function Chip({ selected, onClick, children, label }: { selected: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-11 rounded-xl border text-sm font-bold tabular-nums transition",
        selected ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-500"
      )}
    >
      {children}
    </button>
  );
}

// The "Give wheel coupon" button and its popup. A gift is an ordinary one-time wheel
// coupon tied to the customer's phone, so it works at checkout like a prize they won.
export function GiveWheelCoupon({
  phone,
  name,
  waiting
}: {
  phone: string;
  name: string | null;
  waiting: WaitingPrize | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState(10);
  const [days, setDays] = useState<number>(1);
  const [note, setNote] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [given, setGiven] = useState<Given | null>(null);

  function close() {
    setOpen(false);
    // Start clean next time, but only after a prize was given so a half-filled form
    // survives an accidental tap outside the popup.
    if (given) {
      setGiven(null);
      setNote("");
      setReplace(false);
    }
  }

  const mustReplace = waiting !== null;
  const blocked = waiting?.held === true;
  const canSubmit = !busy && !blocked && (!mustReplace || replace);

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/customers/gift-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, percent, days, ...(note.trim() ? { note: note.trim() } : {}), ...(replace ? { replace: true } : {}) })
      });
      const data = await readApiJson<{ error?: string; couponCode: string; percent: number; expiresAt: string; replacedCode: string | null }>(
        response,
        "Could not give the coupon."
      );
      if (!response.ok) throw new Error(data.error ?? "Could not give the coupon.");
      setGiven({ couponCode: data.couponCode, percent: data.percent, expiresAt: new Date(data.expiresAt), replacedCode: data.replacedCode });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not give the coupon.");
    } finally {
      setBusy(false);
    }
  }

  const whatsappUrl = given
    ? giftWhatsAppUrl(phone, giftWhatsAppMessage({ name, percent: given.percent, code: given.couponCode, expiresAt: given.expiresAt }))
    : null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Gift size={16} aria-hidden="true" />
        Give wheel coupon
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={given ? "Coupon given" : "Give wheel coupon"}
        description={given ? undefined : `A one-time discount for ${name ?? phone}, tied to their phone number.`}
        footer={
          given ? (
            <Button size="sm" variant="outline" onClick={close}>Done</Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={close} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={!canSubmit}>{busy ? "Giving…" : "Give coupon"}</Button>
            </>
          )
        }
      >
        {given ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 p-4 text-center">
              <p className="text-sm font-semibold text-amber-900">{given.percent}% off, one use</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <code className="break-all font-mono text-2xl font-black tracking-wider text-neutral-950">{given.couponCode}</code>
                <CopyButton value={given.couponCode} label="coupon code" />
              </div>
              <p className="mt-2 text-sm text-amber-900">Works until {formatIstFull(given.expiresAt)} IST</p>
            </div>
            {given.replacedCode ? <p className="text-sm text-neutral-600">The earlier prize ({given.replacedCode}) no longer works.</p> : null}
            <a
              href={whatsappUrl ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(linkButtonClasses("outline", "md"), "w-full")}
            >
              <MessageCircle size={16} aria-hidden="true" />
              Send on WhatsApp
            </a>
          </div>
        ) : (
          <div className="space-y-5">
            {waiting ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                <p>
                  {name ?? "This customer"} already has a <b>{waiting.percent}%</b> prize waiting
                  <code className="ml-1.5 rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs">{waiting.code}</code>
                  {waiting.expiresAt ? <>, valid until {formatIstFull(new Date(waiting.expiresAt))}</> : null}.
                </p>
                {blocked ? (
                  <p className="mt-1 font-semibold">
                    They have started a checkout with it, so it cannot be replaced yet. Try again once that order is paid or cancelled.
                  </p>
                ) : (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 font-semibold">
                    <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} className="mt-1.5 h-4 w-4" />
                    <span>Replace it with the new one (the old code stops working)</span>
                  </label>
                )}
              </div>
            ) : null}

            <fieldset>
              <legend className="text-sm font-bold text-neutral-800">Discount</legend>
              <div role="radiogroup" aria-label="Discount percentage" className="mt-2 grid grid-cols-4 gap-2">
                {GIFT_PERCENTS.map((value) => (
                  <Chip key={value} selected={percent === value} onClick={() => setPercent(value)} label={`${value} percent`}>
                    {value}%
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-bold text-neutral-800">Valid for</legend>
              <div role="radiogroup" aria-label="Valid for" className="mt-2 grid grid-cols-3 gap-2">
                {GIFT_DAYS.map((value) => (
                  <Chip key={value} selected={days === value} onClick={() => setDays(value)} label={daysLabel(value)}>
                    {daysLabel(value)}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="gift-note" className="text-sm font-bold text-neutral-800">
                Note <span className="font-normal text-neutral-500">(optional, only you see it)</span>
              </label>
              <Textarea
                id="gift-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={GIFT_NOTE_MAX}
                placeholder="Sorry for the late order"
                className="mt-2 min-h-20"
              />
              <p className="mt-1 text-right text-xs tabular-nums text-neutral-500">{note.length}/{GIFT_NOTE_MAX}</p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
