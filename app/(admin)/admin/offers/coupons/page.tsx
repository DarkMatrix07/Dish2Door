import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { CouponsManager } from "@/components/admin/CouponsManager";
import { requireRole } from "@/lib/auth";
import { parseCouponFilter } from "@/lib/coupon-admin";
import { loadOwnerCoupons } from "@/lib/coupon-data";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole(["ADMIN"]);
  const filter = parseCouponFilter((await searchParams).status);
  // Spin-wheel prizes are coupons too, one per win, and they outnumber the ones the owner
  // makes. Only owner coupons are listed here; wheel codes live on the Discount wheel page.
  const coupons = await loadOwnerCoupons();

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Offers"
        title="Coupons"
        description="Make coupon codes for customers, set how long they last and how many times they can be used, and see how they are doing."
      />
      <CouponsManager initialCoupons={coupons} initialFilter={filter} />
    </PageContainer>
  );
}
