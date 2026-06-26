import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { AdminPageHeader, PageContainer } from "@/components/admin/AdminShell";
import { NotificationsPanel } from "@/components/admin/NotificationsPanel";
import { NotificationToggles } from "@/components/admin/NotificationToggles";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const settings = await getSettings();
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
        eyebrow="Notifications"
        title="Notification logs"
        description="Turn channels on or off, review failed email and WhatsApp sends, retry them manually, and scan the latest notification activity."
      />
      <div className="space-y-5">
        <NotificationToggles initialEmail={settings.notifyEmail} initialWhatsapp={settings.notifyWhatsapp} />
        <NotificationsPanel failedLogs={failedLogs} recentLogs={recentLogs} />
      </div>
    </PageContainer>
  );
}
