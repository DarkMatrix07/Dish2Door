"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Log = {
  id: string;
  channel: "EMAIL" | "WHATSAPP" | "TELEGRAM";
  event: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  errorMessage: string | null;
  sentAt: string | Date;
  order: {
    trackingCode: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
  } | null;
};

export function NotificationsPanel({ failedLogs, recentLogs }: { failedLogs: Log[]; recentLogs: Log[] }) {
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function retry(logId: string) {
    setRetryingId(logId);
    try {
      const response = await fetch("/api/admin/notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Retry failed");
      toast.success("Notification retried");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  function statusTone(status: Log["status"]) {
    if (status === "SUCCESS") return "green";
    if (status === "FAILED") return "red";
    return "neutral";
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden border-0 bg-white shadow-sm">
        <div className="border-b border-neutral-100 p-5">
          <h3 className="text-xl font-black">Failed notifications</h3>
          <p className="mt-1 text-sm text-neutral-500">Retry email or WhatsApp notifications after SMTP/API issues are fixed.</p>
        </div>
        <div className="divide-y divide-neutral-100">
          {failedLogs.map((log) => (
            <div key={log.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="red">Failed</Badge>
                  <Badge>{log.channel}</Badge>
                  <span className="text-sm font-black">{log.event}</span>
                </div>
                <p className="mt-2 font-black">{log.order?.trackingCode ?? "No order"} - {log.order?.customerName ?? "Unknown customer"}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  {log.order?.customerPhone ?? "No phone"} {log.order?.customerEmail ? `- ${log.order.customerEmail}` : ""}
                </p>
                {log.errorMessage ? <p className="mt-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{log.errorMessage}</p> : null}
              </div>
              <Button disabled={retryingId === log.id} onClick={() => retry(log.id)}>
                {retryingId === log.id ? "Retrying..." : "Retry"}
              </Button>
            </div>
          ))}
          {!failedLogs.length ? <div className="p-8 text-center text-neutral-500">No failed email or WhatsApp logs right now.</div> : null}
        </div>
      </Card>

      <Card className="overflow-hidden border-0 bg-white shadow-sm">
        <div className="border-b border-neutral-100 p-5">
          <h3 className="text-xl font-black">Recent log stream</h3>
          <p className="mt-1 text-sm text-neutral-500">Latest notification attempts across all channels.</p>
        </div>
        <div className="divide-y divide-neutral-100">
          {recentLogs.map((log) => (
            <div key={log.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(log.status)}>{log.status}</Badge>
                  <span className="font-black">{log.channel}</span>
                </div>
                <span className="text-xs text-neutral-400">{new Date(log.sentAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-neutral-600">{log.event} for {log.order?.trackingCode ?? "system"}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
