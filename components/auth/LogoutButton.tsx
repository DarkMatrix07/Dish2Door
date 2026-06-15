"use client";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/session/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <Button variant="outline" size="sm" onClick={logout}>
      Logout
    </Button>
  );
}
