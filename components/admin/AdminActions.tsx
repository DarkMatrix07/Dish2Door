"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/lib/features";

// `toPrepare` is today's confirmed orders, so the confirmation can say how many customers
// are about to be messaged. Optional: without it the wording is just less specific.
export function AdminActions({ ordersOpen, toPrepare }: { ordersOpen: boolean; toPrepare?: number }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [open, setOpen] = useState(ordersOpen);
  const [busy, setBusy] = useState<string | null>(null);

  async function post(url: string, body?: unknown) {
    setBusy(url);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed");
      return data;
    } finally {
      setBusy(null);
    }
  }

  async function toggleOrders(next: boolean) {
    try {
      await post("/api/admin/settings/orders-open", { ordersOpen: next });
      setOpen(next);
      toast.success(next ? "Public orders opened" : "Public orders closed");
      // The server-rendered "Orders open / closed" badge is part of the page.
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update orders");
    }
  }

  async function reachedCampus() {
    // Every order marked sends its customer a message, and that cannot be taken back.
    const who =
      toPrepare === undefined
        ? "every confirmed order from today"
        : toPrepare === 1
          ? "1 confirmed order from today"
          : `${toPrepare} confirmed orders from today`;
    const ok = await confirm({
      title: "Mark today's orders as reached campus?",
      description: `This marks ${who}, at every campus, as reached campus. Each customer is sent a message. This cannot be undone.`,
      confirmLabel: "Mark as reached"
    });
    if (!ok) return;
    try {
      const result = await post("/api/admin/orders/reached-campus");
      toast.success(result.count === 1 ? "1 of today's orders marked reached campus" : `${result.count} of today's orders marked reached campus`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark reached campus");
    }
  }

  async function releaseDeliveries() {
    try {
      const result = await post("/api/admin/orders/release-deliveries");
      toast.success(`${result.count} hostel orders assigned to delivery`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release deliveries");
    }
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap [&>button]:xl:px-6">
        <Button className="min-h-12 whitespace-normal text-left leading-5 sm:text-center" variant={open ? "destructive" : "default"} disabled={!!busy} onClick={() => toggleOrders(!open)}>
          {open ? "Close public orders" : "Open public orders"}
        </Button>
        <Button className="min-h-12 whitespace-normal text-left leading-5 sm:text-center" variant="outline" disabled={!!busy} onClick={reachedCampus}>
          Mark today&apos;s orders reached
        </Button>
        {FEATURES.deliveryPortal ? (
          <Button className="min-h-12 whitespace-normal text-left leading-5 sm:text-center" variant="outline" disabled={!!busy} onClick={releaseDeliveries}>
            Assign for delivery
          </Button>
        ) : null}
        <Button className="min-h-12 whitespace-normal text-left leading-5 sm:text-center" variant="outline" disabled={!!busy} onClick={() => router.refresh()}>
          Refresh numbers
        </Button>
      </div>
      {confirmDialog}
    </>
  );
}
