"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [email, setEmail] = useState("admin@campus.local");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Login failed");
      window.location.href = data.user.role === "ADMIN" ? "/admin" : "/delivery";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-6">
      <p className="font-semibold text-amber-700">Staff access</p>
      <h1 className="mt-2 text-3xl font-black">Login</h1>
      <p className="mt-2 text-sm text-neutral-500">Enter your staff credentials. We will send you to the correct dashboard.</p>
      <div className="mt-6 space-y-3">
        <Input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <Button className="w-full" disabled={busy} onClick={login}>
          {busy ? "Logging in..." : "Login"}
        </Button>
      </div>
    </Card>
  );
}
