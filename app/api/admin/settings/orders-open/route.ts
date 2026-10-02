import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { DEFAULT_SETTINGS_ID } from "@/lib/settings";

const schema = z.object({
  ordersOpen: z.boolean()
});

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.parse(await request.json());
  const before = await prisma.systemSettings
    .findUnique({ where: { id: DEFAULT_SETTINGS_ID }, select: { ordersOpen: true } })
    .catch(() => null);
  const settings = await prisma.systemSettings.upsert({
    where: { id: DEFAULT_SETTINGS_ID },
    update: { ordersOpen: body.ordersOpen },
    create: { id: DEFAULT_SETTINGS_ID, ordersOpen: body.ordersOpen }
  });

  if (before?.ordersOpen !== settings.ordersOpen) {
    await recordAudit({
      actorId: user.id,
      action: "settings.orders_open",
      targetType: "settings",
      targetId: DEFAULT_SETTINGS_ID,
      detail: settings.ordersOpen ? "Ordering switched on: customers can place orders" : "Ordering switched off: customers cannot place orders"
    });
  }

  return NextResponse.json({ settings });
}
