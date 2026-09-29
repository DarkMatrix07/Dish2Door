import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";

// Synthetic doubles only: no environment file, database, or real sessions.
process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
process.env.BETTER_AUTH_SECRET = "delivery-switch-test-secret-not-production";

let role: "ADMIN" | "DELIVERY" = "DELIVERY";
let sessionsCreated = 0;
const db = {
  $queryRaw: async () => [{ count: 1, expiresAt: new Date(Date.now() + 900000) }],
  user: { findFirst: async () => ({ id: "staff", name: "Staff", active: true, role, passwordHash: "hash" }) },
  appSession: { create: async () => { sessionsCreated++; return {}; } }
};
(globalThis as unknown as { prisma: unknown }).prisma = db;

const { FEATURES } = await import("../lib/features");
const { POST } = await import("../app/api/session/login/route");

const login = () => POST(new Request("http://test.invalid/api/session/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "rider@example.invalid", password: "correct-password" })
}));

test("the delivery portal ships switched off", () => {
  assert.equal(FEATURES.deliveryPortal, false);
});

test("a delivery account with the right password cannot sign in while the portal is off", async () => {
  const originalCompare = bcrypt.compare;
  (bcrypt as unknown as { compare: unknown }).compare = async () => true;
  try {
    role = "DELIVERY";
    const response = await login();
    assert.equal(response.status, 401);
    // Same generic answer as a wrong password, and no session is ever created.
    assert.deepEqual(await response.json(), { error: "Invalid credentials" });
    assert.equal(sessionsCreated, 0);
  } finally {
    bcrypt.compare = originalCompare;
  }
});
