// Client-safe (no node imports): used by the tracking page and the review API routes.

// Why a link did not work, for the customer-facing screen. Plain English, no blame.
export function reviewLinkProblemMessage(reason: string | undefined) {
  if (reason === "used") return "This rating link has already been used, so this order has probably been rated already. You can still view your order with your passcode.";
  if (reason === "expired") return "This rating link has expired. Enter your passcode to rate your order.";
  return "This rating link is not valid any more. Enter your passcode to rate your order.";
}
