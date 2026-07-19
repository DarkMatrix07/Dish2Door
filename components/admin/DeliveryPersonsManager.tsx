"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HOSTEL_BLOCKS } from "@/lib/hostels";

type DeliveryUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  assignedHostelBlocks: string[];
  createdAt: string | Date;
  _count: { deliveries: number };
};

function HostelSelector({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-neutral-700">Assigned hostels</p>
        <p className="text-xs text-neutral-400">{value.length} selected</p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {HOSTEL_BLOCKS.map((block) => {
          const selected = value.includes(block);
          return (
            <button
              key={block}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? value.filter((item) => item !== block) : [...value, block])}
              className={`min-h-10 rounded-lg border px-2 text-sm font-semibold transition ${selected ? "border-amber-400 bg-amber-100 text-neutral-950" : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400"}`}
            >
              {block}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DeliveryPersonsManager({ initialUsers }: { initialUsers: DeliveryUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", password: "", assignedHostelBlocks: [] as string[] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", email: "", phone: "", assignedHostelBlocks: [] as string[] });
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
    setDraft({ name: "", email: "", phone: "", password: "", assignedHostelBlocks: [] });
  }

  function startEdit(user: DeliveryUser) {
    setEditingId(user.id);
    setEditDraft({ name: user.name, email: user.email, phone: user.phone ?? "", assignedHostelBlocks: user.assignedHostelBlocks });
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
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <SectionCard title="Add delivery person" description="Create a login that opens the delivery dashboard directly.">
        <div className="space-y-3">
          <Input placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <Input placeholder="Email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
          <Input placeholder="Phone number" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          <Input placeholder="Temporary password" type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
          <HostelSelector value={draft.assignedHostelBlocks} onChange={(assignedHostelBlocks) => setDraft({ ...draft, assignedHostelBlocks })} />
          <Button className="w-full" disabled={busy} onClick={createUser}>
            Create delivery login
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Delivery persons" description="Edit details, reset passwords, deactivate staff, or delete unused accounts." bodyClassName="p-0">
        <div className="divide-y divide-neutral-100">
          {users.map((user) => (
            <div key={user.id} className="space-y-4 p-4 sm:p-5">
              {editingId === user.id ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
                    <Input type="email" value={editDraft.email} onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })} />
                    <Input value={editDraft.phone} onChange={(event) => setEditDraft({ ...editDraft, phone: event.target.value })} />
                  </div>
                  <HostelSelector value={editDraft.assignedHostelBlocks} onChange={(assignedHostelBlocks) => setEditDraft({ ...editDraft, assignedHostelBlocks })} />
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{user.name}</p>
                    <Badge tone={user.active ? "green" : "red"}>{user.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {user.email} / {user.phone || "No phone"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">{user._count.deliveries} delivered orders</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{user.assignedHostelBlocks.length ? user.assignedHostelBlocks.map((block) => <span key={block} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-neutral-800">{block}</span>) : <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">No hostels assigned</span>}</div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-1 gap-2">
                  <Input
                    type="password"
                    placeholder="New password"
                    value={passwordDraft[user.id] ?? ""}
                    onChange={(event) => setPasswordDraft({ ...passwordDraft, [user.id]: event.target.value })}
                  />
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => resetPassword(user.id)}>
                    Reset
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingId === user.id ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => saveUser(user.id)}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => startEdit(user)}>
                      Edit
                    </Button>
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
            </div>
          ))}
          {!users.length ? <div className="p-8 text-center text-neutral-500">No delivery persons created yet.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}
