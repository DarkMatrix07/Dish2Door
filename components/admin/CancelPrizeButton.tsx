"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { readApiJson } from "@/lib/api-client";

// Closes a prize the customer is still holding, won on the wheel or given by hand. The
// server refuses while a checkout is holding the code, so this just reports what it says.
export function CancelPrizeButton({
  phone,
  rewardId,
  percent,
  code
}: {
  phone: string;
  rewardId: string;
  percent: number;
  code: string;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    const ok = await confirm({
      title: `Cancel the ${percent}% prize?`,
      description: `The code ${code} will stop working straight away.`,
      body: (
        <p className="text-sm text-neutral-600">
          The customer will not be able to use it. You can give them a new prize afterwards.
        </p>
      ),
      confirmLabel: "Cancel prize",
      cancelLabel: "Keep it",
      destructive: true
    });
    if (!ok) return;

    setBusy(true);
    try {
      const response = await fetch("/api/admin/customers/cancel-prize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, rewardId })
      });
      const data = await readApiJson<{ error?: string }>(response, "Could not cancel the prize.");
      if (!response.ok) throw new Error(data.error ?? "Could not cancel the prize.");
      toast.success("Prize cancelled.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the prize.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={cancel} disabled={busy} className="text-red-700">
        {busy ? "Cancelling…" : "Cancel prize"}
      </Button>
      {confirmDialog}
    </>
  );
}
