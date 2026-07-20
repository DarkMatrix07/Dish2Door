import {
  DeliveryType,
  NotificationEvent,
  OrderSlot,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { calculateTotals } from "@/lib/money";
import { generatePasscode, generateTrackingCode, hashPasscode } from "@/lib/order-codes";
import { orderInclude } from "@/lib/order-select";
import type { FullOrder } from "@/lib/order-types";
import { assertOrderingWindowOpen } from "@/lib/order-slots";
import { normalizePhone } from "@/lib/spin-wheel";
import { getSettings } from "@/lib/settings";
import { todayLabel } from "@/lib/utils";
import { sendOrderEventNotifications } from "@/lib/notifications";

export type OrderItemInput = {
  menuItemId: string;
  quantity: number;
};

export type CustomerDetails = {
  name: string;
  email?: string;
  phone: string;
  deliveryType: DeliveryType;
  hostelBlock?: string;
  couponCode?: string;
  orderSlot?: OrderSlot;
};

// Notifications can be slow or flaky (WhatsApp/SMTP). Order mutations update the
// database, return immediately, and deliver notifications in the background so no
// admin/customer action is ever blocked on an external provider.
function dispatchNotifications(orderId: string, event: NotificationEvent, passcode?: string) {
  void sendOrderEventNotifications(orderId, event, passcode).catch(() => null);
}

export async function getOrCreateCurrentSession() {
  const openSession = await prisma.orderSession.findFirst({
    where: { isOpen: true },
    orderBy: { startsAt: "desc" }
  });

  if (openSession) return openSession;

  return prisma.orderSession.create({
    data: {
      label: todayLabel(),
      startsAt: new Date(),
      isOpen: true
    }
  });
}

async function uniqueTrackingCode(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const trackingCode = generateTrackingCode();
    const exists = await tx.order.findUnique({ where: { trackingCode } });
    if (!exists) return trackingCode;
  }
  throw new Error("Could not generate a unique tracking code");
}

async function resolveItems(tx: Prisma.TransactionClient, items: OrderItemInput[]) {
  if (items.length === 0) {
    throw new Error("Cart is empty");
  }

  const ids = items.map((item) => item.menuItemId);
  const menuItems = await tx.menuItem.findMany({
    where: {
      id: { in: ids },
      available: true,
      restaurant: { active: true }
    },
    include: { restaurant: true }
  });

  if (menuItems.length !== ids.length) {
    throw new Error("A selected item is out of stock or its restaurant is inactive. Refresh and choose an available item.");
  }

  const restaurantId = menuItems[0]?.restaurantId;
  if (!restaurantId || menuItems.some((item) => item.restaurantId !== restaurantId)) {
    throw new Error("One order can contain items from only one restaurant");
  }

  const itemMap = new Map(menuItems.map((item) => [item.id, item]));
  const orderItems = items.map((input) => {
    const item = itemMap.get(input.menuItemId);
    if (!item) throw new Error("Invalid menu item");
    const quantity = Math.max(1, Math.floor(input.quantity));
    return {
      menuItemId: item.id,
      nameSnapshot: item.name,
      pricePaise: Math.round(item.pricePaise * (1 - item.discountPercent / 100)),
      quantity,
      linePaise: Math.round(item.pricePaise * (1 - item.discountPercent / 100)) * quantity
    };
  });

  const subtotalPaise = orderItems.reduce((total, item) => total + item.linePaise, 0);

  return { restaurantId, orderItems, subtotalPaise };
}

