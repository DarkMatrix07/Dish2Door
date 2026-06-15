import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPasscode } from "@/lib/order-codes";
import { orderInclude } from "@/lib/order-select";

const schema = z.object({
  passcode: z.string().length(4)
});

export async function POST(request: Request, { params }: { params: Promise<{ trackingCode: string }> }) {
  const { trackingCode } = await params;
  const body = schema.parse(await request.json());
  const order = await prisma.order.findUnique({
    where: { trackingCode },
    include: orderInclude
  });

  if (!order?.trackingPasscodeHash) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const ok = await verifyPasscode(body.passcode, order.trackingPasscodeHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  return NextResponse.json({ order });
}
