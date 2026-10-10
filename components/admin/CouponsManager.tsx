"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { CopyButton } from "@/components/admin/CopyButton";
import { EmptyState } from "@/components/admin/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  COUPON_FILTERS,
  COUPON_IN_USE_MESSAGE,
  MAX_COUPON_PERCENT,
  couponState,
  expiryToDay,
  formatDay,
  matchesCouponFilter,
  randomCouponCode,
  usesLeft,
  type CouponFilter,
  type CouponRow
} from "@/lib/coupon-admin";
import { istDayKey } from "@/lib/ist-day";
import { cn } from "@/lib/utils";

const FILTER_LABELS: Record<CouponFilter, string> = { active: "Active", paused: "Paused", expired: "Expired", all: "All" };

type Draft = { code: string; description: string; discountPercent: string; maxUses: string; expiresOn: string };
type Editing = { mode: "create" } | { mode: "edit"; coupon: CouponRow };

const EMPTY_DRAFT: Draft = { code: "", description: "", discountPercent: "10", maxUses: "", expiresOn: "" };

function draftFor(coupon: CouponRow): Draft {
  return {
    code: coupon.code,
    description: coupon.description ?? "",
    discountPercent: String(coupon.discountPercent),
    maxUses: coupon.maxUses === null ? "" : String(coupon.maxUses),
    expiresOn: expiryToDay(coupon.expiresAt)
  };
}

class ApiError extends Error {
  constructor(message: string, readonly reason?: string) {
    super(message);
  }
}