export async function createPendingOnlineOrder(details: CustomerDetails, items: OrderItemInput[]) {
  const settings = await getSettings();

  if (!settings.ordersOpen) {
    throw new Error("Orders are closed");
  }

  assertOrderingWindowOpen(settings.orderingOpenMinute, settings.orderingCloseMinute);

  return prisma.$transaction(async (tx) => {
    const session = await getOrCreateCurrentSession();
    const trackingCode = await uniqueTrackingCode(tx);
    const resolved = await resolveItems(tx, items);
    const coupon = details.couponCode
      ? await tx.coupon.findUnique({ where: { code: details.couponCode.toUpperCase() } })
      : null;
    // Spin-wheel coupons are bound to the phone that won them. If a code has a
    // matching SpinReward, only that phone may redeem it — this blocks a winner from
    // copying the code and using it (or sharing it) on a different account.
    if (coupon) {
      const boundReward = await tx.spinReward.findFirst({ where: { couponCode: coupon.code } });
      if (boundReward && normalizePhone(boundReward.phone) !== normalizePhone(details.phone)) {
        throw new Error("This reward coupon is linked to the phone number that won it and can't be used on another account.");
      }
    }
    const validCoupon =
      coupon &&
      coupon.active &&
      (!coupon.expiresAt || coupon.expiresAt > new Date()) &&
      (coupon.maxUses === null || coupon.usedCount < coupon.maxUses)
        ? coupon
        : null;
    const couponDiscountPaise = validCoupon
      ? Math.round((resolved.subtotalPaise * validCoupon.discountPercent) / 100)
      : 0;
    const totals = calculateTotals(resolved.subtotalPaise, details.deliveryType, settings, true, couponDiscountPaise);

    const order = await tx.order.create({
      data: {
        trackingCode,
        customerName: details.name,
        customerEmail: details.email,
        customerPhone: details.phone,
        deliveryType: details.deliveryType,
        hostelBlock: details.deliveryType === DeliveryType.HOSTEL ? details.hostelBlock : null,
        status: OrderStatus.ORDER_CONFIRMED,
        source: OrderSource.CUSTOMER_ONLINE,
        orderSlot: details.orderSlot ?? null,
        paymentStatus: PaymentStatus.PENDING,
        couponCode: validCoupon?.code,
        restaurantId: resolved.restaurantId,
        sessionId: session.id,
        ...totals,
        items: {
          create: resolved.orderItems
        }
      },
      include: orderInclude
    });

    await tx.payment.create({
      data: {
        orderId: order.id,
        status: PaymentStatus.PENDING,
        amountPaise: totals.totalPaise
      }
    });

    return order;
  });
}

// Online orders are created as PENDING *before* the customer pays. If they close the
// Razorpay popup without paying, that unpaid order would otherwise linger in the admin
// list forever. Clear any online PENDING order that hasn't been paid within 5 minutes.
// OrderItem / Payment / NotificationLog all cascade-delete, so removing the order is
// enough. A captured payment flips the row to PAID_ONLINE first, so it's never matched.
export const PENDING_ORDER_TTL_MS = 5 * 60 * 1000;

export async function cleanupStalePendingOrders() {
  const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MS);
  const result = await prisma.order.deleteMany({
    where: {
      source: OrderSource.CUSTOMER_ONLINE,
      paymentStatus: PaymentStatus.PENDING,
      createdAt: { lt: cutoff }
    }
  });
  return result.count;
}

// Idempotent: safe to call from the browser verify-payment path AND the Razorpay
// webhook. The first caller to flip PENDING -> PAID_ONLINE "wins" (atomic conditional
// update) and runs the one-time side effects (coupon increment + notification). Any
// later caller is a no-op and returns passcode: null (the customer already received
// the passcode by email/WhatsApp on the first confirm).
export async function confirmOnlineOrder(orderId: string, payment: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
}) {
  const passcode = generatePasscode();
  const passcodeHash = await hashPasscode(passcode);

  const claim = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: PaymentStatus.PENDING },
    data: { paymentStatus: PaymentStatus.PAID_ONLINE, trackingPasscodeHash: passcodeHash }
  });

  if (claim.count === 0) {
    // Already confirmed (or not a pending online order) — return current state.
    const existing = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!existing) throw new Error("Order not found");
    return { order: existing, passcode: null as string | null };
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      payment: {
        update: {
          status: PaymentStatus.PAID_ONLINE,
          razorpayOrderId: payment.razorpayOrderId,
          razorpayPaymentId: payment.razorpayPaymentId,
          razorpaySignature: payment.razorpaySignature
        }
      }
    },
    include: orderInclude
  });

  if (order.couponCode) {
    await prisma.coupon.update({
      where: { code: order.couponCode },
      data: { usedCount: { increment: 1 } }
    });
    await redeemSpinRewardIfAny(order.couponCode, order.customerPhone);
  }

  dispatchNotifications(order.id, NotificationEvent.ORDER_CREATED, passcode);
  return { order, passcode: passcode as string | null };
}

