import { publicErrorMessage } from "@/lib/public-error";
import { NextResponse } from "next/server";
import { DeliveryType, OrderSlot } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createWhatsAppOrder } from "@/lib/orders";
import { assertOrderSlotAvailable, slotTimesFrom } from "@/lib/order-slots";
import { getSettings } from "@/lib/settings";
import { optionalHostelBlockSchema } from "@/lib/hostels";
import { clientAddress, consumeRateLimit } from "@/lib/rate-limit";
import {
  buildWhatsAppOrderLink,
  buildWhatsAppOrderMessage,
  SUPPORT_WHATSAPP_NUMBER
} from "@/lib/whatsapp-order";

// A WhatsApp shop still writes a real order first, so the shop, campus, stock and fees
// are all validated server-side. The message we hand back is composed from the SAVED
// order, never from numbers the browser sent.
const bodySchema = z.object({
  customer: z
    .object({
      name: z.string().min(2),
      email: z.string().email().optional(),
      phone: z.string().min(8),
      deliveryType: z.nativeEnum(DeliveryType),
      hostelBlock: optionalHostelBlockSchema,
      campusCode: z.string().min(1).optional(),
      // Optional: a WhatsApp shop can run without slots and agree timing in the chat.
      orderSlot: z.nativeEnum(OrderSlot).optional()
    })
    .superRefine((customer, context) => {
      if (customer.deliveryType === DeliveryType.HOSTEL && !customer.hostelBlock) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["hostelBlock"], message: "Select a hostel block" });
      }
    }),
  items: z
    .array(
      z
        .object({
          menuItemId: z.string().min(1).optional(),
          comboId: z.string().min(1).optional(),
          quantity: z.number().int().min(1).max(20)
        })
        .refine((line) => Boolean(line.menuItemId) !== Boolean(line.comboId), {
          message: "Each cart line must be a single item or a single combo"
        })
    )
    .min(1)
});

// Unlike the online path there is no payment step gating this endpoint, so each POST
// writes a real order row straight into the admin's confirmation queue. Cap it per
// phone number: a genuine customer places one order, not six in ten minutes.
const MAX_ORDERS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    const phoneKey = body.customer.phone.replace(/\D/g, "").slice(-10);
    const source = clientAddress(request);
    const limits = await Promise.all([
      consumeRateLimit(`whatsapp-order:${phoneKey}`, MAX_ORDERS, WINDOW_MS),
      consumeRateLimit("whatsapp-global", 120, WINDOW_MS),
      ...(source ? [consumeRateLimit(`whatsapp-source:${source}`, 40, WINDOW_MS)] : [])
    ]);
    if (limits.some((limit) => !limit.allowed)) {
      return NextResponse.json(
        { error: "Too many orders from this number. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    // Only enforce a cutoff when the shop actually asked for a slot.
    const slotTimes = slotTimesFrom(await getSettings());
    if (body.customer.orderSlot) assertOrderSlotAvailable(body.customer.orderSlot, slotTimes);

    const { order, shop, campus } = await createWhatsAppOrder(body.customer, body.items);

    // Diet flags for the veg / non-veg split in the message. Read from the menu rather
    // than the order line, which only snapshots the name and price. Combo lines carry
    // no menuItemId and stay unmarked rather than being guessed at.
    const menuItemIds = order.items.map((item) => item.menuItemId).filter((id): id is string => Boolean(id));
    const dietFlags = menuItemIds.length
      ? await prisma.menuItem.findMany({ where: { id: { in: menuItemIds } }, select: { id: true, isVeg: true } })
      : [];
    const vegById = new Map(dietFlags.map((item) => [item.id, item.isVeg]));

    const message = buildWhatsAppOrderMessage({
      shopName: shop.name,
      trackingCode: order.trackingCode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      campusName: campus.name,
      deliveryType: order.deliveryType,
      hostelBlock: order.hostelBlock,
      slotLabel: order.orderSlot ? slotTimes[order.orderSlot].deliveryLabel : null,
      lines: order.items.map((item) => ({
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPricePaise: item.pricePaise,
        linePaise: item.linePaise,
        isVeg: item.menuItemId ? vegById.get(item.menuItemId) ?? null : null
      })),
      subtotalPaise: order.subtotalPaise,
      platformFeePaise: order.platformFeePaise,
      hostelFeePaise: order.hostelFeePaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise
    });

    return NextResponse.json({
      trackingCode: order.trackingCode,
      totalPaise: order.totalPaise,
      whatsappUrl: buildWhatsAppOrderLink(message, shop.whatsappNumber ?? SUPPORT_WHATSAPP_NUMBER)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Please check your order details." },
        { status: 400 }
      );
    }
    const message = publicErrorMessage(error, "Could not place the order");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
