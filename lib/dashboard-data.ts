import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { summariseNudges, summariseToday, type DashboardCampus, type SoldOutItem } from "@/lib/dashboard";
import { istDayKey, istTodayRange } from "@/lib/ist-day";
import { getSettings } from "@/lib/settings";
import {
  BOARD_RESTAURANT_WHERE,
  openEarlierWhere,
  todayBoardWhere,
  unpaidCheckoutsTodayWhere
} from "@/lib/today-board";

export const LATEST_ORDERS_LIMIT = 6;

const latestOrderSelect = {
  id: true,
  trackingCode: true,
  customerName: true,
  status: true,
  paymentStatus: true,
  source: true,
  totalPaise: true,
  createdAt: true,
  restaurant: { select: { name: true } },
  campus: { select: { code: true, name: true } },
  items: { select: { id: true, nameSnapshot: true, quantity: true }, orderBy: { id: "asc" } }
} satisfies Prisma.OrderSelect;

export type LatestOrder = Prisma.OrderGetPayload<{ select: typeof latestOrderSelect }>;

// Six queries in parallel, down from sixteen. Today's numbers all come from ONE grouped
// query over the same orders the Today board lists (todayBoardWhere), and the revenue is
// worked out from those rows with the board's own isRevenueOrder rule, so the two screens
// are built from the same orders by the same rules.
export async function loadDashboard(now = new Date()) {
  const range = istTodayRange(now);

  const [settings, campuses, todayRows, latest, soldOut, nudgeRows] = await Promise.all([
    getSettings(),
    prisma.campus.findMany({
      select: { id: true, code: true, name: true, active: true, sortOrder: true },
      orderBy: { sortOrder: "asc" }
    }),
    prisma.order.groupBy({
      by: ["campusId", "status", "paymentStatus"],
      where: todayBoardWhere(range),
      _count: { _all: true },
      _sum: { totalPaise: true }
    }),
    prisma.order.findMany({
      where: todayBoardWhere(range),
      select: latestOrderSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LATEST_ORDERS_LIMIT
    }),
    prisma.menuItem.findMany({
      where: { available: false, restaurant: { active: true, ...BOARD_RESTAURANT_WHERE } },
      select: { id: true, name: true, sizeLabel: true, restaurant: { select: { id: true, name: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }]
    }),
    prisma.order.groupBy({
      by: ["source", "paymentStatus"],
      where: { OR: [openEarlierWhere(range.start), unpaidCheckoutsTodayWhere(range)] },
      _count: { _all: true }
    })
  ]);

  const dashboardCampuses: DashboardCampus[] = campuses;
  const today = summariseToday(
    todayRows.map((row) => ({
      campusId: row.campusId,
      status: row.status,
      paymentStatus: row.paymentStatus,
      count: row._count._all,
      totalPaise: row._sum.totalPaise ?? 0
    })),
    dashboardCampuses
  );
  const nudges = summariseNudges(
    nudgeRows.map((row) => ({ source: row.source, paymentStatus: row.paymentStatus, count: row._count._all }))
  );
  const soldOutItems: SoldOutItem[] = soldOut;

  return {
    settings,
    dayLabel: range.label,
    dayKey: istDayKey(range.start),
    today,
    latest,
    soldOutItems,
    nudges
  };
}
