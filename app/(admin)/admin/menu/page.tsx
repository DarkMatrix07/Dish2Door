import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export default async function AdminMenuIndexPage() {
  await requireRole(["ADMIN"]);
  redirect("/admin/menu/restaurants");
}
