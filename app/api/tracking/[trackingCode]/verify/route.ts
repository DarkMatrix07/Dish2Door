import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyOrderPasscode } from "@/lib/order-codes";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";
import { passcodeAttemptLimits } from "@/lib/tracking-limits";
import { toTrackingView } from "@/lib/order-views";

const schema = z.object({
  passcode: z.string().length(4)
});

export async function POST(request: Request, { params }: { params: Promise<{ trackingCode: string }> }) {
  const { trackingCode } = await params;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter the 4-digit passcode." }, { status: 400 });
  }

  if (!/^[A-Z2-9]{7}$/.test(trackingCode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  // Budgets live in lib/tracking-limits.ts: small per (code + address) so a stranger
  // cannot lock the owner out, plus a per-address and a per-code ceiling that keep
  // brute force of the 4-digit passcode bounded. Failures stay uniform.
  const limits = await Promise.all(
    passcodeAttemptLimits("verify", trackingCode, clientAddress(request)).map((spec) =>
      consumeRateLimit(spec.key, spec.max, spec.windowMs)
    )
  );
  if (limits.some((limit) => !limit.allowed)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 429 });
  }

  const order = await prisma.order.findUnique({
    where: { trackingCode },
    include: {
      restaurant: { select: { name: true } },
      items: { select: { nameSnapshot: true, quantity: true, linePaise: true } },
      rating: { select: { id: true } }
    }
  });

  const hash = order?.trackingPasscodeHash || "$2b$12$J4BhNMwYX78srLdhdi6EluJ6GlnQuVKB9ph5WfRFGngYHBdId0lC.";
  const ok = await verifyOrderPasscode(body.passcode, hash);
  if (!ok || !order?.trackingPasscodeHash) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  return NextResponse.json({ order: toTrackingView(order) });
}
