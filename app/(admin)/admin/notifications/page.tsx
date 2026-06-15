import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { NotificationsPanel } from "@/components/admin/NotificationsPanel";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
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
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader
        eyebrow="Notifications"
        title="Notification logs"
        description="Review failed email and WhatsApp sends, retry them manually, and scan the latest notification activity."
      />
      <NotificationsPanel failedLogs={failedLogs} recentLogs={recentLogs} />
    </section>
  );
}
