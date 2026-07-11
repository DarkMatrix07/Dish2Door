"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discountPercent: number;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | Date | null;
};

function randomCode() {
  return `D2D${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function formatDateInput(value: Coupon["expiresAt"]) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function CouponsManager({ initialCoupons }: { initialCoupons: Coupon[] }) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ code: "", description: "", discountPercent: "10", maxUses: "", expiresAt: "" });

  const stats = useMemo(
    () => ({
      active: coupons.filter((coupon) => coupon.active).length,
      uses: coupons.reduce((total, coupon) => total + coupon.usedCount, 0)
    }),
    [coupons]
  );

  async function refresh() {
    const response = await fetch("/api/admin/menu");
    const data = await response.json();
    setCoupons(data.coupons ?? []);
  }

  async function action(body: unknown) {
    const response = await fetch("/api/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Action failed");
    await refresh();
  }

  async function createCoupon() {
    try {
      await action({
        action: "coupon.create",
        code: draft.code || randomCode(),
        description: draft.description,
        discountPercent: Number(draft.discountPercent),
        maxUses: draft.maxUses ? Number(draft.maxUses) : null,
        expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null
      });
      setDraft({ code: "", description: "", discountPercent: "10", maxUses: "", expiresAt: "" });
      setShowCreate(false);
      toast.success("Coupon created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create coupon");
    }
  }

  async function toggleCoupon(id: string, active: boolean) {
    await action({ action: "coupon.active", id, active });
    toast.success(active ? "Coupon activated" : "Coupon paused");
  }

  async function updateCoupon(id: string, patch: Partial<{ discountPercent: number; maxUses: number | null; expiresAt: string | null }>) {
    await action({ action: "coupon.update", id, ...patch });
    toast.success("Coupon updated");
  }

  async function deleteCoupon(coupon: Coupon) {
    if (!window.confirm(`Delete coupon ${coupon.code}? This cannot be undone.`)) return;
    try {
      await action({ action: "coupon.delete", id: coupon.id });
      toast.success("Coupon deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete coupon");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 min-[430px]:grid-cols-3 sm:gap-4">
        <StatCard label="Total coupons" value={coupons.length} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Total uses" value={stats.uses} />
      </div>

      <SectionCard
        title="Coupon control"
        description="Pause, activate, adjust validity, and watch usage."
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} className="-ml-1 mr-1" />
            Add coupon
          </Button>
        }
        bodyClassName="p-0"
      >
        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {coupons.map((coupon) => {
              const expired = coupon.expiresAt ? new Date(coupon.expiresAt) < new Date() : false;
              const fullyUsed = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;
              return (
                <div key={coupon.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-lg font-bold">{coupon.code}</span>
                    <Badge tone={!coupon.active || expired || fullyUsed ? "red" : "green"}>
                      {!coupon.active ? "Paused" : expired ? "Expired" : fullyUsed ? "Used up" : "Active"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-neutral-500">{coupon.description || "No description"}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-neutral-500">
                      Discount %
                      <Input className="mt-1" type="number" min={1} max={100} defaultValue={coupon.discountPercent} onBlur={(event) => updateCoupon(coupon.id, { discountPercent: Number(event.target.value) })} />
                    </label>
                    <label className="text-xs font-semibold text-neutral-500">
                      Max uses
                      <Input className="mt-1" type="number" min={1} placeholder="Unlimited" defaultValue={coupon.maxUses ?? ""} onBlur={(event) => updateCoupon(coupon.id, { maxUses: event.target.value ? Number(event.target.value) : null })} />
                    </label>
                    <label className="text-xs font-semibold text-neutral-500 sm:col-span-2">
                      Expires
                      <Input className="mt-1" type="date" defaultValue={formatDateInput(coupon.expiresAt)} onBlur={(event) => updateCoupon(coupon.id, { expiresAt: event.target.value ? new Date(event.target.value).toISOString() : null })} />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-semibold text-neutral-700">
                      Used {coupon.usedCount}
                      {coupon.maxUses !== null ? ` / ${coupon.maxUses}` : ""}
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggleCoupon(coupon.id, !coupon.active)}>
                        {coupon.active ? "Pause" : "Activate"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteCoupon(coupon)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          {!coupons.length ? <div className="rounded-xl bg-neutral-50 p-8 text-center text-neutral-500 md:col-span-2 xl:col-span-3">No coupons created yet.</div> : null}
        </div>
      </SectionCard>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Generate coupon"
        description="Create a checkout offer with expiry and usage limits."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={createCoupon}>Add coupon</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input className="uppercase" placeholder="Coupon code" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} />
            <Button variant="outline" onClick={() => setDraft({ ...draft, code: randomCode() })}>
              Generate
            </Button>
          </div>
          <Input placeholder="Description (optional)" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-neutral-500">
              Discount %
              <Input className="mt-1" type="number" min={1} max={100} placeholder="Discount %" value={draft.discountPercent} onChange={(event) => setDraft({ ...draft, discountPercent: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-neutral-500">
              Max uses
              <Input className="mt-1" type="number" min={1} placeholder="Unlimited" value={draft.maxUses} onChange={(event) => setDraft({ ...draft, maxUses: event.target.value })} />
            </label>
          </div>
          <label className="block text-xs font-semibold text-neutral-500">
            Expires
            <Input className="mt-1" type="date" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} />
          </label>
        </div>
      </Modal>
    </div>
  );
}
