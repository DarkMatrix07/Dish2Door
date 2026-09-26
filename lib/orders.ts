import { PublicError } from "@/lib/public-error";
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
import { calculateTotals, GST_RATE_BPS } from "@/lib/money";
import { resolveCampus } from "@/lib/campus";
import { generatePasscode, generateTrackingCode, hashPasscode } from "@/lib/order-codes";
import { orderInclude } from "@/lib/order-select";
import type { FullOrder } from "@/lib/order-types";
import { assertOrderingWindowOpen } from "@/lib/order-slots";
import { isValidIndianMobile, normalizePhone } from "@/lib/spin-wheel";
import { getSettings } from "@/lib/settings";
import { todayLabel } from "@/lib/utils";
import { sendOrderEventNotifications } from "@/lib/notifications";

// A cart line is either a single menu item or a fixed-price combo (exactly one of
// menuItemId / comboId is set). Combos collapse into one order line at their bundle
// price; menu items price as (price - item discount) as before.
export type OrderItemInput = {
  menuItemId?: string;
  comboId?: string;
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
  // Which campus the order is for. Only the code travels from the client; the fees and
  // hostel-delivery rule are always re-read from that campus row on the server.
  campusCode?: string;
};

// Hostel delivery rules are per campus: it can be switched off entirely (a campus may
// launch gate-only), and it can be limited to the night slot. Checked on every
// order-creation path so hiding the option in the UI is not the only thing standing
// between a crafted request and an undeliverable order.
function assertHostelDeliveryAllowed(
  deliveryType: DeliveryType,
  campus: { hostelDeliveryEnabled: boolean; hostelDeliveryNightOnly: boolean },
  orderSlot?: OrderSlot | null
) {
  if (deliveryType !== DeliveryType.HOSTEL) return;
  if (!campus.hostelDeliveryEnabled) {
    throw new PublicError("Hostel delivery is coming soon. Please choose campus gate pickup.");
  }
  if (campus.hostelDeliveryNightOnly && orderSlot !== OrderSlot.NIGHT) {
    throw new PublicError("Hostel delivery runs on night orders only. Choose the night slot, or pick campus gate pickup.");
  }
}

function requireNormalizedPhone(value: string) {
  const phone = normalizePhone(value);
  if (!isValidIndianMobile(phone)) throw new PublicError("Enter a valid 10-digit Indian mobile number");
  return phone;
}

// Every order attaches to the Customer spine, keyed by normalized phone. Name/email
// are recorded only for new customers; guest input cannot overwrite an existing profile. The
// row must exist before the order is written because Order.customerId references it.
async function upsertOrderCustomer(
  tx: Prisma.TransactionClient,
  phone: string,
  details: { name: string; email?: string }
) {
  await tx.customer.upsert({
    where: { phone },
    create: { phone, name: details.name || null, email: details.email || null },
    update: {}
  });
}

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
  throw new PublicError("Could not generate a unique tracking code");
}

type ResolvedLine = {
  menuItemId: string | null;
  nameSnapshot: string;
  pricePaise: number;
  quantity: number;
  linePaise: number;
};

