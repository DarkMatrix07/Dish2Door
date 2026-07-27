import { ClosedOrders } from "@/components/customer/ClosedOrders";
import { MenuClient } from "@/components/customer/MenuClient";
import { prisma } from "@/lib/db";
import { getFeaturedData } from "@/lib/featured";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const EMPTY_FEATURED = { topDishes: [], biryani: [], valuePicks: [], combos: [], totalOrders: 0 };

async function getMenuData() {
  try {
    const [settings, restaurants, featured] = await Promise.all([
      getSettings(),
      prisma.restaurant.findMany({
        where: { active: true },
        // Explicit selects: the client only needs these columns, and shipping the rest
        // (timestamps, foreign keys) inflated the /menu RSC payload for 260+ items.
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          courses: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
          menuItems: {
            select: {
              id: true, name: true, description: true, pricePaise: true,
              discountPercent: true, imageUrl: true, available: true, courseId: true
            },
            orderBy: { name: "asc" }
          },
          combos: {
            where: { active: true },
            select: {
              id: true, name: true, description: true, imageUrl: true, comboPricePaise: true,
              items: {
                select: {
                  id: true,
                  quantity: true,
                  menuItem: { select: { id: true, name: true, imageUrl: true, available: true } }
                },
                orderBy: { menuItem: { name: "asc" } }
              }
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
          }
        },
        orderBy: { name: "asc" }
      }),
      getFeaturedData()
    ]);

    return { settings, restaurants, featured };
  } catch {
    return {
      settings: {
        ordersOpen: true,
        closedMessage: "Orders are closed for today.",
        contactNumber: "Contact admin"
      },
      restaurants: [],
      featured: EMPTY_FEATURED
    };
  }
}

export default async function MenuPage() {
  const { settings, restaurants, featured } = await getMenuData();

  if (!settings.ordersOpen) {
    return <ClosedOrders message={settings.closedMessage} contactNumber={settings.contactNumber} />;
  }

  return <MenuClient restaurants={restaurants} featured={featured} />;
}
