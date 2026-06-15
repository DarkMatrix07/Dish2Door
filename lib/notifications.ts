import { NotificationChannel, NotificationEvent, NotificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { orderEmailHtml, sendOrderEmail } from "@/lib/mail";
import { orderInclude } from "@/lib/order-select";
import { sendTelegramGroupMessage, telegramOrderText } from "@/lib/telegram";
import { orderWhatsAppText, sendWhatsApp } from "@/lib/whatsapp";

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
  return {
    headline: "Your order is delivered",
    subject: "Your campus food order was delivered",
    body: "Your order has been marked delivered. You can now rate the food and delivery experience."
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
      errorMessage
    }
  });
}

export async function sendSingleOrderNotification(
  orderId: string,
  channel: NotificationChannel,
  event: NotificationEvent,
  passcode?: string
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude
  });
  if (!order) throw new Error("Order not found");

  const copy = eventCopy(event);

  try {
    if (channel === NotificationChannel.EMAIL) {
      const html = orderEmailHtml(order, copy.headline, copy.body, passcode);
      await sendOrderEmail(order, copy.subject, html);
    } else if (channel === NotificationChannel.WHATSAPP) {
      await sendWhatsApp(order, orderWhatsAppText(order, copy.headline, passcode));
    } else {
      await sendTelegramGroupMessage(telegramOrderText(order));
    }

    await logNotification(order.id, channel, event, NotificationStatus.SUCCESS);
  } catch (error) {
    await logNotification(
      order.id,
      channel,
      event,
      NotificationStatus.FAILED,
      error instanceof Error ? error.message : "Unknown notification error"
    );
    throw error;
  }
}

export async function sendOrderEventNotifications(orderId: string, event: NotificationEvent, passcode?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude
  });
  if (!order) return;

  const copy = eventCopy(event);

  await Promise.allSettled([
    sendSingleOrderNotification(order.id, NotificationChannel.EMAIL, event, passcode),
    sendSingleOrderNotification(order.id, NotificationChannel.WHATSAPP, event, passcode)
  ]);

  if (event === NotificationEvent.ORDER_CREATED) {
    await sendSingleOrderNotification(order.id, NotificationChannel.TELEGRAM, event, passcode).catch(() => null);
  }
}
