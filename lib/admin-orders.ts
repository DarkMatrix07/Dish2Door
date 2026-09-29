import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { REVENUE_ORDER_WHERE } from "@/lib/order-filters";
import { toAdminOrderView } from "@/lib/order-views";
import {
  buildOrderWhere,
  STATUS_FILTERS,
  type OrderSearch,
  type OrderSearchResult,
  type OrderSummary
} from "@/lib/order-search";

// Only the columns the admin list and its view mapper read. The list used to include
// every relation (ratings, delivery staff, full restaurant rows) for every order.
const listSelect = {
  id: true,
  trackingCode: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  hostelBlock: true,
  status: true,
  totalPaise: true,
  deliveryType: true,
  paymentStatus: true,
  orderSlot: true,
  source: true,
  createdAt: true,
  restaurant: { select: { name: true } },
  session: { select: { id: true, label: true } },
  campus: { select: { id: true, code: true, name: true } },
  items: { select: { id: true, nameSnapshot: true, quantity: true } }
} satisfies Prisma.OrderSelect;

// Counts, revenue and the status split for the whole filter (not just the visible
// page), all as database aggregates so nothing is loaded into memory.
export async function summariseOrders(where: Prisma.OrderWhereInput): Promise<OrderSummary> {
  const [revenue, groups] = await Promise.all([
    prisma.order.aggregate({
      where: { AND: [where, REVENUE_ORDER_WHERE] },
      _sum: { totalPaise: true },
      _count: { _all: true }
    }),
    prisma.order.groupBy({ by: ["status"], where, _count: { _all: true } })
  ]);

  const byStatus = Object.fromEntries(STATUS_FILTERS.map((status) => [status, 0])) as OrderSummary["byStatus"];
  for (const group of groups) byStatus[group.status] = group._count._all;

  const revenuePaise = revenue._sum.totalPaise ?? 0;
  const revenueOrders = revenue._count._all;
  return {
    orders: groups.reduce((sum, group) => sum + group._count._all, 0),
    revenuePaise,
    revenueOrders,
    averagePaise: revenueOrders ? Math.round(revenuePaise / revenueOrders) : 0,
    byStatus
  };
}

export async function searchAdminOrders(
  search: OrderSearch,
  options: { page: number; pageSize: number; withSummary?: boolean }
): Promise<OrderSearchResult> {
  const where = buildOrderWhere(search);
  const { page, pageSize } = options;

  const [orders, summary, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: listSelect,
      // id breaks ties so two orders in the same millisecond never swap pages.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    options.withSummary ? summariseOrders(where) : null,
    // With a summary the total falls out of its status split; count only without one.
    options.withSummary ? null : prisma.order.count({ where })
  ]);

  return {
    orders: orders.map(toAdminOrderView),
    total: summary ? summary.orders : (total ?? 0),
    page,
    pageSize,
    ...(summary ? { summary } : {})
  };
}
