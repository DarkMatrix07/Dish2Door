import { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

// Featured content is derived from real paid-order history, so the homepage always
// promotes what campus actually buys instead of a hand-maintained list. Everything is
// re-checked against live menu state (item available + restaurant active) before it is
// shown, so a best-seller that just went out of stock never appears.

const PAID: PaymentStatus[] = [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_MANUALLY];

// Long enough to be statistically meaningful on ~180 orders/month, short enough that
// the list still reflects current tastes.
const STATS_WINDOW_DAYS = 60;
const VALUE_PICK_MAX_PAISE = 15_000; // ₹150 — most best-sellers land at ₹120–150.

export type FeaturedDish = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricePaise: number;
  finalPricePaise: number;
  discountPercent: number;
  restaurantId: string;
  restaurantName: string;
  orderCount: number;
};

export type FeaturedCombo = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  comboPricePaise: number;
  realTotalPaise: number;
  savingsPaise: number;
  savingsPercent: number;
  restaurantId: string;
  restaurantName: string;
  items: { id: string; quantity: number; name: string }[];
};

export type FeaturedData = {
  topDishes: FeaturedDish[];
  biryani: FeaturedDish[];
  valuePicks: FeaturedDish[];
  combos: FeaturedCombo[];
  totalOrders: number;
};

function finalPrice(pricePaise: number, discountPercent: number) {
  return Math.round(pricePaise * (1 - discountPercent / 100));
}

export async function getFeaturedData(): Promise<FeaturedData> {
  const cutoff = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // menuItemId is null for combo lines, so those are excluded from dish popularity.
  const [popularity, liveItems, comboRows, totalOrders] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: {
        menuItemId: { not: null },
        order: { paymentStatus: { in: PAID }, createdAt: { gte: cutoff } }
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 60
    }),
    prisma.menuItem.findMany({
      where: { available: true, restaurant: { active: true } },
      include: { restaurant: { select: { id: true, name: true } } }
    }),
    prisma.combo.findMany({
      where: { active: true, restaurant: { active: true } },
      include: {
        restaurant: { select: { id: true, name: true } },
        items: { include: { menuItem: true } }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    }),
    prisma.order.count({ where: { paymentStatus: { in: PAID } } })
  ]);

  const soldById = new Map(popularity.map((row) => [row.menuItemId as string, row._sum.quantity ?? 0]));

  const dishes: FeaturedDish[] = liveItems.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    pricePaise: item.pricePaise,
    finalPricePaise: finalPrice(item.pricePaise, item.discountPercent),
    discountPercent: item.discountPercent,
    restaurantId: item.restaurant.id,
    restaurantName: item.restaurant.name.trim(),
    orderCount: soldById.get(item.id) ?? 0
  }));

  const byPopularity = (a: FeaturedDish, b: FeaturedDish) =>
    b.orderCount - a.orderCount || a.finalPricePaise - b.finalPricePaise;

  const topDishes = dishes.filter((dish) => dish.orderCount > 0).sort(byPopularity).slice(0, 8);

  // "Low-cost biryani": every live biryani, cheapest first, so the price ladder is the
  // point of the rail. Falls back to nothing if a kitchen never lists one.
  const biryani = dishes
    .filter((dish) => /biryani/i.test(dish.name))
    .sort((a, b) => a.finalPricePaise - b.finalPricePaise || b.orderCount - a.orderCount)
    .slice(0, 8);

  const topIds = new Set(topDishes.map((dish) => dish.id));
  const valuePicks = dishes
    .filter((dish) => dish.finalPricePaise <= VALUE_PICK_MAX_PAISE && !topIds.has(dish.id))
    .sort(byPopularity)
    .slice(0, 8);

  const combos: FeaturedCombo[] = comboRows
    .map((combo) => {
      const realTotalPaise = combo.items.reduce(
        (sum, line) => sum + finalPrice(line.menuItem.pricePaise, line.menuItem.discountPercent) * line.quantity,
        0
      );
      const savingsPaise = Math.max(0, realTotalPaise - combo.comboPricePaise);
      return {
        id: combo.id,
        name: combo.name,
        description: combo.description,
        imageUrl: combo.imageUrl ?? combo.items[0]?.menuItem.imageUrl ?? null,
        comboPricePaise: combo.comboPricePaise,
        realTotalPaise,
        savingsPaise,
        savingsPercent: realTotalPaise > 0 ? Math.round((savingsPaise / realTotalPaise) * 100) : 0,
        restaurantId: combo.restaurant.id,
        restaurantName: combo.restaurant.name.trim(),
        items: combo.items.map((line) => ({ id: line.id, quantity: line.quantity, name: line.menuItem.name })),
        // A combo is only sellable while every component is in stock.
        sellable: combo.items.length > 0 && combo.items.every((line) => line.menuItem.available)
      };
    })
    .filter((combo) => combo.sellable)
    .map(({ sellable: _sellable, ...combo }) => combo)
    .slice(0, 6);

  return { topDishes, biryani, valuePicks, combos, totalOrders };
}
