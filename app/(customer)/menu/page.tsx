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
        include: {
          courses: { orderBy: { sortOrder: "asc" } },
          menuItems: { orderBy: { name: "asc" } },
          combos: {
            where: { active: true },
            include: { items: { include: { menuItem: true }, orderBy: { menuItem: { name: "asc" } } } },
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
