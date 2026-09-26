import { ClosedOrders } from "@/components/customer/ClosedOrders";
import { HomeLanding } from "@/components/customer/HomeLanding";
import { listActiveCampuses } from "@/lib/campus";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function getHomeData() {
  try {
    const [settings, campuses] = await Promise.all([getSettings(), listActiveCampuses()]);
    // The landing copy only promises hostel delivery while some campus actually runs it.
    return { settings, hostelDelivery: campuses.some((campus) => campus.hostelDeliveryEnabled) };
  } catch {
    return {
      settings: {
        ordersOpen: true,
        closedMessage: "Orders are closed for today.",
        contactNumber: "Admin"
      },
      hostelDelivery: false
    };
  }
}

export default async function CustomerHomePage() {
  const { settings, hostelDelivery } = await getHomeData();

  if (!settings.ordersOpen) {
    return <ClosedOrders message={settings.closedMessage} contactNumber={settings.contactNumber} />;
  }

  return <HomeLanding hostelDelivery={hostelDelivery} />;
}
