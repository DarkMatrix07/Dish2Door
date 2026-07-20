import { NotificationChannel, NotificationEvent, NotificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { orderEmailHtml, sendOrderEmail } from "@/lib/mail";
import { orderInclude } from "@/lib/order-select";
import { getSettings } from "@/lib/settings";
import { sendTelegramGroupMessage, telegramOrderText } from "@/lib/telegram";
import { orderWhatsAppText, sendWhatsApp } from "@/lib/whatsapp";

export const NOTIFICATION_RETRY_DELAY_MS = 10 * 60 * 1000;
export const NOTIFICATION_MAX_AUTO_RETRIES = 3;

function eventCopy(event: NotificationEvent) {
  if (event === NotificationEvent.ORDER_CREATED) {
    return {
      headline: "Your order is confirmed",
      subject: "Your campus food order is confirmed",
      body: "We have received your order. Use the tracking link and passcode below to check progress."
    };
  }
  if (event === NotificationEvent.REACHED_CAMPUS) {
    return {
      headline: "Your order has reached campus",
      subject: "Your food has reached campus",
      body: "Your order has reached campus. Please follow the delivery or gate collection instructions."
    };
  }
  // Ratings are what unlock the discount wheel, so the delivered message says so —
  // this is the main prompt that turns a delivery into feedback.
  return {
    headline: "Your order is delivered",
    subject: "Your campus food order was delivered — rate it to earn a discount",
    body: "Your order has been marked delivered. Rate the food and delivery using your tracking link — every 3 rated orders unlocks a spin on our discount wheel."
  };
}

async function logNotification(
  orderId: string | null,
  channel: NotificationChannel,
  event: NotificationEvent,
  status: NotificationStatus,
  errorMessage?: string
) {
  await prisma.notificationLog.create({
    data: {
      orderId,
      channel,
      event,
      status,
      errorMessage,
      nextRetryAt:
        status === NotificationStatus.FAILED &&
        orderId &&
        (channel === NotificationChannel.EMAIL || channel === NotificationChannel.WHATSAPP)
          ? new Date(Date.now() + NOTIFICATION_RETRY_DELAY_MS)
          : null
    }
  });
}

async function deliverOrderNotification(
  orderId: string,
  channel: NotificationChannel,
  event: NotificationEvent,
  passcode?: string
) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw new Error("Order not found");
  const copy = eventCopy(event);

  if (channel === NotificationChannel.EMAIL) {
    await sendOrderEmail(order, copy.subject, orderEmailHtml(order, copy.headline, copy.body, passcode));
  } else if (channel === NotificationChannel.WHATSAPP) {
    await sendWhatsApp(order, orderWhatsAppText(order, copy.headline, passcode));
  } else {
    await sendTelegramGroupMessage(telegramOrderText(order));
  }
}

export async function sendSingleOrderNotification(
  orderId: string,
  channel: NotificationChannel,
  event: NotificationEvent,
  passcode?: string
) {
  try {
    await deliverOrderNotification(orderId, channel, event, passcode);
    await logNotification(orderId, channel, event, NotificationStatus.SUCCESS);
  } catch (error) {
    await logNotification(
      orderId,
      channel,
      event,
      NotificationStatus.FAILED,
      error instanceof Error ? error.message : "Unknown notification error"
    );
    throw error;
  }
}

const retryingLogs = new Set<string>();

export async function retryNotificationLog(logId: string, options?: { force?: boolean }) {
  if (retryingLogs.has(logId)) return { outcome: "already_running" as const };
  retryingLogs.add(logId);

  try {
    const log = await prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!log?.orderId) throw new Error("Retry is only available for order notifications");
    if (log.channel !== NotificationChannel.EMAIL && log.channel !== NotificationChannel.WHATSAPP) {
      throw new Error("Only email and WhatsApp retries are supported");
    }
    if (log.status !== NotificationStatus.FAILED) return { outcome: "not_failed" as const };
    if (!options?.force && (!log.nextRetryAt || log.nextRetryAt > new Date())) {
      return { outcome: "not_due" as const };
    }

    const attemptedAt = new Date();
    const retryCount = log.retryCount + 1;

    try {
      await deliverOrderNotification(log.orderId, log.channel, log.event);
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.SUCCESS,
          errorMessage: null,
          retryCount,
          lastRetryAt: attemptedAt,
          nextRetryAt: null,
          resolvedAt: new Date()
        }
      });
      return { outcome: "recovered" as const, retryCount };
    } catch (error) {
      const canRetryAgain = retryCount < NOTIFICATION_MAX_AUTO_RETRIES;
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          errorMessage: error instanceof Error ? error.message : "Unknown notification error",
          retryCount,
          lastRetryAt: attemptedAt,
          nextRetryAt: canRetryAgain ? new Date(Date.now() + NOTIFICATION_RETRY_DELAY_MS) : null
        }
      });
      throw error;
    }
  } finally {
    retryingLogs.delete(logId);
  }
}

export async function processDueNotificationRetries() {
  const dueLogs = await prisma.notificationLog.findMany({
    where: {
      status: NotificationStatus.FAILED,
      nextRetryAt: { lte: new Date() },
      retryCount: { lt: NOTIFICATION_MAX_AUTO_RETRIES },
      channel: { in: [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP] },
      orderId: { not: null },
      // Review reminders run on their own fixed schedule and a failed one deliberately
      // consumes its slot, so they must never be auto-retried on top of that.
      event: { not: NotificationEvent.REVIEW_REMINDER }
    },
    select: { id: true },
    orderBy: { nextRetryAt: "asc" },
    take: 20
  });

  await Promise.allSettled(dueLogs.map((log) => retryNotificationLog(log.id)));
  return dueLogs.length;
}

export async function sendOrderEventNotifications(orderId: string, event: NotificationEvent, passcode?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude
  });
  if (!order) return;

  const settings = await getSettings();
  const tasks: Promise<unknown>[] = [];

  if (settings.notifyEmail && order.customerEmail) {
    tasks.push(sendSingleOrderNotification(order.id, NotificationChannel.EMAIL, event, passcode));
  } else {
    // No point attempting (and endlessly retrying) email when the order has no
    // address — e.g. manual orders where email is optional. Skip, don't fail.
    tasks.push(
      logNotification(
        order.id,
        NotificationChannel.EMAIL,
        event,
        NotificationStatus.SKIPPED,
        settings.notifyEmail ? "No email address on this order" : "Email notifications are turned off"
      )
    );
  }

  if (settings.notifyWhatsapp) {
    tasks.push(sendSingleOrderNotification(order.id, NotificationChannel.WHATSAPP, event, passcode));
  } else {
    tasks.push(logNotification(order.id, NotificationChannel.WHATSAPP, event, NotificationStatus.SKIPPED, "WhatsApp notifications are turned off"));
  }

  await Promise.allSettled(tasks);

  if (event === NotificationEvent.ORDER_CREATED) {
    await sendSingleOrderNotification(order.id, NotificationChannel.TELEGRAM, event, passcode).catch(() => null);
  }
}
