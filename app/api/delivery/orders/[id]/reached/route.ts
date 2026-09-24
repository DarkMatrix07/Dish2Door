import { publicErrorMessage } from "@/lib/public-error";
import { toOrderMutationView } from "@/lib/order-views";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { markDeliveryReached } from "@/lib/orders";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiRole(["DELIVERY"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const order = await markDeliveryReached(id, user.assignedHostelBlocks);
    return NextResponse.json({ order: toOrderMutationView(order) });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not mark reached") },
      { status: 400 }
    );
  }
}
