import { toAdminOrderView } from "@/lib/order-views";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanupStalePendingOrders } from "@/lib/orders";
import { orderInclude } from "@/lib/order-select";
import { IST_OFFSET_MS } from "@/lib/ist-day";
import { UNPAID_CHECKOUT_WHERE } from "@/lib/order-filters";

const ORDER_STATUSES = ["ORDER_CONFIRMED", "REACHED_CAMPUS", "DELIVERED", "CANCELLED"];
const DELIVERY_TYPES = ["GATE", "HOSTEL"];
const SOURCES = ["CUSTOMER_ONLINE", "ADMIN_MANUAL"];

// The date pickers send calendar days as the admin sees them, in IST. Parsing them in
// the server's own timezone (UTC on the VPS) shifted every range by five and a half hours.
function startOfDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(Date.parse(`${value}T00:00:00Z`) - IST_OFFSET_MS);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfDay(value: string) {
  const start = startOfDay(value);
  return start ? new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
}

export async function GET(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Drop unpaid online orders older than 5 minutes so the list stays clean.
  await cleanupStalePendingOrders().catch(() => null);

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const status = searchParams.get("status") ?? "all";
  const deliveryType = searchParams.get("deliveryType") ?? "all";
  const source = searchParams.get("source") ?? "all";
  const restaurantId = searchParams.get("restaurantId") ?? "all";
  const sessionId = searchParams.get("sessionId") ?? "all";
  const campusId = searchParams.get("campusId") ?? "all";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  // "real" (default) hides online checkouts that were never paid; "unpaid" shows only them.
  const payment = searchParams.get("payment") ?? "real";

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? "20") || 20));

  // Unconfirmed WhatsApp orders are excluded unless explicitly asked for, so they
  // stay on their own page until an admin accepts them.
  const where: Prisma.OrderWhereInput = { status: { not: "AWAITING_CONFIRMATION" } };
  if (payment === "unpaid") where.AND = [UNPAID_CHECKOUT_WHERE];
  else if (payment !== "everything") where.NOT = UNPAID_CHECKOUT_WHERE;

  if (search) {
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search, mode: "insensitive" } },
      { trackingCode: { contains: search, mode: "insensitive" } },
      { items: { some: { nameSnapshot: { contains: search, mode: "insensitive" } } } }
    ];
  }
  if (ORDER_STATUSES.includes(status)) where.status = status as Prisma.OrderWhereInput["status"];
  if (DELIVERY_TYPES.includes(deliveryType)) where.deliveryType = deliveryType as Prisma.OrderWhereInput["deliveryType"];
  if (SOURCES.includes(source)) where.source = source as Prisma.OrderWhereInput["source"];
  if (restaurantId !== "all") where.restaurantId = restaurantId;
  if (sessionId !== "all") where.sessionId = sessionId;
  if (campusId !== "all") where.campusId = campusId;

  const createdAt: Prisma.DateTimeFilter = {};
  if (dateFrom) {
    const from = startOfDay(dateFrom);
    if (from) createdAt.gte = from;
  }
  if (dateTo) {
    const to = endOfDay(dateTo);
    if (to) createdAt.lte = to;
  }
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.order.count({ where })
  ]);

  return NextResponse.json({ orders: orders.map(toAdminOrderView), total, page, pageSize });
}
