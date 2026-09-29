import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { loadTodayBoard } from "@/lib/today-orders";

// The Today board's data: today's (IST) orders, the paid orders still open from earlier
// days, and a few counts. The board polls this, so it is never cached.
export async function GET() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await loadTodayBoard(), { headers: { "Cache-Control": "no-store" } });
}