// Turns cart inputs (menu items and/or combos) into authoritative order lines. Prices
// are always taken from the DB — never trusted from the client. A combo becomes ONE
// line at its bundle price, with its contents baked into nameSnapshot. Everything must
// belong to a single restaurant.
async function resolveItems(tx: Prisma.TransactionClient, items: OrderItemInput[]) {
  if (items.length === 0) {
    throw new PublicError("Cart is empty");
  }
  if (items.length > 30) {
    throw new PublicError("Cart is too large");
  }

  const merged = new Map<string, OrderItemInput>();
  for (const input of items) {
    const key = input.menuItemId ? `m:${input.menuItemId}` : `c:${input.comboId}`;
    const previous = merged.get(key);
    const quantity = (previous?.quantity ?? 0) + input.quantity;
    if (quantity > 20) throw new PublicError("Quantity is too high for one item");
    merged.set(key, { ...input, quantity });
  }
  items = [...merged.values()];

  const menuInputs = items.filter((input) => input.menuItemId);
  const comboInputs = items.filter((input) => input.comboId);
  if (menuInputs.length + comboInputs.length !== items.length) {
    throw new PublicError("Invalid cart line");
  }

  const menuIds = menuInputs.map((input) => input.menuItemId as string);
  const comboIds = comboInputs.map((input) => input.comboId as string);

  const [menuItems, combos] = await Promise.all([
    menuIds.length
      ? tx.menuItem.findMany({
          where: { id: { in: menuIds }, available: true, restaurant: { active: true } }
        })
      : Promise.resolve([]),
    comboIds.length
      ? tx.combo.findMany({
          where: { id: { in: comboIds }, active: true, restaurant: { active: true } },
          include: { items: { include: { menuItem: true } } }
        })
      : Promise.resolve([])
  ]);

  if (menuItems.length !== new Set(menuIds).size) {
    throw new PublicError("A selected item is out of stock or its restaurant is inactive. Refresh and choose an available item.");
  }
  if (combos.length !== new Set(comboIds).size) {
    throw new PublicError("A selected combo is no longer available. Refresh and try again.");
  }

  // Every line — menu items and combo components alike — must share one restaurant.
  const restaurantIds = new Set<string>([
    ...menuItems.map((item) => item.restaurantId),
    ...combos.map((combo) => combo.restaurantId)
  ]);
  if (restaurantIds.size !== 1) {
    throw new PublicError("One order can contain items from only one restaurant");
  }
  const restaurantId = [...restaurantIds][0];

  const menuMap = new Map(menuItems.map((item) => [item.id, item]));
  const comboMap = new Map(combos.map((combo) => [combo.id, combo]));

  const orderItems: ResolvedLine[] = items.map((input) => {
    const quantity = Math.max(1, Math.floor(input.quantity));

    if (input.comboId) {
      const combo = comboMap.get(input.comboId);
      if (!combo) throw new PublicError("Invalid combo");
      if (combo.items.length === 0) throw new PublicError(`"${combo.name}" is not available right now.`);
      // A combo is only sellable while every component item is in stock.
      const soldOut = combo.items.find((line) => !line.menuItem.available);
      if (soldOut) throw new PublicError(`"${combo.name}" is unavailable — ${soldOut.menuItem.name} is sold out.`);
      const contents = combo.items.map((line) => `${line.quantity}× ${line.menuItem.name}`).join(", ");
      return {
        menuItemId: null,
        nameSnapshot: `${combo.name} (${contents})`,
        pricePaise: combo.comboPricePaise,
        quantity,
        linePaise: combo.comboPricePaise * quantity
      };
    }

    const item = menuMap.get(input.menuItemId as string);
    if (!item) throw new PublicError("Invalid menu item");
    const unit = Math.round(item.pricePaise * (1 - item.discountPercent / 100));
    return {
      menuItemId: item.id,
      // Sized items share one name across their rows ("Margherita" x Regular/Medium/
      // Large), so without the label the order line says nothing about what to make.
      nameSnapshot: item.sizeLabel ? `${item.name} (${item.sizeLabel})` : item.name,
      pricePaise: unit,
      quantity,
      linePaise: unit * quantity
    };
  });

  const subtotalPaise = orderItems.reduce((total, item) => total + item.linePaise, 0);

  return { restaurantId, orderItems, subtotalPaise };
}

