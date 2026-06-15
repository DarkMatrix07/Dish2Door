import { CartPageClient } from "@/components/customer/CartPageClient";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  let settings = {
    platformFeePaise: 200,
    hostelDeliveryFeePaise: 1500,
    paymentChargePercentBps: 250,
    paymentChargeFixedPaise: 0
  };

  try {
    const dbSettings = await getSettings();
    settings = {
      platformFeePaise: dbSettings.platformFeePaise,
      hostelDeliveryFeePaise: dbSettings.hostelDeliveryFeePaise,
      paymentChargePercentBps: dbSettings.paymentChargePercentBps,
      paymentChargeFixedPaise: dbSettings.paymentChargeFixedPaise
    };
  } catch {
    // Keep the cart review usable before Postgres is running locally.
  }

  return <CartPageClient settings={settings} />;
}