// If the coupon just used on a paid order is an outstanding spin-wheel reward for
// this phone, mark it redeemed and reset the loyalty baseline to the current
// reviewed-order count. That zeroes the *wheel-eligibility* counter (so the customer
// must earn 3-6 new reviewed orders to spin again) while leaving the real order
// history untouched. Non-wheel coupons match no reward and are a no-op.
async function redeemSpinRewardIfAny(couponCode: string, customerPhone: string) {
  const phone = normalizePhone(customerPhone);
  const reward = await prisma.spinReward.findFirst({
    where: { couponCode, phone, redeemedAt: null }
  });
  if (!reward) return;

  const reviewedCount = await prisma.order.count({
    where: { customerPhone: { contains: phone }, rating: { isNot: null } }
  });

  await prisma.$transaction([
    prisma.spinReward.update({ where: { id: reward.id }, data: { redeemedAt: new Date() } }),
    prisma.customerLoyalty.upsert({
      where: { phone },
      create: { phone, spinBaseline: reviewedCount, wheelConsumed: false },
      update: { spinBaseline: reviewedCount, wheelConsumed: false }
    })
  ]);
}

// Used by the Razorpay webhook: map a Razorpay order id back to our order via the
// Payment row (persisted at create-payment time), then confirm idempotently. Returns
// null when the Razorpay order is not ours (the account may be shared with other apps).
export async function confirmOnlineOrderByRazorpayOrderId(razorpayOrderId: string, razorpayPaymentId: string) {
  const paymentRow = await prisma.payment.findFirst({
    where: { razorpayOrderId },
    select: { orderId: true }
  });
  if (!paymentRow) return null;

  return confirmOnlineOrder(paymentRow.orderId, { razorpayOrderId, razorpayPaymentId });
}

export async function createManualOrder(details: CustomerDetails, items: OrderItemInput[], paymentStatus: PaymentStatus) {
  const settings = await getSettings();
  const passcode = generatePasscode();
  const passcodeHash = await hashPasscode(passcode);

  const order = await prisma.$transaction(async (tx) => {
    const session = await getOrCreateCurrentSession();
    const trackingCode = await uniqueTrackingCode(tx);
    const resolved = await resolveItems(tx, items);
    const totals = calculateTotals(resolved.subtotalPaise, details.deliveryType, settings, false);

    return tx.order.create({
      data: {
        trackingCode,
        trackingPasscodeHash: passcodeHash,
        customerName: details.name,
        customerEmail: details.email,
        customerPhone: details.phone,
        deliveryType: details.deliveryType,
        hostelBlock: details.deliveryType === DeliveryType.HOSTEL ? details.hostelBlock : null,
        status: OrderStatus.ORDER_CONFIRMED,
        source: OrderSource.ADMIN_MANUAL,
        orderSlot: details.orderSlot ?? null,
        paymentStatus,
        restaurantId: resolved.restaurantId,
        sessionId: session.id,
        ...totals,
        items: {
          create: resolved.orderItems
        }
      },
      include: orderInclude
    });
  });

  dispatchNotifications(order.id, NotificationEvent.ORDER_CREATED, passcode);
  return { order, passcode };
}

export async function markAllReachedCampus() {
  const activeOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.ORDER_CONFIRMED,
      paymentStatus: { in: [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY, PaymentStatus.UNPAID] }
    },
    select: { id: true }
  });

  if (activeOrders.length === 0) {
    return { count: 0 };
  }

  await prisma.order.updateMany({
    where: { id: { in: activeOrders.map((order) => order.id) } },
    data: {
      status: OrderStatus.REACHED_CAMPUS,
      reachedCampusAt: new Date()
    }
  });

  activeOrders.forEach((order) => dispatchNotifications(order.id, NotificationEvent.REACHED_CAMPUS));

  return { count: activeOrders.length };
}

