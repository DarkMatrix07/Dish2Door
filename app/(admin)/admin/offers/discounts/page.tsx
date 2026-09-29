import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

// Item discounts now live on the Items page (tick items, then apply a discount).
export default async function AdminDiscountsPage() {
  await requireRole(["ADMIN"]);
  redirect("/admin/menu/items");
}