export async function createPendingOnlineOrder(details: CustomerDetails, items: OrderItemInput[], checkoutAttemptId?: string) {
  const settings = await getSettings();
  const customerPhone = requireNormalizedPhone(details.phone);

  const campus = await resolveCampus(details.campusCode);

  if (!settings.ordersOpen) {
    throw new PublicError("Orders are closed");
  }

  assertHostelDeliveryAllowed(details.deliveryType, campus, details.orderSlot);
  assertOrderingWindowOpen(settings.orderingOpenMinute, settings.orderingCloseMinute);

  return prisma.$transaction(async (tx) => {
    const session = await getOrCreateCurrentSession();
    const trackingCode = await uniqueTrackingCode(tx);
    const resolved = await resolveItems(tx, items);

    // A WhatsApp shop is never paid for through Razorpay. Without this, a crafted
    // request could push its items through the paid checkout and skip confirmation.
    const shop = await tx.restaurant.findUnique({ where: { id: resolved.restaurantId } });
    if (!shop || shop.orderMode !== "ONLINE_PAYMENT") {
      throw new PublicError("This shop is ordered over WhatsApp, not paid for online.");
    }
    if (!shop.acceptingOrders) {
      throw new PublicError(`${shop.name} is closed right now. Please try again later.`);
    }
    if (shop.restrictedToCampusCode && shop.restrictedToCampusCode !== campus.code) {
      throw new PublicError(`${shop.name} does not deliver to ${campus.name} yet.`);
    }

    let coupon = details.couponCode
      ? await tx.coupon.findUnique({ where: { code: details.couponCode.toUpperCase() } })
      : null;
    if (coupon && coupon.maxUses !== null && coupon.usedCount + coupon.heldCount >= coupon.maxUses) {
      const released = await supersedeOwnUnpaidHolds(tx, coupon.id, customerPhone);
      if (released) coupon = await tx.coupon.findUnique({ where: { id: coupon.id } });
    }
    // Spin-wheel coupons are bound to the phone that won them. If a code has a
    // matching SpinReward, only that phone may redeem it — this blocks a winner from
    // copying the code and using it (or sharing it) on a different account.
    if (coupon) {
      const boundReward = await tx.spinReward.findFirst({ where: { couponCode: coupon.code } });
      if (boundReward && normalizePhone(boundReward.phone) !== customerPhone) {
        throw new PublicError("This reward coupon is linked to the phone number that won it and can't be used on another account.");
      }
    }
    const couponLooksValid =
      coupon &&
      coupon.active &&
      (!coupon.expiresAt || coupon.expiresAt > new Date()) &&
      (coupon.maxUses === null || coupon.usedCount + coupon.heldCount < coupon.maxUses)
        ? coupon
        : null;
    if (details.couponCode && !couponLooksValid) {
      throw new PublicError("That coupon cannot be applied. Review the total before paying.");
    }
    const validCoupon = couponLooksValid;
    const couponDiscountPaise = validCoupon
      ? Math.round((resolved.subtotalPaise * validCoupon.discountPercent) / 100)
      : 0;
    const totals = calculateTotals(resolved.subtotalPaise, details.deliveryType, campus, true, couponDiscountPaise);

    await upsertOrderCustomer(tx, customerPhone, details);

    const order = await tx.order.create({
      data: {
        trackingCode,
        customerName: details.name,
        customerEmail: details.email,
        customerPhone,
        customerId: customerPhone,
        campusId: campus.id,
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

    if (checkoutAttemptId) {
      await tx.checkoutAttempt.update({ where: { id: checkoutAttemptId }, data: { orderId: order.id } });
    }

    await tx.payment.create({
      data: {
        orderId: order.id,
        status: PaymentStatus.PENDING,
        amountPaise: totals.totalPaise,
        currency: "INR",
        captureState: "PENDING"
      }
    });

    if (validCoupon) {
      const reserved = await tx.$executeRaw`
        UPDATE "Coupon"
        SET "heldCount" = "heldCount" + 1, "updatedAt" = NOW()
        WHERE "id" = ${validCoupon.id}
          AND "active" = true
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
          AND ("maxUses" IS NULL OR "usedCount" + "heldCount" < "maxUses")
      `;
      if (Number(reserved) !== 1) {
        throw new PublicError("That coupon cannot be applied. Review the total before paying.");
      }
      await tx.couponReservation.create({
        data: {
          couponId: validCoupon.id,
          orderId: order.id,
          status: "HELD",
          expiresAt: new Date(Date.now() + PENDING_ORDER_TTL_MS)
        }
      });
    }

    return order;
  });
}

// Online orders are created as PENDING *before* the customer pays. If they close the
// Razorpay popup without paying, mark the local checkout expired after five minutes.
// Payment evidence and discount reservations remain: local expiry cannot make a
// provider order unpayable, and late capture still needs an exact reconciliation.
export const PENDING_ORDER_TTL_MS = 5 * 60 * 1000;

// A customer who opens payment, closes it and then changes their cart gets a new
// checkout, but the old unpaid one still holds a single-use coupon (a wheel reward).
// Expiry deliberately keeps that hold, so without this the customer lost their own
// reward until an admin cancelled the stale order by hand. The newer checkout from the
// SAME phone supersedes it: the stale quote is cancelled and its hold released. This is
// the same transition as an explicit cancellation, so if the old gateway order were
// ever paid, capture would land on a cancelled order and go to refund review, never
// fulfilment. Other customers' holds are never touched.
export async function supersedeOwnUnpaidHolds(tx: Prisma.TransactionClient, couponId: string, customerPhone: string) {
  const holds = await tx.couponReservation.findMany({
    where: {
      couponId,
      status: "HELD",
      order: {
        customerPhone,
        source: OrderSource.CUSTOMER_ONLINE,
        paymentStatus: PaymentStatus.PENDING,
        status: { not: OrderStatus.CANCELLED }
      }
    },
    select: { orderId: true }
  });

  let released = 0;
  for (const { orderId } of holds) {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const [order, payment] = await Promise.all([
      tx.order.findUnique({ where: { id: orderId } }),
      tx.payment.findUnique({ where: { orderId } })
    ]);
    // Re-checked under the lock: any sign that money moved leaves the hold alone.
    if (
      !order ||
      order.status === OrderStatus.CANCELLED ||
      order.paymentStatus !== PaymentStatus.PENDING ||
      payment?.captureState !== "PENDING" ||
      payment.refundState !== "NONE" ||
      payment.razorpayPaymentId
    ) {
      continue;
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED, checkoutState: "ABANDONED" }
    });
    await releaseCancelledReservation(tx, orderId);
    released += 1;
  }
  return released;
}

// Only explicit cancellation releases payable capacity: future capture then goes
// to refund review, so it can never fulfill a quote whose capacity was recycled.
async function releaseCancelledReservation(tx: Prisma.TransactionClient, orderId: string) {
  const reservation = await tx.couponReservation.findUnique({ where: { orderId } });
  if (!reservation || reservation.status !== "HELD") return;
  const claim = await tx.couponReservation.updateMany({ where: { id: reservation.id, status: "HELD" }, data: {
    status: "RELEASED", releasedAt: new Date()
  } });
  if (claim.count === 1) await tx.coupon.update({ where: { id: reservation.couponId }, data: { heldCount: { decrement: 1 } } });
}

export async function cleanupStalePendingOrders() {
  const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MS);
  const stale = await prisma.order.findMany({
    where: {
      source: OrderSource.CUSTOMER_ONLINE,
      paymentStatus: PaymentStatus.PENDING,
      checkoutState: "OPEN",
      createdAt: { lt: cutoff }
    },
    select: { id: true }
  });

  let expired = 0;
  for (const row of stale) {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: { id: row.id, paymentStatus: PaymentStatus.PENDING, checkoutState: "OPEN" },
        data: { checkoutState: "EXPIRED" }
      });
      if (claim.count !== 1) return;
      // Local expiry does not cancel the provider order. Keep its discount capacity
      // reserved until payment is settled or conclusively made unpayable.
      expired += 1;
    });
  }
  return expired;
}

