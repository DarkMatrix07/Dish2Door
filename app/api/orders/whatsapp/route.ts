import { NextResponse } from "next/server";
import { DeliveryType, OrderSlot } from "@prisma/client";
import { z } from "zod";
import { createWhatsAppOrder } from "@/lib/orders";
import { assertOrderSlotAvailable, ORDER_SLOT_DETAILS } from "@/lib/order-slots";
import { optionalHostelBlockSchema } from "@/lib/hostels";
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
      orderSlot: z.nativeEnum(OrderSlot)
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

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    assertOrderSlotAvailable(body.customer.orderSlot);

    const { order, shop, campus } = await createWhatsAppOrder(body.customer, body.items);

    const message = buildWhatsAppOrderMessage({
      shopName: shop.name,
      trackingCode: order.trackingCode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      campusName: campus.name,
      deliveryType: order.deliveryType,
      hostelBlock: order.hostelBlock,
      slotLabel: order.orderSlot ? ORDER_SLOT_DETAILS[order.orderSlot].deliveryLabel : null,
      lines: order.items.map((item) => ({
        name: item.nameSnapshot,
        quantity: item.quantity,
        linePaise: item.linePaise
      })),
      subtotalPaise: order.subtotalPaise,
      platformFeePaise: order.platformFeePaise,
      hostelFeePaise: order.hostelFeePaise,
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
    const message = error instanceof Error ? error.message : "Could not place the order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
