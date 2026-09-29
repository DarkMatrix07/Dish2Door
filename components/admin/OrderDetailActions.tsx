"use client";

import { useRouter } from "next/navigation";
import { OrderActionButtons } from "@/components/admin/OrderActionButtons";
import type { OrderActionView } from "@/lib/order-views";

// The order page is a server component; after any action it re-renders itself so the
// status, timeline and notification log reflect what just happened.
// `earlier` is decided on the server (an open paid order from before today's IST start) and
// swaps the messaging buttons for the quiet close.
export function OrderDetailActions({ order, earlier = false }: { order: OrderActionView; earlier?: boolean }) {
  const router = useRouter();
  return <OrderActionButtons order={order} earlier={earlier} onChanged={() => router.refresh()} />;
}
