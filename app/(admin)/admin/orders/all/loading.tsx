import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { OrderListSkeleton } from "@/components/admin/AllOrders";

// Shown while the server renders the first page of results.
export default function Loading() {
  return (
    <PageContainer>
      <AdminPageHeader eyebrow="Orders" title="All orders" description="Loading orders..." />
      <OrderListSkeleton />
    </PageContainer>
  );
}
