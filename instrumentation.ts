// Runs once when the Next.js server process starts (Node.js runtime only).
// Starts a lightweight interval that clears unpaid online orders older than
// 5 minutes, so abandoned Razorpay checkouts don't pile up in the admin list.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cleanupStalePendingOrders } = await import("@/lib/orders");

  const runCleanup = () =>
    cleanupStalePendingOrders().catch((error) => {
      console.error("[cleanup] stale pending orders failed:", error);
    });

  // First sweep shortly after boot, then every minute.
  setTimeout(runCleanup, 15_000);
  setInterval(runCleanup, 60_000);
}
