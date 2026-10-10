import Link from "next/link";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { NotificationsPanel } from "@/components/admin/NotificationsPanel";
import { linkButtonClasses } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  await requireRole(["ADMIN"]);
  const [failedLogs, recentLogs] = await Promise.all([
    prisma.notificationLog.findMany({
      where: {
        status: NotificationStatus.FAILED,
        channel: { in: [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP] }
      },
      include: {
        order: {
          select: {
            trackingCode: true,
            customerName: true,
            customerPhone: true,
            customerEmail: true
          }
        }
      },
      orderBy: { sentAt: "desc" },
      take: 30
    }),
    prisma.notificationLog.findMany({
      include: {
        order: {
          select: {
            trackingCode: true,
            customerName: true,
            customerPhone: true,
            customerEmail: true
          }
        }
      },
      orderBy: { sentAt: "desc" },
      take: 30
    })
  ]);

  return (
    <PageContainer>
      <AdminPageHeader
        eyebrow="Messages"
        title="Notification log"
        description="Every message sent to customers, when a delivery failed, and whether an automatic or manual retry recovered it."
      >
        <Link href="/admin/settings#notifications" className={cn(linkButtonClasses("outline"), "h-auto min-h-11 whitespace-normal py-2 text-center")}>Turn email or WhatsApp on or off</Link>
      </AdminPageHeader>
      <div className="space-y-5">
        <NotificationsPanel failedLogs={failedLogs} recentLogs={recentLogs} />
      </div>
    </PageContainer>
  );
}
