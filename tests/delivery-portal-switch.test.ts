import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import bcrypt from "bcryptjs";

// The sign-in route sets a cookie after the password check. Stub that before the
// route loads so this file does not need a Next.js request scope.
const require = createRequire(import.meta.url);
const nextHeaders = require("next/headers") as { cookies: unknown };
nextHeaders.cookies = async () => ({ set() {} });

// Synthetic doubles only: no environment file, database, or real sessions.
process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
process.env.BETTER_AUTH_SECRET = "delivery-switch-test-secret-not-production";

let role: "ADMIN" | "DELIVERY" = "DELIVERY";
let sessionsCreated = 0;
const db = {
  $queryRaw: async () => [{ count: 1, expiresAt: new Date(Date.now() + 900000) }],
  user: { findFirst: async () => ({ id: "staff", name: "Staff", active: true, role, passwordHash: "hash" }) },
  appSession: { create: async () => { sessionsCreated++; return {}; } },
  // The route records sign-in failures in the activity log; nothing here reads them back.
  auditEvent: { create: async () => ({}) }
};
(globalThis as unknown as { prisma: unknown }).prisma = db;

const { FEATURES } = await import("../lib/features");
const { POST } = await import("../app/api/session/login/route");

const login = () => POST(new Request("http://test.invalid/api/session/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "rider@example.invalid", password: "correct-password" })
}));

test("the delivery portal is switched on", () => {
  assert.equal(FEATURES.deliveryPortal, true);
});

test("a delivery account with the right password can sign in while the portal is on", async () => {
  const originalCompare = bcrypt.compare;
  (bcrypt as unknown as { compare: unknown }).compare = async () => true;
  try {
    role = "DELIVERY";
    const response = await login();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { user: { id: "staff", name: "Staff", role: "DELIVERY" } });
    assert.equal(sessionsCreated, 1);
  } finally {
    bcrypt.compare = originalCompare;
  }
});
