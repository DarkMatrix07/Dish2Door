import { createHmac, randomBytes, timingSafeEqual } from "crypto";
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
  return String(Math.floor(1000 + Math.random() * 9000));
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

export async function verifyOrderPasscode(
  passcode: string,
  hash: string,
  trackingCode: string,
  allowReviewPasscode: boolean
) {
  if (await verifyPasscode(passcode, hash)) return true;
  if (!allowReviewPasscode) return false;

  const expected = generateReviewPasscode(trackingCode);
  return timingSafeEqual(Buffer.from(passcode), Buffer.from(expected));
}