// The same problem on the WhatsApp path: the order row is written when the customer
// taps "Place order", BEFORE they send anything on WhatsApp. Abandon it there and the
// row would sit in the confirmation queue forever.
//
// A day, not hours. We cannot tell an abandoned order from one that was genuinely
// sent and is waiting to be read, so the window has to outlast the shop being closed
// overnight — deleting a real order placed at 10pm before the admin opens the queue
// next morning is far worse than leaving a dead row around for an extra day.
export const AWAITING_CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;

export async function cleanupStaleWhatsAppOrders() {
  const cutoff = new Date(Date.now() - AWAITING_CONFIRMATION_TTL_MS);
  const result = await prisma.order.updateMany({
    where: {
      source: OrderSource.CUSTOMER_WHATSAPP,
      status: OrderStatus.AWAITING_CONFIRMATION,
      checkoutState: "OPEN",
      createdAt: { lt: cutoff }
    },
    data: { status: OrderStatus.CANCELLED, checkoutState: "ABANDONED" }
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
  amountPaise: number;
  currency: string;
  captured: boolean;
}) {
  if (!payment.captured) {
    await prisma.payment.updateMany({
      where: { orderId, captureState: "PENDING" },
      data: { captureState: "AUTHORIZED", razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId: payment.razorpayPaymentId }
    });
    return { order: null, passcode: null as string | null, pending: true };
  }
  const passcode = generatePasscode();
  const passcodeHash = await hashPasscode(passcode);

  if (payment.currency !== "INR" || !Number.isInteger(payment.amountPaise)) {
    throw new PublicError("Payment could not be matched to an order");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const paymentRow = await tx.payment.findUnique({ where: { orderId } });
    if (!paymentRow || paymentRow.amountPaise !== payment.amountPaise || paymentRow.currency !== "INR" || paymentRow.razorpayOrderId !== payment.razorpayOrderId) {
      throw new PublicError("Payment could not be matched to an order");
    }
    const current = await tx.order.findUnique({ where: { id: orderId } });
    if (!current) throw new PublicError("Order not found");
    if (current.status === OrderStatus.CANCELLED) {
      await releaseCancelledReservation(tx, orderId);
      const refunded = paymentRow.refundState === "SUCCEEDED" || paymentRow.status === PaymentStatus.REFUNDED;
      await tx.payment.update({
        where: { orderId },
        data: {
          status: refunded ? PaymentStatus.REFUNDED : PaymentStatus.PAID_ONLINE,
          captureState: "CAPTURED",
          // Replayed capture must not downgrade a completed/in-flight refund.
          refundState: refunded ? "SUCCEEDED" : paymentRow.refundState === "PENDING" ? "PENDING" : "REQUESTED",
          refundAmountPaise: payment.amountPaise,
          razorpayOrderId: payment.razorpayOrderId,
          razorpayPaymentId: payment.razorpayPaymentId
        }
      });
      const cancelled = await tx.order.update({ where: { id: orderId }, data: {
        paymentStatus: refunded ? PaymentStatus.REFUNDED : PaymentStatus.PAID_ONLINE
      }, include: orderInclude });
      return { order: cancelled, claimed: false };
    }

    const reservation = await tx.couponReservation.findUnique({ where: { orderId } });
    if (current.paymentStatus === PaymentStatus.PENDING && current.couponCode && reservation?.status !== "HELD") {
      // Legacy or previously released quotes must acquire capacity atomically. A
      // captured payment cannot authorize exceeding a coupon's promised capacity.
      const capacity = await tx.$executeRaw`
        UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
        WHERE "code" = ${current.couponCode}
          AND ("maxUses" IS NULL OR "usedCount" + "heldCount" < "maxUses")
      `;
      if (Number(capacity) !== 1) {
        await tx.payment.update({ where: { orderId }, data: {
          status: PaymentStatus.PAID_ONLINE, captureState: "CAPTURED", refundState: "REQUESTED",
          refundAmountPaise: payment.amountPaise, razorpayPaymentId: payment.razorpayPaymentId
        } });
        const cancelled = await tx.order.update({ where: { id: orderId }, data: {
          status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID_ONLINE,
          checkoutState: "ABANDONED"
        }, include: orderInclude });
        return { order: cancelled, claimed: false };
      }
    }

    const claim = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: PaymentStatus.PENDING, status: { not: OrderStatus.CANCELLED } },
      data: { paymentStatus: PaymentStatus.PAID_ONLINE, trackingPasscodeHash: passcodeHash, checkoutState: "OPEN" }
    });

    if (claim.count === 0) {
      const existing = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!existing) throw new PublicError("Order not found");
      return { order: existing, claimed: false };
    }

    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        payment: {
          update: {
            status: PaymentStatus.PAID_ONLINE,
            razorpayOrderId: payment.razorpayOrderId,
            razorpayPaymentId: payment.razorpayPaymentId,
            razorpaySignature: payment.razorpaySignature,
            captureState: "CAPTURED"
          }
        }
      },
      include: orderInclude
    });

    if (reservation?.status === "HELD") {
      const consumed = await tx.couponReservation.updateMany({
        where: { id: reservation.id, status: "HELD" },
        data: { status: "CONSUMED", consumedAt: new Date() }
      });
      if (consumed.count === 1) {
        await tx.coupon.update({
          where: { id: reservation.couponId },
          data: { heldCount: { decrement: 1 }, usedCount: { increment: 1 } }
        });
        if (order.couponCode) await redeemSpinRewardIfAny(tx, order.couponCode, order.customerPhone, order.id);
      }
    } else if (order.couponCode) {
      if (reservation) {
        await tx.couponReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED", consumedAt: new Date() } });
      }
      // Capacity was accounted for above, including pre-migration pending orders.
      await redeemSpinRewardIfAny(tx, order.couponCode, order.customerPhone, order.id);
    }

    return { order, claimed: true };
  });

  if (!result.claimed) return { order: result.order, passcode: null as string | null };

  dispatchNotifications(result.order.id, NotificationEvent.ORDER_CREATED, passcode);
  return { order: result.order, passcode: passcode as string | null };
}

