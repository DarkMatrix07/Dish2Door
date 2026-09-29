import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";

const DUMMY_PASSWORD_HASH = "$2b$12$J4BhNMwYX78srLdhdi6EluJ6GlnQuVKB9ph5WfRFGngYHBdId0lC.";

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(72),
  role: z.enum(["ADMIN", "DELIVERY"]).optional()
});

export async function POST(request: Request) {
  let body: z.infer<typeof loginSchema>;
  try {
    body = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (Buffer.byteLength(body.password) > 72) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const email = body.email.trim().toLowerCase();
  const source = clientAddress(request);
  // Consume before any account lookup/password comparison. Hashing keeps long
  // addresses within the shared limiter's key size and avoids storing raw email.
  const accountKey = createHash("sha256").update(email).digest("hex");
  const windowMs = 15 * 60 * 1000;
  const limits = await Promise.all([
    consumeRateLimit(`login:account:${accountKey}`, 80, windowMs),
    consumeRateLimit("login:global", 1000, windowMs),
    ...(source ? [
      consumeRateLimit(`login:source:${source}`, 30, windowMs),
      consumeRateLimit(`login:account-source:${accountKey}:${source}`, 8, windowMs)
    ] : [])
  ]);
  if (limits.some((limit) => !limit.allowed)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 429 });
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } }
  });
  const hash = user?.passwordHash || DUMMY_PASSWORD_HASH;
  const ok = await verifyPassword(body.password, hash);

  // Delivery logins are refused while the portal is switched off. Same generic error,
  // so the response never confirms that a delivery account's password was right.
  const roleAllowed = user?.role !== "DELIVERY" || FEATURES.deliveryPortal;
  if (user && user.active && roleAllowed && (!body.role || user.role === body.role) && ok) {
    await createAppSession(user.id);
    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
