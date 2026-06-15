import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { releaseHostelDeliveries } from "@/lib/orders";

export async function POST() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await releaseHostelDeliveries();
  return NextResponse.json(result);
}
