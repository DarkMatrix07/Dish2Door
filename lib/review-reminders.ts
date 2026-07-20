import {
  NotificationChannel,
  NotificationEvent,
  NotificationStatus,
  OrderStatus,
  PaymentStatus
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { orderEmailHtml, sendOrderEmail } from "@/lib/mail";
import { orderInclude } from "@/lib/order-select";
import { getSettings } from "@/lib/settings";
import {
  dueReminderIndex,
  REVIEW_REMINDER_WINDOW_MS
} from "@/lib/review-schedule";
import { normalizePhone, reviewsUntilSpin } from "@/lib/spin-wheel";


const MAX_PER_RUN = 40;

function reminderCopy(remainingReviews: number) {
  const reward =
    remainingReviews <= 1
      ? "Rate it and your next order spins the discount wheel."
      : `Rate it — ${remainingReviews} more reviews unlocks a spin on the discount wheel.`;
  return {
    subject: "How was your order? Rate it to earn a discount",
    headline: "How was your food?",
    body: `You haven't rated your last order yet. ${reward} It takes about ten seconds.`
  };
}

// Runs from the background interval. Sends at most one reminder per order per run and
// stops permanently once the customer rates (rated orders never match the query).
export async function sendDueReviewReminders(now = new Date()) {
  const settings = await getSettings();
  if (!settings.notifyEmail) return 0;

  const candidates = await prisma.order.findMany({
    where: {
      status: OrderStatus.DELIVERED,
      rating: { is: null },
      deliveredAt: { gte: new Date(now.getTime() - REVIEW_REMINDER_WINDOW_MS), lte: now },
      customerEmail: { not: null },
      paymentStatus: { in: [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY] }
    },
    include: orderInclude,
    orderBy: { deliveredAt: "asc" },
    take: MAX_PER_RUN
  });

  let sent = 0;
  for (const order of candidates) {
    if (!order.customerEmail || !order.deliveredAt) continue;

    const alreadySent = await prisma.notificationLog.count({
      where: { orderId: order.id, event: NotificationEvent.REVIEW_REMINDER }
    });
    if (dueReminderIndex(order.deliveredAt, alreadySent, now) === null) continue;

    const phone = normalizePhone(order.customerPhone);
    const [reviewedCount, customer] = await Promise.all([
      prisma.order.count({ where: { customerPhone: phone, rating: { isNot: null } } }),
      prisma.customer.findUnique({ where: { phone } })
    ]);
    const effectiveCount = Math.max(0, reviewedCount - (customer?.spinBaseline ?? 0));
    const copy = reminderCopy(reviewsUntilSpin(effectiveCount));

    try {
      await sendOrderEmail(order, copy.subject, orderEmailHtml(order, copy.headline, copy.body));
      await prisma.notificationLog.create({
        data: {
          orderId: order.id,
          channel: NotificationChannel.EMAIL,
          event: NotificationEvent.REVIEW_REMINDER,
          status: NotificationStatus.SUCCESS
        }
      });
      sent += 1;
    } catch (error) {
      // Log the failure so it still consumes this reminder slot — a permanently bad
      // address must not be retried forever.
      await prisma.notificationLog.create({
        data: {
          orderId: order.id,
          channel: NotificationChannel.EMAIL,
          event: NotificationEvent.REVIEW_REMINDER,
          status: NotificationStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
  }

  return sent;
}
