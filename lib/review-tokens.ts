import { createHash, randomBytes } from "crypto";

// reviewLinkProblemMessage lives in lib/review-link-messages.ts so the browser bundle can
// use it without pulling in node:crypto.
export { reviewLinkProblemMessage } from "@/lib/review-link-messages";

// Pure parts of one-tap review links. A review link carries a random token that can do
// exactly one thing: submit the rating for one order. Only its SHA-256 hash is stored.
// The database side lives in lib/review-token-store.ts.

export const REVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 32 random bytes as unpadded base64url is always 43 characters.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashReviewToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateReviewToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashReviewToken(token),
    expiresAt: new Date(now.getTime() + REVIEW_TOKEN_TTL_MS)
  };
}

export function isWellFormedReviewToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export type ReviewTokenRow = { expiresAt: Date; usedAt: Date | null; revokedAt: Date | null };
export type ReviewTokenState = "valid" | "used" | "revoked" | "expired";

export function reviewTokenState(row: ReviewTokenRow, now = new Date()): ReviewTokenState {
  if (row.usedAt) return "used";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export function reviewLink(appUrl: string, trackingCode: string, token: string) {
  return `${appUrl.replace(/\/+$/, "")}/orders/${trackingCode}?review=${token}`;
}