// If the coupon just used on a paid order is an outstanding spin-wheel reward for
// this phone, mark it redeemed (recording which order spent it) and reset the loyalty
// baseline to the current reviewed-order count. That zeroes the wheel-eligibility
// counter, so the customer must review another 3 orders to earn the next spin, while
// leaving the real order history untouched. Non-wheel coupons are a no-op.
async function redeemSpinRewardIfAny(
  tx: Prisma.TransactionClient,
  couponCode: string,
  customerPhone: string,
  orderId: string
) {
  const phone = normalizePhone(customerPhone);
  const reward = await tx.spinReward.findFirst({
    where: { couponCode, phone, redeemedAt: null, expiredAt: null }
  });
  if (!reward) return;

  const [reviewedCount, customer] = await Promise.all([
    tx.order.count({ where: { customerPhone: phone, rating: { isNot: null } } }),
    tx.customer.findUnique({ where: { phone } })
  ]);

  await tx.spinReward.update({
    where: { id: reward.id },
    data: { redeemedAt: new Date(), orderId, baselineBefore: customer?.spinBaseline ?? 0 }
  });
  await tx.customer.upsert({
    where: { phone },
    create: { phone, spinBaseline: reviewedCount, wheelConsumed: false },
    update: { spinBaseline: reviewedCount, wheelConsumed: false }
  });
}

