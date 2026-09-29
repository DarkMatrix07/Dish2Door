import { redirect } from "next/navigation";

// Campuses now live on the one Settings page. Kept so old bookmarks still land in the right place.
export default function AdminCampusesRedirect() {
  redirect("/admin/settings#campuses");
}
