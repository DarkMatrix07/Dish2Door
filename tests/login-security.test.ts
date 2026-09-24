import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";

// The actual route and shared limiter run against a synthetic persistent store.
// No environment file, network, database, password hashing, or sessions are used.
const counters = new Map<string, { count: number; expiresAt: Date }>();
let comparisons = 0;
let lookups = 0;
let sessions = 0;
const db = {
  $queryRaw: async (_parts: unknown, ...values: unknown[]) => {
    const key = String(values[0]);
    const old = counters.get(key);
    const row = { count: old && old.expiresAt > new Date() ? old.count + 1 : 1, expiresAt: old && old.expiresAt > new Date() ? old.expiresAt : new Date(Date.now() + 900000) };
    counters.set(key, row);
    return [row];
  },
  user: { findFirst: async () => { lookups++; return { id: "test", active: true, role: "ADMIN", passwordHash: "test" }; } },
  appSession: { create: async () => { sessions++; throw new Error("Session creation must not be reached"); } }
};
(globalThis as unknown as { prisma: unknown }).prisma = db;
const { POST } = await import("../app/api/session/login/route");
const originalCompare = bcrypt.compare;
const attempt = (email = "staff@example.invalid") => POST(new Request("http://test.invalid/api/session/login", {
  method: "POST", headers: { "content-type": "application/json", "x-real-ip": "spoofed" },
  body: JSON.stringify({ email, password: "password" })
}));

test("login budgets deny before password/session work, including without trusted source; window expiry recovers", async () => {
  const previous = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  (bcrypt as unknown as { compare: unknown }).compare = async () => { comparisons++; return false; };
  try {
    for (let i = 0; i < 80; i++) assert.equal((await attempt()).status, 401);
    // A correct password after exhaustion must still never reach verification.
    (bcrypt as unknown as { compare: unknown }).compare = async () => { comparisons++; return true; };
    assert.equal((await attempt()).status, 429);
    assert.equal(comparisons, 80);
    assert.equal(lookups, 80);
    assert.equal(sessions, 0);
    for (const row of counters.values()) row.expiresAt = new Date(0);
    (bcrypt as unknown as { compare: unknown }).compare = async () => { comparisons++; return false; };
    assert.equal((await attempt()).status, 401);
    assert.equal(comparisons, 81);
    counters.clear();
    process.env.TRUST_PROXY = "1";
    for (let i = 0; i < 8; i++) assert.equal((await attempt()).status, 401);
    const before = comparisons;
    assert.equal((await attempt()).status, 429);
    assert.equal(comparisons, before);
    assert.equal(sessions, 0);
    // Distributed-account guessing must also have a budget without proxy trust.
    delete process.env.TRUST_PROXY;
    counters.set("login:global", { count: 1000, expiresAt: new Date(Date.now() + 900000) });
    assert.equal((await attempt("another@example.invalid")).status, 429);
    assert.equal(comparisons, before);
    assert.equal(sessions, 0);
  } finally {
    bcrypt.compare = originalCompare;
    if (previous === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = previous;
  }
});
