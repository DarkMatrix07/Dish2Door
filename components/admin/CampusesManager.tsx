"use client";

import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/utils";

type Campus = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  platformFeePaise: number;
  hostelDeliveryFeePaise: number;
  hostelDeliveryEnabled: boolean;
  hostelDeliveryNightOnly: boolean;
  paymentChargePercentBps: number;
  paymentChargeFixedPaise: number;
  orderCount: number;
};

const inputClass =
  "h-11 w-full rounded-lg border border-black/12 bg-white px-3.5 text-sm font-medium tabular-nums outline-none transition focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10";

function rupees(paise: number) {
  return String(paise / 100);
}

export function CampusesManager({ initialCampuses }: { initialCampuses: Campus[] }) {
  const [campuses, setCampuses] = useState(initialCampuses);
  const [savingId, setSavingId] = useState<string | null>(null);

  function patch(id: string, changes: Partial<Campus>) {
    setCampuses((current) => current.map((campus) => (campus.id === id ? { ...campus, ...changes } : campus)));
  }

  async function save(campus: Campus) {
    setSavingId(campus.id);
    try {
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save campus");
      toast.success(`${campus.name} saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save campus");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
      {campuses.map((campus) => (
        <SectionCard
          key={campus.id}
          title={campus.name}
          description={`${campus.code} · ${campus.orderCount} order${campus.orderCount === 1 ? "" : "s"}`}
          bodyClassName="space-y-4"
          actions={
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${campus.active ? "bg-[#34705a]/10 text-[#2b6e56]" : "bg-[#f3f4f6] text-[#85878e]"}`}>
              <GraduationCap size={13} /> {campus.active ? "Live" : "Hidden"}
            </span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-[#3f4046]">
              Platform fee (₹)
              <input
                className={`${inputClass} mt-1.5`}
                inputMode="decimal"
                value={rupees(campus.platformFeePaise)}
                onChange={(event) =>
                  patch(campus.id, { platformFeePaise: Math.round(Number(event.target.value || 0) * 100) })
                }
              />
            </label>
            <label className="text-sm font-bold text-[#3f4046]">
              Payment handling (%)
              <input
                className={`${inputClass} mt-1.5`}
                inputMode="decimal"
                value={String(campus.paymentChargePercentBps / 100)}
                onChange={(event) =>
                  patch(campus.id, { paymentChargePercentBps: Math.round(Number(event.target.value || 0) * 100) })
                }
              />
            </label>
            <label className="text-sm font-bold text-[#3f4046]">
              Hostel delivery fee (₹)
              <input
                className={`${inputClass} mt-1.5`}
                inputMode="decimal"
                value={rupees(campus.hostelDeliveryFeePaise)}
                onChange={(event) =>
                  patch(campus.id, { hostelDeliveryFeePaise: Math.round(Number(event.target.value || 0) * 100) })
                }
              />
            </label>
            <div className="text-sm font-bold text-[#3f4046]">
              Hostel delivery
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Button
                  variant={campus.hostelDeliveryEnabled ? "default" : "outline"}
                  onClick={() => patch(campus.id, { hostelDeliveryEnabled: true })}
                >
                  Available
                </Button>
                <Button
                  variant={!campus.hostelDeliveryEnabled ? "destructive" : "outline"}
                  onClick={() => patch(campus.id, { hostelDeliveryEnabled: false })}
                >
                  Coming soon
                </Button>
              </div>
            </div>
            {campus.hostelDeliveryEnabled ? (
              <div className="text-sm font-bold text-[#3f4046] sm:col-span-2">
                Hostel delivery slots
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <Button
                    variant={campus.hostelDeliveryNightOnly ? "default" : "outline"}
                    onClick={() => patch(campus.id, { hostelDeliveryNightOnly: true })}
                  >
                    Night orders only
                  </Button>
                  <Button
                    variant={!campus.hostelDeliveryNightOnly ? "default" : "outline"}
                    onClick={() => patch(campus.id, { hostelDeliveryNightOnly: false })}
                  >
                    Both slots
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <p className="rounded-lg bg-[#f3f4f6] px-3 py-2 text-xs leading-5 text-[#70727a]">
            A ₹200 order here costs the customer{" "}
            <span className="font-black text-[#202126]">
              {formatPaise(
                20_000 +
                  campus.platformFeePaise +
                  Math.ceil(((20_000 + campus.platformFeePaise) * campus.paymentChargePercentBps) / 10_000) +
                  campus.paymentChargeFixedPaise
              )}
            </span>{" "}
            (gate pickup). Razorpay takes about 2.36% of that.
          </p>

          <Button disabled={savingId === campus.id} onClick={() => save(campus)}>
            {savingId === campus.id ? "Saving..." : `Save ${campus.name}`}
          </Button>
        </SectionCard>
      ))}
    </div>
  );
}
