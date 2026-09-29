import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { CouponsManager } from "@/components/admin/CouponsManager";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  await requireRole(["ADMIN"]);
  // Spin-wheel prizes are coupons too, one per win, and they outnumber the ones an admin
  // makes. Listing the latest 50 of everything pushed admin coupons off the page, so
  // this page shows only admin coupons; wheel codes live on the Discount wheel page.
  const wheelCodes = await prisma.spinReward.findMany({ select: { couponCode: true } });
  const coupons = await prisma.coupon.findMany({
    where: { code: { notIn: wheelCodes.map((reward) => reward.couponCode) } },
    orderBy: { createdAt: "desc" }
  });

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
