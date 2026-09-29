import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Today's orders used to live here. They are now the main Orders page, so old bookmarks
// keep working.
export default async function TodaysOrdersRedirectPage() {
  await requireRole(["ADMIN"]);
  redirect("/admin/orders");
}
