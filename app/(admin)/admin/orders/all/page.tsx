import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { AllOrders } from "@/components/admin/AllOrders";
import { linkButtonClasses } from "@/components/ui/button";
import { searchAdminOrders } from "@/lib/admin-orders";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { orderListParams, parseOrderSearch, parsePaging, searchParamsFromRecord } from "@/lib/order-search";

export const dynamic = "force-dynamic";

export default async function AllOrdersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["ADMIN"]);
  const params = searchParamsFromRecord(await searchParams);
  const search = parseOrderSearch(params);
  const { page, pageSize } = parsePaging(params);

  // Only the first view is rendered here. After that the page reads and writes the URL
  // itself and refetches from the orders API, so filtering never reloads the whole page.
  const [initial, campuses, restaurants] = await Promise.all([
    searchAdminOrders(search, { page, pageSize, withSummary: true }),
    // Every campus, including switched-off ones: old orders still belong to them.
    prisma.campus.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.restaurant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
  ]);

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Orders"
        title="All orders"
        description="Search every order by customer, phone, tracking code or item. Filter by date, campus and payment, then open an order for the full story or export the list."
      >
        {/* Two equal columns on phones instead of wrapping pills. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Link href="/admin/orders" className={linkButtonClasses("outline")}>
            Today&apos;s orders
          </Link>
          <Link href="/admin/orders/new" className={linkButtonClasses("default")}>
            <Plus size={16} className="-ml-1" aria-hidden="true" />
            New order
          </Link>
        </div>
      </AdminPageHeader>
      <AllOrders
        initial={initial}
        initialQuery={orderListParams(search, page, pageSize).toString()}
        campuses={campuses}
        restaurants={restaurants}
      />
    </PageContainer>
  );
}
