import { NextResponse } from "next/server";
import { DeliveryType, PaymentStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { createManualOrder } from "@/lib/orders";

const schema = z.object({
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().min(8),
    deliveryType: z.nativeEnum(DeliveryType),
    hostelBlock: z.string().optional()
  }),
  items: z.array(z.object({ menuItemId: z.string(), quantity: z.number().int().min(1).max(20) })).min(1),
  paymentStatus: z.nativeEnum(PaymentStatus)
});

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = schema.parse(await request.json());
    const result = await createManualOrder(
      { ...body.customer, email: body.customer.email || undefined },
      body.items,
      body.paymentStatus
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create manual order" },
      { status: 400 }
    );
  }
}
