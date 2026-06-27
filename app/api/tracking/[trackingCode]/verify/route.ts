import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPasscode } from "@/lib/order-codes";
import { orderInclude } from "@/lib/order-select";

const schema = z.object({
  passcode: z.string().length(4)
});

// In-memory throttle: cap passcode guesses per tracking code so the 4-digit
// passcode can't be brute-forced to read a customer's order details. Resets on
// restart and is per-process, which is fine for the single app instance.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: Request, { params }: { params: Promise<{ trackingCode: string }> }) {
  const { trackingCode } = await params;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter the 4-digit passcode." }, { status: 400 });
  }

  if (!rateLimit(trackingCode)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

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

  // Successful unlock — clear the throttle for this tracking code.
  attempts.delete(trackingCode);
  return NextResponse.json({ order });
}
