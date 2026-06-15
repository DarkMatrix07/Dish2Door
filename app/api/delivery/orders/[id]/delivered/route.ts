import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { markDelivered } from "@/lib/orders";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiRole(["DELIVERY"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const order = await markDelivered(id, user.id);
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not mark delivered" },
      { status: 400 }
    );
  }
}
