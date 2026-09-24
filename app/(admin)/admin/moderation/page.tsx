import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export default async function AdminModerationIndexPage() {
  await requireRole(["ADMIN"]);
  redirect("/admin/offers/coupons");
}
