import { ClosedOrders } from "@/components/customer/ClosedOrders";
import { MenuClient } from "@/components/customer/MenuClient";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function getMenuData() {
  try {
    const [settings, restaurants] = await Promise.all([
      getSettings(),
      prisma.restaurant.findMany({
        where: { active: true },
        include: {
          courses: { orderBy: { sortOrder: "asc" } },
          menuItems: { orderBy: { name: "asc" } }
        },
        orderBy: { name: "asc" }
      })
    ]);

    return { settings, restaurants };
  } catch {
    return {
      settings: {
        ordersOpen: true,
        closedMessage: "Orders are closed for today.",
        contactNumber: "Contact admin"
      },
      restaurants: []
    };
  }
}

export default async function MenuPage() {
  const { settings, restaurants } = await getMenuData();

  if (!settings.ordersOpen) {
    return <ClosedOrders message={settings.closedMessage} contactNumber={settings.contactNumber} />;
  }

  return <MenuClient restaurants={restaurants} />;
}