async function send(body: Record<string, unknown>): Promise<CouponRow> {
  const response = await fetch("/api/admin/coupons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? "Something went wrong. Please try again.", data.reason);
  return data.coupon as CouponRow;
}

// Whole number from a text box, or null when it is blank or not a whole number.
function wholeNumber(text: string) {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function CouponsManager({ initialCoupons, initialFilter }: { initialCoupons: CouponRow[]; initialFilter: CouponFilter }) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [filter, setFilter] = useState<CouponFilter>(initialFilter);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  // Worked out on every render, so a coupon that passes its expiry while the page is open
  // moves to the Expired tab on the next click instead of staying Active until a reload.
  const now = new Date();
  const states = coupons.map((coupon) => couponState(coupon, now));
  const counts = {
    active: states.filter((state) => state === "active").length,
    paused: states.filter((state) => state === "paused").length,
    expired: states.filter((state) => state === "expired").length,
    all: coupons.length,
    uses: coupons.reduce((total, coupon) => total + coupon.usedCount, 0)
  };
  const visible = coupons.filter((coupon) => matchesCouponFilter(coupon, filter, now));

  function pickFilter(next: CouponFilter) {
    setFilter(next);
    // Keep the choice in the address so a refresh or a shared link lands on the same tab.
    const url = new URL(window.location.href);
    if (next === "active") url.searchParams.delete("status");
    else url.searchParams.set("status", next);
    window.history.replaceState(null, "", url);
  }

  function replaceCoupon(saved: CouponRow) {
    setCoupons((current) => current.map((coupon) => (coupon.id === saved.id ? saved : coupon)));
  }

  function openCreate() {
    setDraft({ ...EMPTY_DRAFT, code: randomCouponCode() });
    setFormError(null);
    setEditing({ mode: "create" });
  }

  function openEdit(coupon: CouponRow) {
    setDraft(draftFor(coupon));
    setFormError(null);
    setEditing({ mode: "edit", coupon });
  }

  function closeForm() {
    if (!saving) setEditing(null);
  }

  async function submitForm() {
    if (!editing) return;
    const percent = wholeNumber(draft.discountPercent);
    if (percent === null || percent < 1 || percent > MAX_COUPON_PERCENT) {
      setFormError(`Discount must be a whole number from 1 to ${MAX_COUPON_PERCENT}.`);
      return;
    }
    const limitText = draft.maxUses.trim();
    const limit = limitText ? wholeNumber(limitText) : null;
    if (limitText && (limit === null || limit < 1)) {
      setFormError("Max uses must be a whole number of 1 or more, or left empty for no limit.");
      return;
    }
    const code = draft.code.trim().toUpperCase();
    if (editing.mode === "create" && code.length < 3) {
      setFormError("The coupon code needs at least 3 characters.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing.mode === "create") {
        const saved = await send({
          action: "coupon.create",
          code,
          description: draft.description.trim() || null,
          discountPercent: percent,
          maxUses: limit,
          expiresOn: draft.expiresOn || null
        });
        setCoupons((current) => [saved, ...current]);
        toast.success(`Coupon ${saved.code} created`);
      } else {
        // Only what changed goes up, so saving never rewrites an old expiry by accident.
        const before = draftFor(editing.coupon);
        const patch: Record<string, unknown> = {};
        if (draft.description.trim() !== before.description) patch.description = draft.description.trim() || null;
        if (percent !== editing.coupon.discountPercent) patch.discountPercent = percent;
        if (limit !== editing.coupon.maxUses) patch.maxUses = limit;
        if (draft.expiresOn !== before.expiresOn) patch.expiresOn = draft.expiresOn || null;
        if (Object.keys(patch).length === 0) {
          setEditing(null);
          return;
        }
        replaceCoupon(await send({ action: "coupon.update", id: editing.coupon.id, ...patch }));
        toast.success("Coupon saved");
      }
      setEditing(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save the coupon.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(coupon: CouponRow, active: boolean) {
    setBusyId(coupon.id);
    try {
      replaceCoupon(await send({ action: "coupon.active", id: coupon.id, active }));
      toast.success(active ? `${coupon.code} is on again` : `${coupon.code} is paused`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the coupon.");
    } finally {
      setBusyId(null);
    }
  }

  // A coupon that has been used stays, so past orders keep their record. Say why and offer
  // the next best thing.
  async function explainCannotDelete(coupon: CouponRow) {
    if (!coupon.active) {
      toast.info(`${coupon.code} has been used, so it cannot be deleted. It is already paused, so nobody can use it.`);
      return;
    }
    const pause = await confirm({
      title: `${coupon.code} cannot be deleted`,
      description: COUPON_IN_USE_MESSAGE,
      confirmLabel: "Pause this coupon",
      cancelLabel: "Leave it"
    });
    if (pause) await setActive(coupon, false);
  }

  async function deleteCoupon(coupon: CouponRow) {
    if (coupon.usedCount > 0 || coupon.heldCount > 0 || coupon.orderCount > 0) {
      await explainCannotDelete(coupon);
      return;
    }
    const ok = await confirm({
      title: `Delete coupon ${coupon.code}?`,
      description: "Nobody has used it yet. It stops working straight away and cannot be brought back.",
      confirmLabel: "Delete coupon",
      destructive: true
    });
    if (!ok) return;
    setBusyId(coupon.id);
    try {
      await send({ action: "coupon.delete", id: coupon.id });
      setCoupons((current) => current.filter((item) => item.id !== coupon.id));
      toast.success("Coupon deleted");
    } catch (error) {
      if (error instanceof ApiError && error.reason === "IN_USE") {
        // The page was out of date: someone used it since it loaded.
        setCoupons((current) => current.map((item) => (item.id === coupon.id ? { ...item, orderCount: Math.max(1, item.orderCount) } : item)));
        await explainCannotDelete({ ...coupon, orderCount: 1 });
      } else {
        toast.error(error instanceof Error ? error.message : "Could not delete the coupon.");
      }
    } finally {
      setBusyId(null);
    }
  }

  const editingCoupon = editing?.mode === "edit" ? editing.coupon : null;
  const minLimit = editingCoupon ? Math.max(1, editingCoupon.usedCount + editingCoupon.heldCount) : 1;

  return (
    <div className="space-y-5">
      {/* Three short labels so each box stays one line tall and the three line up on a 320px phone. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard label="Coupons" title="Your coupons" value={counts.all} />
        <StatCard label="Working" title="Working now" value={counts.active} />
        <StatCard label="Used" title="Times used" value={counts.uses} />
      </div>

      <SectionCard
        title="Your coupons"
        description="Coupons you made. Prizes from the discount wheel are listed on the Discount wheel page."
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} className="-ml-1 mr-1" />
            New coupon
          </Button>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap gap-2 border-b border-black/8 p-4 sm:px-5" role="group" aria-label="Show coupons">
          {COUPON_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => pickFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                filter === key ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              )}
            >
              {FILTER_LABELS[key]}
              <span className={cn("text-xs tabular-nums", filter === key ? "text-white/70" : "text-neutral-400")}>{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((coupon) => {
            const state = couponState(coupon, now);
            const left = usesLeft(coupon);
            const usedUp = left === 0 && state === "active";
            const expiryDay = expiryToDay(coupon.expiresAt);
            const busy = busyId === coupon.id;
            return (
              <div key={coupon.id} className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-mono text-lg font-bold">{coupon.code}</span>
                    <CopyButton value={coupon.code} label={`code ${coupon.code}`} />
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1 self-start">
                    {state === "expired" ? <Badge tone="red">Expired</Badge> : null}
                    {state === "paused" ? <Badge tone="amber">Paused</Badge> : null}
                    {usedUp ? <Badge tone="amber">Used up</Badge> : null}
                    {state === "active" && !usedUp ? <Badge tone="green">Active</Badge> : null}
                  </div>
                </div>
                <p className="mt-1 text-2xl font-black tabular-nums">{coupon.discountPercent}% off</p>
                <p className="mt-1 text-neutral-500">{coupon.description || "No description"}</p>

                <dl className="mt-4 grid grid-cols-3 gap-1.5 text-center sm:gap-2">
                  <div className="rounded-lg bg-neutral-50 p-2">
                    <dt className="text-xs font-medium text-neutral-500">Used</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums">
                      {coupon.usedCount}
                      {coupon.maxUses !== null ? <span className="text-xs font-semibold text-neutral-400"> of {coupon.maxUses}</span> : null}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-neutral-50 p-2" title="At checkout">
                    <dt className="text-xs font-medium text-neutral-500">
                      <span aria-hidden="true">Held</span>
                      <span className="sr-only">At checkout</span>
                    </dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums">{coupon.heldCount}</dd>
                  </div>
                  <div className="rounded-lg bg-neutral-50 p-2">
                    <dt className="text-xs font-medium text-neutral-500">Left</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums">
                      {left === null ? (
                        <>
                          <span aria-hidden="true">∞</span>
                          <span className="sr-only">No limit</span>
                        </>
                      ) : (
                        left
                      )}
                    </dd>
                  </div>
                </dl>
                <p className={cn("mt-3 text-xs", state === "expired" ? "font-semibold text-red-700" : "text-neutral-500")}>
                  {expiryDay ? `${state === "expired" ? "Expired" : "Works until the end of"} ${formatDay(expiryDay)}` : "Never expires"}
                </p>

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => openEdit(coupon)}>
                    <Pencil size={14} />
                    Edit
                  </Button>
                  {state !== "expired" ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setActive(coupon, !coupon.active)}>
                      {coupon.active ? "Pause" : "Resume"}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" disabled={busy} className="ml-auto text-red-700 hover:bg-red-50" onClick={() => deleteCoupon(coupon)}>
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
          {!visible.length ? (
            <div className="rounded-xl bg-neutral-50 md:col-span-2 xl:col-span-3">
              {coupons.length === 0 ? (
                <EmptyState
                  title="No coupons yet"
                  description="Make a coupon to give customers a percentage off their order."
                  action={
                    <Button onClick={openCreate}>
                      <Plus size={16} className="-ml-1 mr-1" />
                      New coupon
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title={`No ${FILTER_LABELS[filter].toLowerCase()} coupons`}
                  description="Pick another tab to see your other coupons."
                  action={
                    <Button variant="outline" onClick={() => pickFilter("all")}>
                      Show all coupons
                    </Button>
                  }
                />
              )}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <Modal
        open={editing !== null}
        onClose={closeForm}
        title={editingCoupon ? `Edit ${editingCoupon.code}` : "New coupon"}
        description={editingCoupon ? "Change the offer. The code itself stays the same." : "Make a code customers can type at checkout."}
        footer={
          <>
            <Button variant="outline" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="coupon-form" disabled={saving}>
              {saving ? "Saving..." : editingCoupon ? "Save changes" : "Create coupon"}
            </Button>
          </>
        }
      >
        <form
          id="coupon-form"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitForm();
          }}
        >
          {editingCoupon ? null : (
            <label className="block text-xs font-semibold text-neutral-500">
              Coupon code
              <div className="mt-1 flex gap-2">
                <Input className="font-mono uppercase" placeholder="For example WELCOME10" maxLength={24} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} />
                <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, code: randomCouponCode() })}>
                  Suggest
                </Button>
              </div>
            </label>
          )}
          <label className="block text-xs font-semibold text-neutral-500">
            Note for yourself (optional)
            <Input className="mt-1" maxLength={200} placeholder="For example: Freshers week offer" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-neutral-500">
              Discount (%)
              <Input className="mt-1" type="number" inputMode="numeric" min={1} max={MAX_COUPON_PERCENT} value={draft.discountPercent} onChange={(event) => setDraft({ ...draft, discountPercent: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-neutral-500">
              Max uses
              <Input className="mt-1" type="number" inputMode="numeric" min={minLimit} placeholder="No limit" value={draft.maxUses} onChange={(event) => setDraft({ ...draft, maxUses: event.target.value })} />
            </label>
          </div>
          {editingCoupon && (editingCoupon.usedCount > 0 || editingCoupon.heldCount > 0) ? (
            <p className="text-xs text-neutral-500">
              {editingCoupon.usedCount} used{editingCoupon.heldCount > 0 ? ` and ${editingCoupon.heldCount} in checkout now` : ""}, so the limit cannot go below {minLimit}.
            </p>
          ) : null}
          <label className="block text-xs font-semibold text-neutral-500">
            Last day it works (optional)
            <Input className="mt-1" type="date" min={editingCoupon && draft.expiresOn === expiryToDay(editingCoupon.expiresAt) ? undefined : istDayKey(new Date())} value={draft.expiresOn} onChange={(event) => setDraft({ ...draft, expiresOn: event.target.value })} />
          </label>
          {formError ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {formError}
            </p>
          ) : null}
        </form>
      </Modal>
      {confirmDialog}
    </div>
  );
}
