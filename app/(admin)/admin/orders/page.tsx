import { PageContainer } from "@/components/admin/AdminShell";
import { TodayBoard } from "@/components/admin/TodayBoard";
import { requireRole } from "@/lib/auth";
import { formatIndiaMinutes } from "@/lib/order-slots";
import { getSettings } from "@/lib/settings";
import { loadTodayBoard } from "@/lib/today-orders";

export const dynamic = "force-dynamic";

export default async function TodayOrdersPage() {
  await requireRole(["ADMIN"]);

  // Only the first view is rendered here. After that the board polls /api/admin/orders/today
  // itself, and reads its slot / campus / search filters from the URL in the browser.
  const [initial, settings] = await Promise.all([loadTodayBoard(), getSettings()]);

  return (
    <PageContainer>
      <TodayBoard
        initial={initial}
        ordering={{
          openLabel: formatIndiaMinutes(settings.orderingOpenMinute),
          closeLabel: formatIndiaMinutes(settings.orderingCloseMinute),
          ordersOpen: settings.ordersOpen
        }}
      />
    </PageContainer>
  );
}
