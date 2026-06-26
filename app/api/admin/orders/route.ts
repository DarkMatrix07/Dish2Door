import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { orderInclude } from "@/lib/order-select";

const ORDER_STATUSES = ["ORDER_CONFIRMED", "REACHED_CAMPUS", "DELIVERED", "CANCELLED"];
const DELIVERY_TYPES = ["GATE", "HOSTEL"];
const SOURCES = ["CUSTOMER_ONLINE", "ADMIN_MANUAL"];

function startOfDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfDay(value: string) {
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  const user = await requireApiRole(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const status = searchParams.get("status") ?? "all";
  const deliveryType = searchParams.get("deliveryType") ?? "all";
  const source = searchParams.get("source") ?? "all";
  const restaurantId = searchParams.get("restaurantId") ?? "all";
  const sessionId = searchParams.get("sessionId") ?? "all";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? "20") || 20));

  const where: Prisma.OrderWhereInput = {};

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

  return NextResponse.json({ orders, total, page, pageSize });
}