// Used by the Razorpay webhook: map a Razorpay order id back to our order via the
// Payment row (persisted at create-payment time), then confirm idempotently. Returns
// null when the Razorpay order is not ours (the account may be shared with other apps).
export async function confirmOnlineOrderByRazorpayOrderId(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  capture: { amountPaise: number; currency: string; captured: boolean }
) {
  const paymentRow = await prisma.payment.findFirst({
    where: { razorpayOrderId },
    select: { orderId: true }
  });
  if (!paymentRow) return null;

  return confirmOnlineOrder(paymentRow.orderId, {
    razorpayOrderId,
    razorpayPaymentId,
    amountPaise: capture.amountPaise,
    currency: capture.currency,
    captured: capture.captured
  });
}

export async function createManualOrder(details: CustomerDetails, items: OrderItemInput[], paymentStatus: PaymentStatus) {
  const settings = await getSettings();
  const customerPhone = requireNormalizedPhone(details.phone);
  const campus = await resolveCampus(details.campusCode);
  assertHostelDeliveryAllowed(details.deliveryType, campus, details.orderSlot);
  const passcode = generatePasscode();
  const passcodeHash = await hashPasscode(passcode);

  const order = await prisma.$transaction(async (tx) => {
    const session = await getOrCreateCurrentSession();
    const trackingCode = await uniqueTrackingCode(tx);
    const resolved = await resolveItems(tx, items);
    const totals = calculateTotals(resolved.subtotalPaise, details.deliveryType, campus, false);

    await upsertOrderCustomer(tx, customerPhone, details);

    return tx.order.create({
      data: {
        trackingCode,
        trackingPasscodeHash: passcodeHash,
        customerName: details.name,
        customerEmail: details.email,
        customerPhone,
        customerId: customerPhone,
        campusId: campus.id,
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

// A WhatsApp-mode shop takes no online payment, so the order is written as UNPAID and
// AWAITING_CONFIRMATION and stays out of the kitchen and delivery lists until an admin
// accepts it. No payment-handling fee is charged because no gateway is involved.
export async function createWhatsAppOrder(details: CustomerDetails, items: OrderItemInput[]) {
  const customerPhone = requireNormalizedPhone(details.phone);
  const campus = await resolveCampus(details.campusCode);

  // Deliberately NOT gated on the global settings.ordersOpen / ordering window: a
  // WhatsApp shop keeps its own hours through its `acceptingOrders` toggle (checked
  // below). Otherwise the shop would render as open while every checkout failed.
  // Delivery slot cutoffs still apply — the caller checks those.
  assertHostelDeliveryAllowed(details.deliveryType, campus, details.orderSlot);

  return prisma.$transaction(async (tx) => {
    const session = await getOrCreateCurrentSession();
    const trackingCode = await uniqueTrackingCode(tx);
    const resolved = await resolveItems(tx, items);

    const shop = await tx.restaurant.findUnique({ where: { id: resolved.restaurantId } });
    if (!shop || !shop.active) throw new PublicError("This shop is not available right now.");
    if (shop.orderMode !== "WHATSAPP") throw new PublicError("This shop takes payment online, not over WhatsApp.");
    if (!shop.acceptingOrders) throw new PublicError(`${shop.name} is closed right now. Please try again later.`);
    if (shop.restrictedToCampusCode && shop.restrictedToCampusCode !== campus.code) {
      throw new PublicError(`${shop.name} does not deliver to ${campus.name} yet.`);
    }

    // includePaymentFee = false: nothing goes through Razorpay on this path. GST is
    // charged here (and only here) — this shop bills like a restaurant.
    const totals = calculateTotals(resolved.subtotalPaise, details.deliveryType, campus, false, 0, GST_RATE_BPS);

    await upsertOrderCustomer(tx, customerPhone, details);

    const order = await tx.order.create({
      data: {
        trackingCode,
        customerName: details.name,
        customerEmail: details.email,
        customerPhone,
        customerId: customerPhone,
        campusId: campus.id,
        deliveryType: details.deliveryType,
        hostelBlock: details.deliveryType === DeliveryType.HOSTEL ? details.hostelBlock : null,
        status: OrderStatus.AWAITING_CONFIRMATION,
        source: OrderSource.CUSTOMER_WHATSAPP,
        orderSlot: details.orderSlot ?? null,
        paymentStatus: PaymentStatus.UNPAID,
        restaurantId: resolved.restaurantId,
        sessionId: session.id,
        ...totals,
        items: { create: resolved.orderItems }
      },
      include: orderInclude
    });

    return { order, shop, campus };
  });
}

// An admin accepting a WhatsApp order is what puts it into the normal pipeline: only
// then does it appear in today's orders, the kitchen sheet and delivery lists.
export async function confirmWhatsAppOrder(orderId: string) {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) throw new PublicError("Order not found");
  if (existing.status !== OrderStatus.AWAITING_CONFIRMATION) {
    // Already handled (double click, two admins) — return it rather than erroring.
    return prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  }

  const passcode = generatePasscode();
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.ORDER_CONFIRMED,
      trackingPasscodeHash: await hashPasscode(passcode)
    },
    include: orderInclude
  });

  dispatchNotifications(order.id, NotificationEvent.ORDER_CREATED, passcode);
  return order;
}

// Sweeps the day's confirmed orders to REACHED_CAMPUS in one click. WhatsApp-mode
// shops are excluded: they run their own handover flow, so a sweep from the main
// dashboard must not advance them (or fire their notifications). Those orders are
// moved individually from the per-order controls on the Orders page.
export async function markAllReachedCampus() {
  const activeOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.ORDER_CONFIRMED,
      paymentStatus: { in: [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY, PaymentStatus.UNPAID] },
      restaurant: { orderMode: "ONLINE_PAYMENT" }
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
      throw new PublicError("Order is not available to mark reached");
    }

    return tx.order.update({
      where: { id: orderId, status: OrderStatus.ORDER_CONFIRMED, deliveryReleased: true, hostelBlock: { in: assignedHostelBlocks } },
      data: { status: OrderStatus.REACHED_CAMPUS, reachedCampusAt: new Date() },
      include: orderInclude
    });
  });

  dispatchNotifications(order.id, NotificationEvent.REACHED_CAMPUS);
  return order;
}

