"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

export function PizzaStoreManager({ initialShop, campuses }: { initialShop: Shop; campuses: CampusOption[] }) {
  const [shop, setShop] = useState(initialShop);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setShop(initialShop), [initialShop]);

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

  return (
    <div className="space-y-4 sm:space-y-6">
      <SectionCard
        title="Order status"
        description="Customers only see this shop as orderable while it's open."
        actions={
          <Button variant={shop.acceptingOrders ? "outline" : "default"} disabled={saving} onClick={toggleAccepting}>
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
          <div className="min-h-40 rounded-xl bg-neutral-100 bg-cover bg-center" style={{ backgroundImage: `url('${shop.imageUrl ?? PLACEHOLDER}')` }} />
          <div className="space-y-3">
            <Input
              defaultValue={shop.name}
              key={`name-${shop.id}`}
              onBlur={(event) => {
                if (event.target.value.trim() && event.target.value !== shop.name) saveField({ name: event.target.value.trim() }, "Name updated");
              }}
            />
            <Textarea
              defaultValue={shop.description ?? ""}
              key={`desc-${shop.id}`}
              placeholder="Short description shown to customers"
              onBlur={(event) => {
                if (event.target.value !== (shop.description ?? "")) saveField({ description: event.target.value.trim() || null }, "Description updated");
              }}
            />
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold transition hover:bg-neutral-100">
                {uploading ? "Uploading..." : "Replace image"}
                <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => replaceImage(event.target.files?.[0])} />
              </label>
              {shop.imageUrl ? (
                <Button variant="outline" onClick={() => saveField({ imageUrl: null }, "Image removed")}>
                  Clear image
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="WhatsApp & campus" description="Orders for this shop are routed to WhatsApp instead of online payment.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-neutral-700">
            WhatsApp number
            <Input
              className="mt-1.5"
              defaultValue={shop.whatsappNumber ?? ""}
              key={`wa-${shop.id}`}
              placeholder="e.g. 91XXXXXXXXXX"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== (shop.whatsappNumber ?? "")) saveField({ whatsappNumber: value || null }, "WhatsApp number updated");
              }}
            />
            <span className="mt-1 block text-xs text-neutral-500">Falls back to the support number if left blank.</span>
          </label>
          <label className="text-sm font-semibold text-neutral-700">
            Campus restriction
            <Select
              className="mt-1.5"
              value={shop.restrictedToCampusCode ?? ""}
              onChange={(event) => saveField({ restrictedToCampusCode: event.target.value || null }, "Campus restriction updated")}
            >
              <option value="">All campuses</option>
              {campuses.map((campus) => (
                <option key={campus.code} value={campus.code}>
                  {campus.name}
                </option>
              ))}
            </Select>
            <span className="mt-1 block text-xs text-neutral-500">Only customers on this campus will see the shop.</span>
          </label>
        </div>
      </SectionCard>
    </div>
  );
}
