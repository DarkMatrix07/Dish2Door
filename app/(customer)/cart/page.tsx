import { CartPageClient } from "@/components/customer/CartPageClient";
import { ClosedOrders } from "@/components/customer/ClosedOrders";
import { listActiveCampuses, toPublicCampus, type CampusPublic } from "@/lib/campus";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Used only if the database is unreachable, so the cart still renders locally.
const FALLBACK_CAMPUSES: CampusPublic[] = [
  {
    code: "VIT_AP",
    name: "VIT-AP",
    platformFeePaise: 200,
    hostelDeliveryFeePaise: 1500,
    hostelDeliveryEnabled: true,
    hostelDeliveryNightOnly: true,
    paymentChargePercentBps: 250,
    paymentChargeFixedPaise: 0
  }
];

export default async function CartPage() {
  let store = {
    ordersOpen: true,
    closedMessage: "Orders are closed for today.",
    contactNumber: "Contact admin"
  };
  let campuses = FALLBACK_CAMPUSES;
  let orderingOpenMinute = 360;
  let orderingCloseMinute = 1380;

  try {
    const [dbSettings, dbCampuses] = await Promise.all([getSettings(), listActiveCampuses()]);
    store = {
      ordersOpen: dbSettings.ordersOpen,
      closedMessage: dbSettings.closedMessage,
      contactNumber: dbSettings.contactNumber
    };
    orderingOpenMinute = dbSettings.orderingOpenMinute;
    orderingCloseMinute = dbSettings.orderingCloseMinute;
    if (dbCampuses.length) campuses = dbCampuses.map(toPublicCampus);
  } catch {
    // Keep the cart review usable before Postgres is running locally.
  }

  if (!store.ordersOpen) {
    return <ClosedOrders message={store.closedMessage} contactNumber={store.contactNumber} />;
  }

  return (
    <CartPageClient
      campuses={campuses}
      serverNowMs={Date.now()}
      windowOpenMinute={orderingOpenMinute}
      windowCloseMinute={orderingCloseMinute}
    />
  );
}
