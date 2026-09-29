import { publicErrorMessage } from "@/lib/public-error";
import { toOrderMutationView } from "@/lib/order-views";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { adminMarkOrderDelivered, cancelOrder, closeEarlierOrderAsDelivered, markOrderReachedCampus } from "@/lib/orders";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reached") }),
  z.object({ action: z.literal("delivered") }),
  // Closes a forgotten order from an earlier day as delivered on its own day, sending no
  // messages. Refused for today's orders.
  z.object({ action: z.literal("closeQuietly") }),
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
      return NextResponse.json({ order: toOrderMutationView(order) });
    }

    if (body.action === "delivered") {
      const order = await adminMarkOrderDelivered(id, user.id);
      return NextResponse.json({ order: toOrderMutationView(order) });
    }

    if (body.action === "closeQuietly") {
      const order = await closeEarlierOrderAsDelivered(id, user.id);
      return NextResponse.json({ order: toOrderMutationView(order) });
    }

    // The business gives no refunds, so a refund flag from any caller is ignored: a
    // cancellation never marks money for return.
    const order = await cancelOrder(id, false);
    return NextResponse.json({ order: toOrderMutationView(order) });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not update order") },
      { status: 400 }
    );
  }
}
