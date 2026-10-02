import { publicErrorMessage } from "@/lib/public-error";
import { toOrderMutationView } from "@/lib/order-views";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { recordAudit, rupees, type AuditAction } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { adminMarkOrderDelivered, cancelOrder, closeEarlierOrderAsDelivered, markOrderReachedCampus } from "@/lib/orders";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reached") }),
  z.object({ action: z.literal("delivered") }),
  // Closes a forgotten order from an earlier day as delivered on its own day, sending no
  // messages. Refused for today's orders.
  z.object({ action: z.literal("closeQuietly") }),
  z.object({ action: z.literal("cancel"), refund: z.boolean().optional() })
]);

// One row per order action, filed under the order's tracking code so the page can link to it.
function logOrder(actorId: string, action: AuditAction, trackingCode: string, detail: string) {
  return recordAudit({ actorId, action, targetType: "order", targetId: trackingCode, detail });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = schema.parse(await request.json());

    if (body.action === "reached") {
      const order = await markOrderReachedCampus(id);
      await logOrder(user.id, "order.status", order.trackingCode, `Order ${order.trackingCode} marked as reached campus`);
      return NextResponse.json({ order: toOrderMutationView(order) });
    }

    if (body.action === "delivered") {
      const order = await adminMarkOrderDelivered(id, user.id);
      await logOrder(user.id, "order.status", order.trackingCode, `Order ${order.trackingCode} marked as delivered`);
      return NextResponse.json({ order: toOrderMutationView(order) });
    }

    if (body.action === "closeQuietly") {
      const order = await closeEarlierOrderAsDelivered(id, user.id);
      // This one returns only a slim view of the order, so the code and total are looked up.
      const closed = await prisma.order.findUnique({ where: { id }, select: { trackingCode: true, totalPaise: true } }).catch(() => null);
      await recordAudit({
        actorId: user.id,
        action: "order.close_quietly",
        targetType: "order",
        targetId: closed?.trackingCode ?? null,
        detail: `Order ${closed ? `${closed.trackingCode} (${rupees(closed.totalPaise)})` : "from an earlier day"} closed as delivered. No messages were sent.`
      });
      return NextResponse.json({ order: toOrderMutationView(order) });
    }

    // The business gives no refunds, so a refund flag from any caller is ignored: a
    // cancellation never marks money for return.
    const order = await cancelOrder(id, false);
    await logOrder(
      user.id,
      "order.cancel",
      order.trackingCode,
      `Order ${order.trackingCode} (${rupees(order.totalPaise)}) cancelled${order.paymentStatus === "PAID_ONLINE" ? ". It was paid online and no refund was recorded" : ""}`
    );
    return NextResponse.json({ order: toOrderMutationView(order) });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not update order") },
      { status: 400 }
    );
  }
}
