// Lightweight in-memory rate limiter. Resets on restart and is per-process,
// which is fine for the single app instance. Use distinct key prefixes per
// endpoint so their counters don't collide (e.g. `verify:CODE`, `rating:CODE`).
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}