export async function markDelivered(
  orderId: string,
  deliveredById: string,
  assignedHostelBlocks: string[],
  handover: { receivedBy?: string; deliveryNote?: string } = {}
) {
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
      throw new PublicError("Delivery is not available or already completed");
    }

    return tx.order.update({
      where: { id: orderId, status: OrderStatus.REACHED_CAMPUS, deliveryReleased: true, hostelBlock: { in: assignedHostelBlocks } },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredById,
        deliveredAt: new Date(),
        receivedBy: handover.receivedBy?.trim() || null,
        deliveryNote: handover.deliveryNote?.trim() || null
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
    throw new PublicError("Only confirmed orders can be marked reached campus");
  }

  const order = await prisma.order.update({
    where: { id: orderId, status: OrderStatus.ORDER_CONFIRMED },
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
    throw new PublicError("Only orders that reached campus can be marked delivered");
  }

  const order = await prisma.order.update({
    where: { id: orderId, status: OrderStatus.REACHED_CAMPUS },
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

export async function cancelOrder(orderId: string, refund: boolean, pendingOnly = false) {
  return prisma.$transaction(async (tx) => {
    // Same lock order as capture: neither operation may resurrect a cancelled order
    // or overwrite a captured payment with a stale PENDING value.
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const existing = await tx.order.findUnique({ where: { id: orderId } });
    if (!existing || !([OrderStatus.AWAITING_CONFIRMATION, OrderStatus.ORDER_CONFIRMED, OrderStatus.REACHED_CAMPUS] as OrderStatus[]).includes(existing.status)) {
      throw new PublicError("Only active orders can be cancelled");
    }
    if (pendingOnly) {
      const payment = await tx.payment.findUnique({ where: { orderId } });
      if (existing.source !== OrderSource.CUSTOMER_ONLINE || existing.checkoutState !== "EXPIRED" || existing.paymentStatus !== PaymentStatus.PENDING || payment?.captureState !== "PENDING" || payment.refundState !== "NONE" || Boolean(payment.razorpayPaymentId)) {
        throw new PublicError("This payment is already being processed. Check payment status instead of paying again.");
      }
    }
    const shouldRefund = refund && existing.paymentStatus === PaymentStatus.PAID_ONLINE;
    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        checkoutState: "ABANDONED",
        // A request is not a completed refund. Preserve captured payment truth.
        ...(shouldRefund ? { payment: { update: {
          refundState: "REQUESTED", refundAmountPaise: existing.totalPaise
        } } } : {})
      },
      include: orderInclude
    });
    await releaseCancelledReservation(tx, order.id);
    await restoreSpinRewardForCancelledOrder(tx, order.id, order.couponCode);
    return order;
  });
}

// Cancelling an order gives back any spin-wheel reward it consumed: the coupon becomes
// usable again and the reward returns to "outstanding", so the customer keeps a prize
// they legitimately won instead of silently losing it with the order.
async function restoreSpinRewardForCancelledOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  couponCode: string | null
) {
  if (!couponCode) return;
  const reward = await tx.spinReward.findFirst({
    where: { orderId, couponCode, redeemedAt: { not: null } }
  });
  if (!reward) return;

  // Another live reward already exists for this phone (the partial unique index allows
  // only one), so reopening this one would violate it. Leave it redeemed.
  const live = await tx.spinReward.findFirst({
    where: { phone: reward.phone, redeemedAt: null, expiredAt: null }
  });
  if (live) return;

  await tx.spinReward.update({
    where: { id: reward.id },
    data: { redeemedAt: null, orderId: null }
  });
  await tx.coupon.updateMany({
    where: { code: couponCode, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } }
  });
  // Rewind the cycle to exactly where it was before this reward was spent.
  if (reward.baselineBefore !== null) {
    await tx.customer.updateMany({
      where: { phone: reward.phone },
      data: { spinBaseline: reward.baselineBefore }
    });
  }
}

export async function getOrderForNotification(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude
  });
}

export type { FullOrder };
