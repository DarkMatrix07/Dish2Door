import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { searchAdminOrders } from "@/lib/admin-orders";
import { cleanupStalePendingOrders } from "@/lib/orders";
import { parseOrderSearch } from "@/lib/order-search";

// Filters (all optional, all validated against allow-lists in lib/order-search.ts):
//   search, status, deliveryType, source, slot, restaurantId, campusId, sessionId,
//   payment = real (default) | paid_online | paid_manually | pay_later | unpaid | everything,
//   dateFrom / dateTo = IST calendar days (yyyy-mm-dd, inclusive).
// Paging: page, pageSize (5-50, default 20).
// summary=1 also returns counts, revenue and the status split for the whole filter.
export async function GET(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Drop unpaid online orders older than 5 minutes so the list stays clean.
  await cleanupStalePendingOrders().catch(() => null);

  const { searchParams } = new URL(request.url);
  const page = Math.min(100_000, Math.max(1, Math.floor(Number(searchParams.get("page") ?? "1")) || 1));
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(searchParams.get("pageSize") ?? "20")) || 20));

  const result = await searchAdminOrders(parseOrderSearch(searchParams), {
    page,
    pageSize,
    withSummary: searchParams.get("summary") === "1"
  });

  return NextResponse.json(result);
}
