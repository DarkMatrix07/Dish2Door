// Runs once when the Next.js server process starts (Node.js runtime only).
// Starts a lightweight interval that clears unpaid online orders older than
// 5 minutes, so abandoned Razorpay checkouts don't pile up in the admin list.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cleanupStalePendingOrders } = await import("@/lib/orders");
  const { processDueNotificationRetries } = await import("@/lib/notifications");
  const { revertExpiredEveryoneMode } = await import("@/lib/spin-promo");

  const runCleanup = () =>
    cleanupStalePendingOrders().catch((error) => {
      console.error("[cleanup] stale pending orders failed:", error);
    });

  // First sweep shortly after boot, then every minute.
  setTimeout(runCleanup, 15_000);
  setInterval(runCleanup, 60_000);

  const runNotificationRetries = () =>
    processDueNotificationRetries().catch((error) => {
      console.error("[notifications] automatic retry failed:", error);
    });

  // Retry failed email and WhatsApp deliveries once they have waited 10 minutes.
  setTimeout(runNotificationRetries, 30_000);
  setInterval(runNotificationRetries, 60_000);

  const runSpinPromoRevert = () =>
    revertExpiredEveryoneMode().catch((error) => {
      console.error("[spin] everyone-mode revert failed:", error);
    });

  // End the "wheel for everyone" promo once its ordering window has closed.
  setTimeout(runSpinPromoRevert, 20_000);
  setInterval(runSpinPromoRevert, 60_000);
}
