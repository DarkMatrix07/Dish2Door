import {
  DeliveryType,
  NotificationEvent,
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
};

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
    throw new Error("Some items are unavailable");
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

  return prisma.$transaction(async (tx) => {
    const session = await getOrCreateCurrentSession();
    const trackingCode = await uniqueTrackingCode(tx);
    const resolved = await resolveItems(tx, items);
    const coupon = details.couponCode
      ? await tx.coupon.findUnique({ where: { code: details.couponCode.toUpperCase() } })
      : null;
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

export async function confirmOnlineOrder(orderId: string, payment: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const passcode = generatePasscode();
  const passcodeHash = await hashPasscode(passcode);

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      trackingPasscodeHash: passcodeHash,
      paymentStatus: PaymentStatus.PAID_ONLINE,
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
  }

  await sendOrderEventNotifications(order.id, NotificationEvent.ORDER_CREATED, passcode);
  return { order, passcode };
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

  await sendOrderEventNotifications(order.id, NotificationEvent.ORDER_CREATED, passcode);
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

  await Promise.allSettled(
    activeOrders.map((order) => sendOrderEventNotifications(order.id, NotificationEvent.REACHED_CAMPUS))
  );

  return { count: activeOrders.length };
}

export async function releaseHostelDeliveries() {
  const result = await prisma.order.updateMany({
    where: {
      deliveryType: DeliveryType.HOSTEL,
      status: OrderStatus.REACHED_CAMPUS,
      deliveryReleased: false
    },
    data: {
      deliveryReleased: true,
      releasedAt: new Date()
    }
  });

  return { count: result.count };
}

export async function markDelivered(orderId: string, deliveredById: string) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findFirst({
      where: {
        id: orderId,
        deliveryType: DeliveryType.HOSTEL,
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

  await sendOrderEventNotifications(order.id, NotificationEvent.DELIVERED);
  return order;
}

export async function getOrderForNotification(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude
  });
}

export type { FullOrder };
