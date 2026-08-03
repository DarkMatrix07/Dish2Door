import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Campus commercials. These values price every order, so they are only ever written
// here (admin-only) and always re-read server-side at checkout.
const schema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(60).optional(),
  active: z.boolean().optional(),
  platformFeePaise: z.number().int().min(0).max(100_000).optional(),
  hostelDeliveryFeePaise: z.number().int().min(0).max(100_000).optional(),
  hostelDeliveryEnabled: z.boolean().optional(),
  hostelDeliveryNightOnly: z.boolean().optional(),
  // 10_000 bps = 100%; cap well below that to make a fat-finger impossible.
  paymentChargePercentBps: z.number().int().min(0).max(1_000).optional(),
  paymentChargeFixedPaise: z.number().int().min(0).max(100_000).optional()
});

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, ...data } = schema.parse(await request.json());
    const campus = await prisma.campus.update({ where: { id }, data });
    return NextResponse.json({ campus });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return NextResponse.json(
        { error: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input" },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Could not update campus";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
