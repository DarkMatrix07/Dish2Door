import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cancelOrder, confirmWhatsAppOrder } from "@/lib/orders";

// Accepting a WhatsApp order is what puts it into the normal pipeline: only then does it
// reach today's orders, the kitchen sheet and delivery. Rejecting cancels it outright.
const schema = z.object({
  id: z.string().min(1),
  action: z.enum(["confirm", "reject"])
});

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, action } = schema.parse(await request.json());

    const existing = await prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (existing.status !== "AWAITING_CONFIRMATION") {
      return NextResponse.json({ error: "That order has already been handled." }, { status: 400 });
    }

    // No money moved through us on this path, so there is nothing to refund on reject.
    const order = action === "confirm" ? await confirmWhatsAppOrder(id) : await cancelOrder(id, false);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Could not update the order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
