import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { describeChanges, recordAudit, summariseChanges, type ChangeSpec } from "@/lib/audit";
import { DEFAULT_SETTINGS_ID, getSettings } from "@/lib/settings";
import { promoUntilDayFromNow } from "@/lib/spin-promo";

const schema = z.object({
  ordersOpen: z.boolean(),
  closedMessage: z.string().min(5).max(240),
  contactNumber: z.string().min(3).max(40),
  platformFeePaise: z.number().int().min(0).max(100000),
  hostelDeliveryFeePaise: z.number().int().min(0).max(100000),
  paymentChargePercentBps: z.number().int().min(0).max(10000),
  paymentChargeFixedPaise: z.number().int().min(0).max(100000),
  orderingOpenMinute: z.number().int().min(0).max(1439).optional(),
  orderingCloseMinute: z.number().int().min(0).max(1439).optional(),
  spinWheelForEveryone: z.boolean().optional(),
});

// What the activity log reports when a field here moves. The closed message is named, not
// quoted, to keep the row short.
const SETTING_CHANGES: readonly ChangeSpec[] = [
  { key: "ordersOpen", label: "taking orders", kind: "bool" },
  { key: "closedMessage", label: "closed message", kind: "changed" },
  { key: "contactNumber", label: "contact number", kind: "text" },
  { key: "platformFeePaise", label: "platform fee", kind: "money" },
  { key: "hostelDeliveryFeePaise", label: "hostel delivery fee", kind: "money" },
  { key: "paymentChargePercentBps", label: "payment charge", kind: "bps" },
  { key: "paymentChargeFixedPaise", label: "fixed payment charge", kind: "money" },
  { key: "orderingOpenMinute", label: "opening time", kind: "minute" },
  { key: "orderingCloseMinute", label: "closing time", kind: "minute" },
  { key: "spinWheelForEveryone", label: "wheel open to everyone", kind: "bool" }
];

export async function GET() {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Some settings are missing or invalid." }, { status: 400 });
  const body = parsed.data;
  const current = await getSettings();

  // The ordering window can't wrap past midnight, so opening must come before closing.
  const openMinute = body.orderingOpenMinute ?? current.orderingOpenMinute;
  if (openMinute >= (body.orderingCloseMinute ?? current.orderingCloseMinute)) {
    return NextResponse.json({ error: "Opening time must be before closing time." }, { status: 400 });
  }

  // Switching the everyone-mode promo on stamps the day its ordering window close
  // should end it; switching it off clears the stamp. Saving other settings while the
  // promo runs must not extend it, so only a false -> true transition re-stamps.
  const closeMinute = body.orderingCloseMinute ?? current.orderingCloseMinute;
  const promoFields =
    body.spinWheelForEveryone === undefined || body.spinWheelForEveryone === current.spinWheelForEveryone
      ? {}
      : body.spinWheelForEveryone
        ? { spinWheelEveryoneUntilDay: promoUntilDayFromNow(closeMinute) }
        : { spinWheelEveryoneUntilDay: null };

  const settings = await prisma.systemSettings.upsert({
    where: { id: DEFAULT_SETTINGS_ID },
    update: { ...body, ...promoFields },
    create: { id: DEFAULT_SETTINGS_ID, ...body, ...promoFields }
  });

  const detail = summariseChanges("Store settings", describeChanges(current, body, SETTING_CHANGES));
  if (detail) await recordAudit({ actorId: user.id, action: "settings.update", targetType: "settings", targetId: DEFAULT_SETTINGS_ID, detail });

  return NextResponse.json({ settings });
}
