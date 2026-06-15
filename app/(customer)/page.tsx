import { ClosedOrders } from "@/components/customer/ClosedOrders";
import { HomeLanding } from "@/components/customer/HomeLanding";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function getHomeData() {
  try {
    const settings = await getSettings();
    return { settings };
  } catch {
    return {
      settings: {
        ordersOpen: true,
        closedMessage: "Orders are closed for today.",
        contactNumber: "Admin"
      },
    };
  }
}

export default async function CustomerHomePage() {
  const { settings } = await getHomeData();

  if (!settings.ordersOpen) {
    return <ClosedOrders message={settings.closedMessage} contactNumber={settings.contactNumber} />;
  }

  return <HomeLanding />;
}
