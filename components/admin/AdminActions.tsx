"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AdminActions({ ordersOpen }: { ordersOpen: boolean }) {
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update orders");
    }
  }

  async function reachedCampus() {
    try {
      const result = await post("/api/admin/orders/reached-campus");
      toast.success(`${result.count} orders marked reached campus`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark reached campus");
    }
  }

  async function releaseDeliveries() {
    try {
      const result = await post("/api/admin/orders/release-deliveries");
      toast.success(`${result.count} hostel orders released`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release deliveries");
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button className="min-h-12 whitespace-nowrap px-5" variant={open ? "destructive" : "secondary"} disabled={!!busy} onClick={() => toggleOrders(!open)}>
        {open ? "Close public orders" : "Open public orders"}
      </Button>
      <Button className="min-h-12 whitespace-nowrap px-5" variant="outline" disabled={!!busy} onClick={reachedCampus}>
        Mark reached campus
      </Button>
      <Button className="min-h-12 whitespace-nowrap px-5" variant="outline" disabled={!!busy} onClick={releaseDeliveries}>
        Assign for delivery
      </Button>
      <Button className="min-h-12 whitespace-nowrap px-5" variant="outline" disabled={!!busy} onClick={() => window.location.reload()}>
        Refresh dashboard
      </Button>
    </div>
  );
}
