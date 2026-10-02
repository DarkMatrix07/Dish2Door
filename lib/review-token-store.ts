import { ReviewTokenPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  generateReviewToken,
  hashReviewToken,
  reviewLink,
  reviewTokenState,
  type ReviewTokenState
} from "@/lib/review-tokens";

// Creates a one-tap review link for an order. The raw token exists only in the returned
// link; the database keeps its hash.
export async function createReviewLink(orderId: string, trackingCode: string) {
  const { token, tokenHash, expiresAt } = generateReviewToken();
  await prisma.reviewToken.create({
    data: { orderId, tokenHash, purpose: ReviewTokenPurpose.REVIEW, expiresAt }
  });
  return reviewLink(env.NEXT_PUBLIC_APP_URL, trackingCode, token);
}

export type ReviewTokenLookup =
  | { ok: true; tokenId: string; orderId: string }
  | { ok: false; reason: Exclude<ReviewTokenState, "valid"> | "invalid" };

// Looks a token up for one specific tracking code. A token for another order is
// reported as plain "invalid" so it reveals nothing about that order.
export async function lookupReviewToken(token: string, trackingCode: string): Promise<ReviewTokenLookup> {
  const row = await prisma.reviewToken.findUnique({
    where: { tokenHash: hashReviewToken(token) },
    include: { order: { select: { id: true, trackingCode: true } } }
  });
  if (!row || row.purpose !== ReviewTokenPurpose.REVIEW || row.order.trackingCode !== trackingCode) {
    return { ok: false, reason: "invalid" };
  }
  const state = reviewTokenState(row);
  if (state !== "valid") return { ok: false, reason: state };
  return { ok: true, tokenId: row.id, orderId: row.order.id };
}
