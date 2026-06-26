import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { CouponsManager } from "@/components/admin/CouponsManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Offers"
        title="Coupons"
        description="Generate coupon codes, set validity and usage limits, and monitor redemption."
      />
      <CouponsManager initialCoupons={coupons} />
    </PageContainer>
  );
}
