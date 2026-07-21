import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { markDelivered } from "@/lib/orders";

// Handover details from the delivery person's confirmation step. Both optional — the
// confirmation itself is the point, the details are extra context for disputes.
const schema = z.object({
  receivedBy: z.string().max(80).optional(),
  deliveryNote: z.string().max(300).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiRole(["DELIVERY"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    // Tolerate a missing/!JSON body so a stale client still works.
    const body = await request.json().catch(() => ({}));
    const handover = schema.parse(body ?? {});
    const order = await markDelivered(id, user.id, user.assignedHostelBlocks, handover);
    return NextResponse.json({ order });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Check the handover details"
        : error instanceof Error
          ? error.message
          : "Could not mark delivered";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
