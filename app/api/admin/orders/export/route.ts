import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { csvRow } from "@/lib/csv";
import { IST_OFFSET_MS, istDayKey } from "@/lib/ist-day";
import { deliveryLabel, itemsSummary, orderStatusLabel, paymentLabel, slotLabel, sourceLabel } from "@/lib/order-labels";
import { buildOrderWhere, parseOrderSearch } from "@/lib/order-search";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

const HEADER = [
  "Tracking code", "Placed (IST)", "Customer", "Phone", "Email", "Campus", "Restaurant", "Slot",
  "Delivery", "Items", "Subtotal (INR)", "Coupon", "Discount (INR)", "Fees (INR)", "GST (INR)",
  "Total (INR)", "Payment", "Status", "Source"
];

const rupees = (paise: number) => Number((paise / 100).toFixed(2));

// "2026-09-29 14:15": sorts and parses cleanly in a spreadsheet, unlike a locale string.
function istStamp(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

// Same filters as the All orders page (page and pageSize are ignored), capped at 5000
// rows. When more match, X-Export-Truncated tells the page to say so.
export async function GET(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orders = await prisma.order.findMany({
    where: buildOrderWhere(parseOrderSearch(searchParams)),
    select: {
      trackingCode: true,
      createdAt: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      deliveryType: true,
      hostelBlock: true,
      orderSlot: true,
      subtotalPaise: true,
      couponCode: true,
      couponDiscountPaise: true,
      platformFeePaise: true,
      hostelFeePaise: true,
      paymentFeePaise: true,
      taxPaise: true,
      totalPaise: true,
      paymentStatus: true,
      status: true,
      source: true,
      campus: { select: { name: true } },
      restaurant: { select: { name: true } },
      items: { select: { nameSnapshot: true, quantity: true } }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ROWS + 1
  });

  const truncated = orders.length > MAX_ROWS;
  const rows = orders.slice(0, MAX_ROWS).map((order) =>
    csvRow([
      order.trackingCode,
      istStamp(order.createdAt),
      order.customerName,
      order.customerPhone,
      order.customerEmail,
      order.campus?.name ?? "Unassigned",
      order.restaurant.name,
      slotLabel(order.orderSlot),
      deliveryLabel(order),
      itemsSummary(order.items),
      rupees(order.subtotalPaise),
      order.couponCode,
      rupees(order.couponDiscountPaise),
      rupees(order.platformFeePaise + order.hostelFeePaise + order.paymentFeePaise),
      rupees(order.taxPaise),
      rupees(order.totalPaise),
      paymentLabel(order),
      orderStatusLabel(order),
      sourceLabel(order.source)
    ])
  );

  // The BOM makes Excel read the file as UTF-8, so non-English names survive.
  const body = `\uFEFF${[csvRow(HEADER), ...rows].join("\r\n")}\r\n`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${istDayKey(new Date())}.csv"`,
      "Cache-Control": "no-store",
      "X-Export-Rows": String(rows.length),
      "X-Export-Truncated": truncated ? "1" : "0"
    }
  });
}
