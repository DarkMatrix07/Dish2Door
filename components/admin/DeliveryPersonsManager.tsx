"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DeliveryUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: string | Date;
  _count: { deliveries: number };
};

export function DeliveryPersonsManager({ initialUsers }: { initialUsers: DeliveryUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", password: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", email: "", phone: "" });
  const [passwordDraft, setPasswordDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/delivery-users");
    const data = await response.json();
    setUsers(data.users ?? []);
  }

  async function action(body: unknown, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/delivery-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Action failed");
      await refresh();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function createUser() {
    await action({ action: "create", ...draft }, "Delivery person added");
    setDraft({ name: "", email: "", phone: "", password: "" });
  }

  function startEdit(user: DeliveryUser) {
    setEditingId(user.id);
    setEditDraft({ name: user.name, email: user.email, phone: user.phone ?? "" });
  }

  async function saveUser(id: string) {
    await action({ action: "update", id, ...editDraft, phone: editDraft.phone || null }, "Delivery person updated");
    setEditingId(null);
  }

  async function resetPassword(id: string) {
    const password = passwordDraft[id];
    if (!password) {
      toast.error("Enter a new password first");
      return;
    }
    await action({ action: "resetPassword", id, password }, "Password reset");
    setPasswordDraft({ ...passwordDraft, [id]: "" });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card className="h-fit border-0 bg-white p-5 shadow-sm">
        <h3 className="font-black">Add delivery person</h3>
        <p className="mt-1 text-sm text-neutral-500">Create a login that opens the delivery dashboard directly.</p>
        <div className="mt-5 space-y-3">
          <Input placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <Input placeholder="Email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
          <Input placeholder="Phone number" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          <Input placeholder="Temporary password" type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
          <Button className="w-full" disabled={busy} onClick={createUser}>Create delivery login</Button>
        </div>
      </Card>

      <Card className="overflow-hidden border-0 bg-white shadow-sm">
        <div className="border-b border-neutral-100 p-5">
          <h3 className="text-xl font-black">Delivery persons</h3>
          <p className="mt-1 text-sm text-neutral-500">Edit details, reset passwords, deactivate staff, or delete unused accounts.</p>
        </div>
        <div className="divide-y divide-neutral-100">
          {users.map((user) => (
            <div key={user.id} className="grid gap-4 p-5 xl:grid-cols-[1fr_220px_240px] xl:items-center">
              <div>
                {editingId === user.id ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
                    <Input type="email" value={editDraft.email} onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })} />
                    <Input value={editDraft.phone} onChange={(event) => setEditDraft({ ...editDraft, phone: event.target.value })} />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{user.name}</p>
                      <Badge tone={user.active ? "green" : "red"}>{user.active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">{user.email} · {user.phone || "No phone"}</p>
                    <p className="mt-1 text-xs text-neutral-400">{user._count.deliveries} delivered orders</p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="New password"
                  value={passwordDraft[user.id] ?? ""}
                  onChange={(event) => setPasswordDraft({ ...passwordDraft, [user.id]: event.target.value })}
                />
                <Button className="w-full" variant="outline" size="sm" disabled={busy} onClick={() => resetPassword(user.id)}>Reset password</Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {editingId === user.id ? (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => saveUser(user.id)}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => startEdit(user)}>Edit</Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => action({ action: "update", id: user.id, active: !user.active }, user.active ? "Delivery person deactivated" : "Delivery person activated")}
                >
                  {user.active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete ${user.name}? Only unused delivery accounts can be deleted.`)) {
                      action({ action: "delete", id: user.id }, "Delivery person deleted");
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {!users.length ? <div className="p-8 text-center text-neutral-500">No delivery persons created yet.</div> : null}
        </div>
      </Card>
    </div>
  );
}
