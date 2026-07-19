import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_SETTINGS_ID, getSettings } from "@/lib/settings";

const schema = z.object({
  ordersOpen: z.boolean(),
  closedMessage: z.string().min(5).max(240),
  contactNumber: z.string().min(3).max(40),
  platformFeePaise: z.number().int().min(0).max(100000),
  hostelDeliveryFeePaise: z.number().int().min(0).max(100000),
  paymentChargePercentBps: z.number().int().min(0).max(10000),
  paymentChargeFixedPaise: z.number().int().min(0).max(100000),
  orderingOpenMinute: z.number().int().min(0).max(1439).optional(),
  orderingCloseMinute: z.number().int().min(0).max(1439).optional()
});

export async function GET() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.parse(await request.json());
  const settings = await prisma.systemSettings.upsert({
    where: { id: DEFAULT_SETTINGS_ID },
    update: body,
    create: { id: DEFAULT_SETTINGS_ID, ...body }
  });

  return NextResponse.json({ settings });
}
