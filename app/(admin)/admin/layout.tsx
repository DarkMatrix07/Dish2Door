import { AdminShell } from "@/components/admin/AdminShell";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["ADMIN"]);

  return <AdminShell userName={user.name}>{children}</AdminShell>;
}
