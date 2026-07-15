import { CartPageClient } from "@/components/customer/CartPageClient";
import { ClosedOrders } from "@/components/customer/ClosedOrders";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  let settings = {
    ordersOpen: true,
    closedMessage: "Orders are closed for today.",
    contactNumber: "Contact admin",
    platformFeePaise: 200,
    hostelDeliveryFeePaise: 1500,
    paymentChargePercentBps: 250,
    paymentChargeFixedPaise: 0
  };

  try {
    const dbSettings = await getSettings();
    settings = {
      ordersOpen: dbSettings.ordersOpen,
      closedMessage: dbSettings.closedMessage,
      contactNumber: dbSettings.contactNumber,
      platformFeePaise: dbSettings.platformFeePaise,
      hostelDeliveryFeePaise: dbSettings.hostelDeliveryFeePaise,
      paymentChargePercentBps: dbSettings.paymentChargePercentBps,
      paymentChargeFixedPaise: dbSettings.paymentChargeFixedPaise
    };
  } catch {
    // Keep the cart review usable before Postgres is running locally.
  }

  if (!settings.ordersOpen) {
    return <ClosedOrders message={settings.closedMessage} contactNumber={settings.contactNumber} />;
  }

  return <CartPageClient settings={settings} />;
}
