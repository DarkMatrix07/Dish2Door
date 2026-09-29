import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { istDayKey, istTodayRange } from "@/lib/ist-day";
import {
  dominosTodayWhere,
  openEarlierWhere,
  summariseBoard,
  toBoardOrder,
  todayBoardWhere,
  unpaidCheckoutsTodayWhere,
  type TodayBoardData
} from "@/lib/today-board";

// Only what the board shows. The board polls this every 30 seconds, so nothing else (no
// emails, payment ids or whole relations) is read or sent.
const boardOrderSelect = {
  id: true,
  trackingCode: true,
  customerName: true,
  customerPhone: true,
  deliveryType: true,
  hostelBlock: true,
  status: true,
  paymentStatus: true,
  source: true,
  orderSlot: true,
  totalPaise: true,
  couponCode: true,
  createdAt: true,
  restaurant: { select: { id: true, name: true } },
  campus: { select: { id: true, code: true, name: true, sortOrder: true } },
  items: { select: { id: true, nameSnapshot: true, quantity: true }, orderBy: { id: "asc" } }
} satisfies Prisma.OrderSelect;

// A backstop for the "still open" strip. A handful of forgotten orders is the normal
// worst case; this only stops old test data from turning the top of the page into a wall.
export const OPEN_EARLIER_LIMIT = 100;

const OLDEST_FIRST = [{ createdAt: "asc" }, { id: "asc" }] satisfies Prisma.OrderOrderByWithRelationInput[];

// One query for today's orders plus a few small ones, all in parallel. The page renders
// this first and the API returns the same shape for the browser's refreshes.
export async function loadTodayBoard(now = new Date()): Promise<TodayBoardData> {
  const range = istTodayRange(now);

  const [todayRows, earlierRows, openEarlierTotal, unpaidCheckouts, dominosOrders] = await Promise.all([
    prisma.order.findMany({ where: todayBoardWhere(range), select: boardOrderSelect, orderBy: OLDEST_FIRST }),
    prisma.order.findMany({
      where: openEarlierWhere(range.start),
      select: boardOrderSelect,
      orderBy: OLDEST_FIRST,
      take: OPEN_EARLIER_LIMIT
    }),
    prisma.order.count({ where: openEarlierWhere(range.start) }),
    prisma.order.count({ where: unpaidCheckoutsTodayWhere(range) }),
    prisma.order.count({ where: dominosTodayWhere(range) })
  ]);

  const orders = todayRows.map(toBoardOrder);
  return {
    generatedAt: now.toISOString(),
    dayLabel: range.label,
    dayKey: istDayKey(range.start),
    orders,
    openEarlier: earlierRows.map(toBoardOrder),
    openEarlierTotal,
    unpaidCheckouts,
    dominosOrders,
    summary: summariseBoard(orders)
  };
}
