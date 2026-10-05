// The test site (d2d.divyeshdev.online) runs without payment keys, so its checkout
// places the order straight away instead of opening Razorpay. Switched on with
// TEST_CHECKOUT=1 in that site's settings, and refused on the live domain even if the
// switch is ever copied there.
const LIVE_DOMAIN = "dish2door.store";

export function isTestCheckoutAllowed(flag: string | undefined, appUrl: string | undefined) {
  if (flag !== "1") return false;
  let host = "";
  try {
    host = new URL(appUrl ?? "").hostname.toLowerCase();
  } catch {
    return false;
  }
  return host !== "" && host !== LIVE_DOMAIN && !host.endsWith(`.${LIVE_DOMAIN}`);
}

export function testCheckoutEnabled() {
  return isTestCheckoutAllowed(process.env.TEST_CHECKOUT, process.env.NEXT_PUBLIC_APP_URL);
}
