import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { env } from "@/lib/env";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTrackingCode(length = 7) {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

export function generatePasscode() {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

export function hashPasscode(passcode: string) {
  return bcrypt.hash(passcode, 12);
}

export function verifyPasscode(passcode: string, hash: string) {
  return bcrypt.compare(passcode, hash);
}

export function deriveReviewPasscode(trackingCode: string, secret: string) {
  const digest = createHmac("sha256", secret)
    .update(`dish2door-review:${trackingCode}`)
    .digest();
  return String(digest.readUInt32BE(0) % 10_000).padStart(4, "0");
}

export function generateReviewPasscode(trackingCode: string) {
  const secret = env.BETTER_AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("An authentication secret is required for review passcodes");
  return deriveReviewPasscode(trackingCode, secret);
}

export async function verifyOrderPasscode(passcode: string, hash: string) {
  if (!/^\d{4}$/.test(passcode)) return false;
  return verifyPasscode(passcode, hash);
}
