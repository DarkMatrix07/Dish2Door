import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

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
