"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Shop = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  acceptingOrders: boolean;
  whatsappNumber: string | null;
  restrictedToCampusCode: string | null;
};

type CampusOption = { code: string; name: string };

const PLACEHOLDER = "/pizza-placeholder.webp";

// A visible label above a form control, same look as the Dropdown's own label.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-neutral-500">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export function PizzaStoreManager({ initialShop, campuses }: { initialShop: Shop; campuses: CampusOption[] }) {
  const [shop, setShop] = useState(initialShop);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // When the server hands over a fresh copy of the shop (after a page refresh), take it.
  // Done while rendering rather than in an effect, which React recommends for this.
  const [seenInitial, setSeenInitial] = useState(initialShop);
  if (initialShop !== seenInitial) {
    setSeenInitial(initialShop);
    setShop(initialShop);
  }

  async function patch(body: Partial<Omit<Shop, "id" | "slug">>) {
    const response = await fetch("/api/admin/shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: shop.slug, ...body })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not update shop");
    setShop((current) => ({ ...current, ...data.restaurant }));
  }

  async function toggleAccepting() {
    setSaving(true);
    try {
      await patch({ acceptingOrders: !shop.acceptingOrders });
      toast.success(shop.acceptingOrders ? "Shop closed for orders" : "Shop is now open for orders");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update shop");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/admin/uploads/menu-image", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Image upload failed");
    return data.imageUrl as string;
  }

  async function replaceImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      await patch({ imageUrl });
      toast.success("Image updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update image");
    } finally {
      setUploading(false);
    }
  }

  async function saveField(body: Partial<Omit<Shop, "id" | "slug">>, message: string) {
    try {
      await patch(body);
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save changes");
    }
  }

  const campusOptions = [{ value: "", label: "All campuses" }, ...campuses.map((campus) => ({ value: campus.code, label: campus.name }))];

  return (
    <div className="space-y-4 sm:space-y-6">
      <SectionCard
        title="Order status"
        description="Customers only see this shop as orderable while it's open."
        actions={
          <Button variant={shop.acceptingOrders ? "outline" : "default"} className="w-full whitespace-nowrap sm:w-auto" disabled={saving} onClick={toggleAccepting}>
            {shop.acceptingOrders ? "Close shop" : "Open shop"}
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <Badge tone={shop.acceptingOrders ? "green" : "red"}>{shop.acceptingOrders ? "Open — accepting orders" : "Closed — not accepting orders"}</Badge>
        </div>
      </SectionCard>

      <SectionCard title="Shop profile" description="This is what customers see on the shop card and menu page.">
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="h-40 rounded-xl bg-neutral-100 bg-cover bg-center sm:h-auto sm:min-h-40" style={{ backgroundImage: `url('${shop.imageUrl ?? PLACEHOLDER}')` }} />
          <div className="min-w-0 space-y-3">
            <Field label="Shop name">
              <Input
                defaultValue={shop.name}
                key={`name-${shop.id}`}
                onBlur={(event) => {
                  if (event.target.value.trim() && event.target.value !== shop.name) saveField({ name: event.target.value.trim() }, "Name updated");
                }}
              />
            </Field>
            <Field label="Description">
              <Textarea
                defaultValue={shop.description ?? ""}
                key={`desc-${shop.id}`}
                placeholder="Short description shown to customers"
                onBlur={(event) => {
                  if (event.target.value !== (shop.description ?? "")) saveField({ description: event.target.value.trim() || null }, "Description updated");
                }}
              />
            </Field>
            <div>
              <p className="text-xs font-semibold text-neutral-500">Shop photo</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="inline-flex h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold transition hover:bg-neutral-100 focus-within:ring-4 focus-within:ring-amber-200">
                  {uploading ? "Uploading..." : "Replace photo"}
                  <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => replaceImage(event.target.files?.[0])} />
                </label>
                {shop.imageUrl ? (
                  <button
                    type="button"
                    onClick={() => saveField({ imageUrl: null }, "Image removed")}
                    className="inline-flex h-10 items-center whitespace-nowrap px-1 text-sm font-semibold text-red-600 hover:text-red-700"
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="WhatsApp & campus" description="Orders for this shop are routed to WhatsApp instead of online payment.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Field label="WhatsApp number">
              <Input
                defaultValue={shop.whatsappNumber ?? ""}
                key={`wa-${shop.id}`}
                inputMode="tel"
                placeholder="e.g. 91XXXXXXXXXX"
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (shop.whatsappNumber ?? "")) saveField({ whatsappNumber: value || null }, "WhatsApp number updated");
                }}
              />
            </Field>
            <p className="mt-1 text-xs text-neutral-500">Falls back to the support number if left blank.</p>
          </div>
          <div className="min-w-0">
            <Dropdown
              label="Campus restriction"
              value={shop.restrictedToCampusCode ?? ""}
              onChange={(code) => saveField({ restrictedToCampusCode: code || null }, "Campus restriction updated")}
              options={campusOptions}
            />
            <p className="mt-1 text-xs text-neutral-500">Only customers on this campus will see the shop.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
