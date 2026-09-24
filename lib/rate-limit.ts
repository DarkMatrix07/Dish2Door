import { prisma } from "@/lib/db";

// Shared, expiring counters. A restart does not reset them. Expired rows are
// deleted on write and by evictExpiredRateLimits. If the database is unavailable
// the limiter fails closed for authentication and checkout, and the caller decides.

const MAX_KEY_LENGTH = 200;

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export async function consumeRateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  if (!key || key.length > MAX_KEY_LENGTH || max < 1 || windowMs < 1000) {
    return { allowed: false, retryAfterMs: windowMs };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);

  const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt")
    VALUES (${key}, 1, ${now}, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE
      SET "count" = CASE
            WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1
            ELSE "RateLimitBucket"."count" + 1
          END,
          "windowStart" = CASE
            WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${now}
            ELSE "RateLimitBucket"."windowStart"
          END,
          "expiresAt" = CASE
            WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expiresAt}
            ELSE "RateLimitBucket"."expiresAt"
          END
    RETURNING "count", "expiresAt"
  `;

  const row = rows[0];
  if (!row || row.count > max) {
    const retryAfterMs = row ? Math.max(0, row.expiresAt.getTime() - Date.now()) : windowMs;
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export async function isRateLimited(key: string, max: number) {
  const row = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (!row || row.expiresAt <= new Date()) return false;
  return row.count >= max;
}

export async function evictExpiredRateLimits() {
  const result = await prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  return result.count;
}

// Returns an address only when TRUST_PROXY=1. Otherwise callers must skip
// source limits instead of sharing one global bucket. Prefer X-Real-IP, which
// nginx should set from $remote_addr. The rightmost X-Forwarded-For hop is the
// one a trusted proxy appends; the left side is client-controlled.
export function clientAddress(request: Request): string | null {
  if (process.env.TRUST_PROXY !== "1") return null;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  const hops = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = hops.at(-1);
  return last ? last.slice(0, 64) : null;
}
