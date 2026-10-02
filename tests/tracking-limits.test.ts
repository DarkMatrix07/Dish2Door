import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTEMPTS_PER_CODE_ALL_SOURCES,
  ATTEMPTS_PER_CODE_AND_SOURCE,
  ATTEMPTS_PER_SOURCE,
  TRACKING_WINDOW_MS,
  passcodeAttemptLimits,
  reviewTokenAttemptLimits
} from "../lib/tracking-limits";

test("the budgets are 8 per code and source, 40 per source and 30 per code", () => {
  assert.equal(ATTEMPTS_PER_CODE_AND_SOURCE, 8);
  assert.equal(ATTEMPTS_PER_SOURCE, 40);
  assert.equal(ATTEMPTS_PER_CODE_ALL_SOURCES, 30);
  assert.equal(TRACKING_WINDOW_MS, 10 * 60 * 1000);
});

test("passcode attempts with a known source use three layers", () => {
  const limits = passcodeAttemptLimits("verify", "ABCD234", "203.0.113.7");
  assert.deepEqual(limits, [
    { key: "tracking-code:ABCD234", max: 30, windowMs: TRACKING_WINDOW_MS },
    { key: "verify:ABCD234:203.0.113.7", max: 8, windowMs: TRACKING_WINDOW_MS },
    { key: "verify-source:203.0.113.7", max: 40, windowMs: TRACKING_WINDOW_MS }
  ]);
});

test("different sources get separate per-code budgets, so a stranger cannot spend the owner budget", () => {
  const owner = passcodeAttemptLimits("verify", "ABCD234", "198.51.100.1").find((l) => l.max === 8);
  const stranger = passcodeAttemptLimits("verify", "ABCD234", "203.0.113.7").find((l) => l.max === 8);
  assert.ok(owner && stranger);
  assert.notEqual(owner.key, stranger.key);
});

test("the per-code ceiling is shared by verify and rating and by every source", () => {
  const a = passcodeAttemptLimits("verify", "ABCD234", "198.51.100.1").find((l) => l.max === 30);
  const b = passcodeAttemptLimits("rating", "ABCD234", "203.0.113.7").find((l) => l.max === 30);
  assert.ok(a && b);
  assert.equal(a.key, b.key);
  const other = passcodeAttemptLimits("verify", "ZZZZ222", "198.51.100.1").find((l) => l.max === 30);
  assert.notEqual(a.key, other?.key);
});

test("verify and rating keep separate per-source budgets", () => {
  const verify = passcodeAttemptLimits("verify", "ABCD234", "203.0.113.7");
  const rating = passcodeAttemptLimits("rating", "ABCD234", "203.0.113.7");
  const keys = new Set([...verify, ...rating].map((l) => l.key));
  // shared ceiling + two per-(code, source) + two per-source
  assert.equal(keys.size, 5);
});

test("without a trusted source address, the per-code budget falls back to 8 from anyone", () => {
  const limits = passcodeAttemptLimits("rating", "ABCD234", null);
  assert.deepEqual(limits, [
    { key: "tracking-code:ABCD234", max: 30, windowMs: TRACKING_WINDOW_MS },
    { key: "rating:ABCD234", max: 8, windowMs: TRACKING_WINDOW_MS }
  ]);
});

test("every key stays within the rate limiter 200 character cap, even for a long IPv6 source", () => {
  const source = "2001:0db8:85a3:0000:0000:8a2e:0370:7334".padEnd(64, "f");
  for (const limit of [...passcodeAttemptLimits("verify", "ABCD234", source), ...reviewTokenAttemptLimits("ABCD234", source)]) {
    assert.ok(limit.key.length <= 200);
  }
});

test("review-link attempts have their own budget and no per-code ceiling", () => {
  const limits = reviewTokenAttemptLimits("ABCD234", "203.0.113.7");
  assert.deepEqual(limits, [
    { key: "review-token:ABCD234:203.0.113.7", max: 8, windowMs: TRACKING_WINDOW_MS },
    { key: "review-token-source:203.0.113.7", max: 40, windowMs: TRACKING_WINDOW_MS }
  ]);
  const passcodeKeys = new Set(passcodeAttemptLimits("verify", "ABCD234", "203.0.113.7").map((l) => l.key));
  assert.ok(limits.every((l) => !passcodeKeys.has(l.key)));
  assert.deepEqual(reviewTokenAttemptLimits("ABCD234", null), [
    { key: "review-token:ABCD234", max: 8, windowMs: TRACKING_WINDOW_MS }
  ]);
});
