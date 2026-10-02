import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_TOKEN_TTL_MS,
  generateReviewToken,
  hashReviewToken,
  isWellFormedReviewToken,
  reviewLink,
  reviewTokenState
} from "../lib/review-tokens";
import { reviewLinkProblemMessage } from "../lib/review-link-messages";

test("a generated token is 43 url-safe characters and its hash is the SHA-256 of it", () => {
  const { token, tokenHash } = generateReviewToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(tokenHash, hashReviewToken(token));
  assert.notEqual(tokenHash, token);
  assert.equal(isWellFormedReviewToken(token), true);
});

test("tokens are unique", () => {
  const seen = new Set(Array.from({ length: 200 }, () => generateReviewToken().token));
  assert.equal(seen.size, 200);
});

test("a token expires exactly seven days after it was created", () => {
  const now = new Date("2026-10-02T10:00:00.000Z");
  const { expiresAt } = generateReviewToken(now);
  assert.equal(REVIEW_TOKEN_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(expiresAt.toISOString(), "2026-10-09T10:00:00.000Z");
});

test("malformed tokens are rejected before any lookup", () => {
  const bad: unknown[] = ["", "short", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}!`, `${"a".repeat(42)} `, 12345, null, undefined];
  for (const value of bad) {
    assert.equal(isWellFormedReviewToken(value), false);
  }
});

test("token state: valid, used, revoked, expired", () => {
  const now = new Date("2026-10-02T10:00:00.000Z");
  const future = new Date(now.getTime() + 1000);
  const past = new Date(now.getTime() - 1000);
  assert.equal(reviewTokenState({ expiresAt: future, usedAt: null, revokedAt: null }, now), "valid");
  assert.equal(reviewTokenState({ expiresAt: future, usedAt: past, revokedAt: null }, now), "used");
  assert.equal(reviewTokenState({ expiresAt: future, usedAt: null, revokedAt: past }, now), "revoked");
  assert.equal(reviewTokenState({ expiresAt: past, usedAt: null, revokedAt: null }, now), "expired");
  // The expiry instant itself is already too late.
  assert.equal(reviewTokenState({ expiresAt: now, usedAt: null, revokedAt: null }, now), "expired");
  // Used wins over expired so a spent link reads as already used.
  assert.equal(reviewTokenState({ expiresAt: past, usedAt: past, revokedAt: null }, now), "used");
});

test("the review link points at the order page with the token, tolerating a trailing slash", () => {
  assert.equal(reviewLink("https://dish2door.example", "ABCD234", "tok"), "https://dish2door.example/orders/ABCD234?review=tok");
  assert.equal(reviewLink("https://dish2door.example/", "ABCD234", "tok"), "https://dish2door.example/orders/ABCD234?review=tok");
});

test("problem messages are friendly and distinct for used and expired links", () => {
  const used = reviewLinkProblemMessage("used");
  const expired = reviewLinkProblemMessage("expired");
  const other = reviewLinkProblemMessage("revoked");
  assert.match(used, /already been used/);
  assert.match(expired, /expired/);
  assert.match(other, /not valid/);
  assert.equal(reviewLinkProblemMessage(undefined), other);
  assert.match(expired, /passcode/);
});
