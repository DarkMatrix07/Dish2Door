import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { describeChanges, recordAudit, summariseChanges } from "@/lib/audit";

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
    // Fees price every order, so the log keeps what each figure was and what it became.
    const before = await prisma.campus.findUnique({ where: { id } }).catch(() => null);
    const campus = await prisma.campus.update({ where: { id }, data });
    const detail = summariseChanges(
      campus.name,
      describeChanges(before, data, [
        { key: "name", label: "name", kind: "text" },
        { key: "active", label: "switched on", kind: "bool" },
        { key: "platformFeePaise", label: "platform fee", kind: "money" },
        { key: "hostelDeliveryFeePaise", label: "hostel delivery fee", kind: "money" },
        { key: "hostelDeliveryEnabled", label: "hostel delivery", kind: "bool" },
        { key: "hostelDeliveryNightOnly", label: "hostel delivery at night only", kind: "bool" },
        { key: "paymentChargePercentBps", label: "payment charge", kind: "bps" },
        { key: "paymentChargeFixedPaise", label: "fixed payment charge", kind: "money" }
      ])
    );
    if (detail) await recordAudit({ actorId: user.id, action: "campus.update", targetType: "campus", targetId: campus.id, detail });
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