// Assign hostel orders to the delivery board. Releases every pending hostel
// order (confirmed OR already reached), not just reached ones — the delivery
// person then marks each reached and delivered on their side.
export async function releaseHostelDeliveries() {
  const result = await prisma.order.updateMany({
    where: {
      deliveryType: DeliveryType.HOSTEL,
      status: { in: [OrderStatus.ORDER_CONFIRMED, OrderStatus.REACHED_CAMPUS] },
      paymentStatus: { in: [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY, PaymentStatus.UNPAID] },
      deliveryReleased: false
    },
    data: {
      deliveryReleased: true,
      releasedAt: new Date()
    }
  });

  return { count: result.count };
}

// A delivery person marks an assigned hostel order as reached campus.
export async function markDeliveryReached(orderId: string, assignedHostelBlocks: string[]) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findFirst({
      where: {
        id: orderId,
        deliveryType: DeliveryType.HOSTEL,
        hostelBlock: { in: assignedHostelBlocks },
        deliveryReleased: true,
        status: OrderStatus.ORDER_CONFIRMED
      }
    });

    if (!existing) {
      throw new Error("Order is not available to mark reached");
    }

    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.REACHED_CAMPUS, reachedCampusAt: new Date() },
      include: orderInclude
    });
  });

  dispatchNotifications(order.id, NotificationEvent.REACHED_CAMPUS);
  return order;
}

export async function markDelivered(orderId: string, deliveredById: string, assignedHostelBlocks: string[]) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findFirst({
      where: {
        id: orderId,
        deliveryType: DeliveryType.HOSTEL,
        hostelBlock: { in: assignedHostelBlocks },
        deliveryReleased: true,
        status: OrderStatus.REACHED_CAMPUS
      }
    });

    if (!existing) {
      throw new Error("Delivery is not available or already completed");
    }

    return tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredById,
        deliveredAt: new Date()
      },
      include: orderInclude
    });
  });

  dispatchNotifications(order.id, NotificationEvent.DELIVERED);
  return order;
}

export async function markOrderReachedCampus(orderId: string) {
  const existing = await prisma.order.findFirst({
    where: { id: orderId, status: OrderStatus.ORDER_CONFIRMED }
  });
  if (!existing) {
    throw new Error("Only confirmed orders can be marked reached campus");
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.REACHED_CAMPUS, reachedCampusAt: new Date() },
    include: orderInclude
  });

  dispatchNotifications(order.id, NotificationEvent.REACHED_CAMPUS);
  return order;
}

export async function adminMarkOrderDelivered(orderId: string, deliveredById: string) {
  const existing = await prisma.order.findFirst({
    where: { id: orderId, status: OrderStatus.REACHED_CAMPUS }
  });
  if (!existing) {
    throw new Error("Only orders that reached campus can be marked delivered");
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.DELIVERED,
      deliveredById,
      deliveredAt: new Date(),
      deliveryReleased: true,
      releasedAt: existing.releasedAt ?? new Date()
    },
    include: orderInclude
  });

  dispatchNotifications(order.id, NotificationEvent.DELIVERED);
  return order;
}

export async function cancelOrder(orderId: string, refund: boolean) {
  const existing = await prisma.order.findFirst({
    where: {
      id: orderId,
      status: { in: [OrderStatus.ORDER_CONFIRMED, OrderStatus.REACHED_CAMPUS] }
    }
  });
  if (!existing) {
    throw new Error("Only active orders can be cancelled");
  }

  const shouldRefund = refund && existing.paymentStatus === PaymentStatus.PAID_ONLINE;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.CANCELLED,
      paymentStatus: shouldRefund ? PaymentStatus.REFUNDED : existing.paymentStatus,
      ...(shouldRefund ? { payment: { update: { status: PaymentStatus.REFUNDED } } } : {})
    },
    include: orderInclude
  });
}

export async function getOrderForNotification(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude
  });
}

export type { FullOrder };
