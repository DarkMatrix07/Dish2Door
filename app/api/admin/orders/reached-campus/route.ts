import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { markAllReachedCampus } from "@/lib/orders";

export async function POST() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await markAllReachedCampus();
  return NextResponse.json(result);
}
