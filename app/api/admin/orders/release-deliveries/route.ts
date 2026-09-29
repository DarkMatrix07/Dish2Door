import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { FEATURES } from "@/lib/features";
import { releaseHostelDeliveries } from "@/lib/orders";

export async function POST() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!FEATURES.deliveryPortal) return NextResponse.json({ error: "The delivery portal is switched off." }, { status: 409 });
  const result = await releaseHostelDeliveries();
  return NextResponse.json(result);
}
