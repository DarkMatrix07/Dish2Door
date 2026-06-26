import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { adminMarkOrderDelivered, cancelOrder, markOrderReachedCampus } from "@/lib/orders";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reached") }),
  z.object({ action: z.literal("delivered") }),
  z.object({ action: z.literal("cancel"), refund: z.boolean().optional() })
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = schema.parse(await request.json());

    if (body.action === "reached") {
      const order = await markOrderReachedCampus(id);
      return NextResponse.json({ order });
    }

    if (body.action === "delivered") {
      const order = await adminMarkOrderDelivered(id, user.id);
      return NextResponse.json({ order });
    }

    const order = await cancelOrder(id, body.refund ?? false);
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update order" },
      { status: 400 }
    );
  }
}
