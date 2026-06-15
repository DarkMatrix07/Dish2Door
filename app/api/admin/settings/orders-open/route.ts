import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_SETTINGS_ID } from "@/lib/settings";

const schema = z.object({
  ordersOpen: z.boolean()
});

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.parse(await request.json());
  const settings = await prisma.systemSettings.upsert({
    where: { id: DEFAULT_SETTINGS_ID },
    update: { ordersOpen: body.ordersOpen },
    create: { id: DEFAULT_SETTINGS_ID, ordersOpen: body.ordersOpen }
  });

  return NextResponse.json({ settings });
}
