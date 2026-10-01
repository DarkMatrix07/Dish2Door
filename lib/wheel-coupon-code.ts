// Wheel coupon codes: "WHEEL" + 6 characters. Ambiguous characters (0/O, 1/I) are left
// out so a code read out over the phone or typed from WhatsApp survives. Pure, so the
// spin route and the admin "give a prize" button share one generator.
export const WHEEL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateWheelCouponCode(random: () => number = Math.random) {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += WHEEL_CODE_ALPHABET[Math.floor(random() * WHEEL_CODE_ALPHABET.length)];
  }
  return `WHEEL${suffix}`;
}
