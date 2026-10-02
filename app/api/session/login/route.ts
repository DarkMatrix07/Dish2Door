import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppSession, verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
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
    await recordAudit({
      actorId: user.id,
      action: "staff.login",
      targetType: "user",
      targetId: user.id,
      detail: `Signed in as ${user.role === "ADMIN" ? "an admin" : "a delivery person"}`
    });
    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
  }

  // The log says what went wrong and, when an account matched, whose it was. It never holds
  // the password or the email that was typed: an unmatched attempt is just "no account".
  // The caller sees the same generic answer whatever the reason.
  // A failed attempt has no actor: whoever typed it is unknown, and filing it under the
  // account's owner would read as if they did it. The account goes in the detail instead.
  const account = user ? ` for ${user.name}'s account` : "";
  await recordAudit({
    actorId: null,
    action: "staff.login",
    targetType: "user",
    targetId: user?.id ?? null,
    outcome: "failed",
    detail: !user
      ? "Sign-in failed: no account matched"
      : !ok
        ? `Sign-in failed: wrong password${account}`
        : !user.active
          ? `Sign-in failed${account}: the account is switched off`
          : !roleAllowed
            ? "Sign-in failed: delivery sign-in is switched off"
            : "Sign-in failed: this account is not allowed to use that sign-in page"
  });
  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
