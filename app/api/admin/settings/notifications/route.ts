import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { describeChanges, recordAudit, summariseChanges } from "@/lib/audit";
import { DEFAULT_SETTINGS_ID, getSettings } from "@/lib/settings";

const schema = z.object({
  notifyEmail: z.boolean(),
  notifyWhatsapp: z.boolean()
});

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure the settings row exists, then patch only the notification flags.
  const before = await getSettings();
  const body = schema.parse(await request.json());

  const settings = await prisma.systemSettings.update({
    where: { id: DEFAULT_SETTINGS_ID },
    data: { notifyEmail: body.notifyEmail, notifyWhatsapp: body.notifyWhatsapp }
  });

  const detail = summariseChanges(
    "Notifications",
    describeChanges(before, body, [
      { key: "notifyEmail", label: "email to customers", kind: "bool" },
      { key: "notifyWhatsapp", label: "WhatsApp to customers", kind: "bool" }
    ])
  );
  if (detail) await recordAudit({ actorId: user.id, action: "settings.notifications", targetType: "settings", targetId: DEFAULT_SETTINGS_ID, detail });

  return NextResponse.json({
    notifyEmail: settings.notifyEmail,
    notifyWhatsapp: settings.notifyWhatsapp
  });
}
