import { prisma } from "@/lib/db";
import { createRazorpayClient } from "@/lib/razorpay";
import { confirmOnlineOrderByRazorpayOrderId } from "@/lib/orders";

// The inbox survives crashes. Confirmation is transactional/idempotent, so two
// workers may safely replay the same event before either records completion.
const dependencies = {
  db: prisma,
  fetchOrder: (id: string) => createRazorpayClient().orders.fetch(id),
  confirm: confirmOnlineOrderByRazorpayOrderId
};
export async function reconcilePaymentEvent(id: string, deps = dependencies) {
  const { db: prisma, fetchOrder, confirm } = deps;
  const event = await prisma.paymentEvent.findUnique({ where: { id } });
  if (!event || event.processedAt) return;
  try {
    if (!event.razorpayOrderId || !event.razorpayPaymentId || !Number.isSafeInteger(event.amountPaise) || event.currency !== "INR") {
      throw new Error("INVALID_CAPTURE_EVENT");
    }
    let mapping = await prisma.payment.findUnique({ where: { razorpayOrderId: event.razorpayOrderId }, select: { orderId: true } });
    if (!mapping) {
      // Fetch server-side provider metadata; never trust a browser-supplied local ID.
      const providerOrder = await fetchOrder(event.razorpayOrderId);
      const localId = providerOrder.receipt;
      const order = localId ? await prisma.order.findUnique({ where: { id: localId }, select: { id: true, trackingCode: true, source: true, totalPaise: true, payment: true } }) : null;
      if (!order) {
        if (providerOrder.notes?.app === "dish2door") throw new Error("LOCAL_ORDER_MISSING");
        // Shared-account event, positively classified using provider metadata.
        await prisma.paymentEvent.update({ where: { id }, data: { processedAt: new Date(), matched: false, lastError: "UNRELATED_PROVIDER_ORDER" } });
        return;
      }
      const notes = providerOrder.notes;
      const tagged = notes?.app === "dish2door" && notes?.orderId === order.id;
      // Pre-remediation orders used trackingCode alone in server-authored notes.
      const legacyTagged = !notes?.app && notes?.trackingCode === order.trackingCode && Boolean(order.trackingCode);
      if (order.source !== "CUSTOMER_ONLINE" || (!tagged && !legacyTagged)) {
        throw new Error("PROVIDER_APPLICATION_MISMATCH");
      }
      if (Number(providerOrder.amount) !== order.totalPaise || providerOrder.currency !== "INR" ||
          event.amountPaise !== order.totalPaise || !order.payment ||
          (order.payment.razorpayOrderId && order.payment.razorpayOrderId !== event.razorpayOrderId)) {
        throw new Error("PROVIDER_MAPPING_CONFLICT");
      }
      await prisma.payment.updateMany({
        where: { orderId: order.id, razorpayOrderId: null },
        data: { razorpayOrderId: event.razorpayOrderId }
      });
      mapping = await prisma.payment.findUnique({ where: { razorpayOrderId: event.razorpayOrderId }, select: { orderId: true } });
      if (!mapping) throw new Error("MAPPING_NOT_READY");
    }
    const confirmed = await confirm(event.razorpayOrderId, event.razorpayPaymentId, {
      amountPaise: event.amountPaise!, currency: event.currency, captured: true
    });
    if (!confirmed) throw new Error("CONFIRMATION_NOT_READY");
    await prisma.paymentEvent.update({ where: { id }, data: {
      matched: true, orderId: mapping.orderId, processedAt: new Date(), lastError: null
    } });
  } catch (error) {
    // Never copy provider/SQL exception text into durable diagnostics.
    const delay = Math.min(60 * 60_000, 30_000 * 2 ** Math.min(event.attempts, 7));
    const codes = ["INVALID_CAPTURE_EVENT", "LOCAL_ORDER_MISSING", "PROVIDER_MAPPING_CONFLICT", "MAPPING_NOT_READY", "CONFIRMATION_NOT_READY", "PROVIDER_APPLICATION_MISMATCH"];
    const code = error instanceof Error && codes.includes(error.message) ? error.message : "RECONCILIATION_REQUIRES_RETRY";
    await prisma.paymentEvent.update({ where: { id }, data: {
      attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + delay), lastError: code
    } });
    console.error("[payments] reconciliation deferred", { eventId: id });
  }
}

let running = false;
export async function reconcilePendingPaymentEvents() {
  if (running) return;
  running = true;
  try {
    const events = await prisma.paymentEvent.findMany({
      where: { processedAt: null, nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: "asc" }, take: 100, select: { id: true }
    });
    for (const event of events) await reconcilePaymentEvent(event.id);
  } finally { running = false; }
}
