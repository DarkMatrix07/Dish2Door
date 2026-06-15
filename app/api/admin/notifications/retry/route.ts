import { NextResponse } from "next/server";
import { z } from "zod";
import { NotificationChannel } from "@prisma/client";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendSingleOrderNotification } from "@/lib/notifications";

const schema = z.object({
  logId: z.string()
});

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.parse(await request.json());
  const log = await prisma.notificationLog.findUnique({
    where: { id: body.logId }
  });

  if (!log?.orderId) {
    return NextResponse.json({ error: "Retry is only available for order notifications" }, { status: 400 });
  }

  if (log.channel !== NotificationChannel.EMAIL && log.channel !== NotificationChannel.WHATSAPP) {
    return NextResponse.json({ error: "Only email and WhatsApp retries are supported here" }, { status: 400 });
  }

  try {
    await sendSingleOrderNotification(log.orderId, log.channel, log.event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Retry failed" },
      { status: 500 }
    );
  }
}
