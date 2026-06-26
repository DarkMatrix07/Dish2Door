"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPaise } from "@/lib/utils";

type MenuItem = {
  id: string;
  name: string;
  pricePaise: number;
  discountPercent: number;
  available: boolean;
  imageUrl: string | null;
  courseId: string;
  course: { name: string };
};

type Restaurant = {
  id: string;
  name: string;
  courses: { id: string; name: string }[];
  menuItems: MenuItem[];
};

const PLACEHOLDER = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80";

export function ItemsManager({ initialRestaurants }: { initialRestaurants: Restaurant[] }) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [selectedId, setSelectedId] = useState(restaurants[0]?.id ?? "");
  const [item, setItem] = useState({ name: "", price: "", discountPercent: "0", courseId: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", price: "", discountPercent: "0", courseId: "" });
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const selected = restaurants.find((restaurant) => restaurant.id === selectedId);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  async function refresh() {
    const response = await fetch("/api/admin/menu");
    const data = await response.json();
    setRestaurants(data.restaurants);
  }

  async function action(body: unknown) {
    const response = await fetch("/api/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Action failed");
    await refresh();
  }

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/admin/uploads/menu-image", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Image upload failed");
    return data.imageUrl as string;
  }

  function onNewImage(file: File | undefined) {
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }
    setImageFile(file);
    setImagePreview((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function createItem() {
    if (!selected) return;
    const courseId = item.courseId || selected.courses[0]?.id;
    if (!courseId) {
      toast.error("Create a course before adding menu items.");
      return;
    }
    if (!item.name.trim() || !item.price) {
      toast.error("Enter an item name and price.");
      return;
    }
    try {
      const imageUrl = imageFile ? await uploadImage(imageFile) : undefined;
      await action({
        action: "item.create",
        restaurantId: selected.id,
        courseId,
        name: item.name,
        pricePaise: Math.round(Number(item.price) * 100),
        discountPercent: Number(item.discountPercent || 0),
        imageUrl
      });
      setItem({ name: "", price: "", discountPercent: "0", courseId: "" });
      onNewImage(undefined);
      toast.success("Menu item added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add item");
    }
  }

  async function stock(id: string, available: boolean) {
    await action({ action: "item.stock", id, available });
  }

  function startEdit(menuItem: MenuItem) {
    setEditingId(menuItem.id);
    setDraft({
      name: menuItem.name,
      price: String(menuItem.pricePaise / 100),
      discountPercent: String(menuItem.discountPercent),
      courseId: menuItem.courseId
    });
  }

  async function saveItem(menuItem: MenuItem) {
    await action({
      action: "item.update",
      id: menuItem.id,
      name: draft.name,
      courseId: draft.courseId,
      pricePaise: Math.round(Number(draft.price) * 100),
      discountPercent: Number(draft.discountPercent || 0)
    });
    setEditingId(null);
    toast.success("Menu item updated");
  }

  async function replaceItemImage(menuItem: MenuItem, file: File | undefined) {
    if (!file) return;
    setUploadingId(menuItem.id);
    try {
      const imageUrl = await uploadImage(file);
      await action({ action: "item.update", id: menuItem.id, imageUrl });
      toast.success(`${menuItem.name} image updated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update image");
    } finally {
      setUploadingId(null);
    }
  }

  async function clearItemImage(menuItem: MenuItem) {
    setUploadingId(menuItem.id);
    try {
      await action({ action: "item.update", id: menuItem.id, imageUrl: null });
      toast.success(`${menuItem.name} image removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove image");
    } finally {
      setUploadingId(null);
    }
  }

  async function deleteItem(id: string) {
    await action({ action: "item.delete", id });
    toast.success("Menu item deleted");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <SectionCard title="Select restaurant" description="Choose which inventory you are editing.">
          <Select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">Select restaurant</option>
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </Select>
          {selected ? (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-neutral-50 p-3">
                <p className="text-xl font-bold">{selected.menuItems.length}</p>
                <p className="text-xs text-neutral-500">Items</p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-3">
                <p className="text-xl font-bold">{selected.menuItems.filter((i) => i.available).length}</p>
                <p className="text-xs text-neutral-500">Live</p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-3">
                <p className="text-xl font-bold">{selected.menuItems.filter((i) => !i.available).length}</p>
                <p className="text-xs text-neutral-500">Out</p>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Add menu item" description="Price in INR. Discount is optional.">
          <div className="space-y-3">
            <Input placeholder="Item name" value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" placeholder="Price (INR)" value={item.price} onChange={(event) => setItem({ ...item, price: event.target.value })} />
              <Input type="number" min={0} max={90} placeholder="Discount %" value={item.discountPercent} onChange={(event) => setItem({ ...item, discountPercent: event.target.value })} />
            </div>
            <Select value={item.courseId} onChange={(event) => setItem({ ...item, courseId: event.target.value })}>
              <option value="">Select course</option>
              {selected?.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
              <div className="grid grid-cols-[80px_1fr] items-center gap-3">
                <div className="h-20 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url('${imagePreview || PLACEHOLDER}')` }} />
                <Input className="h-auto cursor-pointer bg-white py-2" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onNewImage(event.target.files?.[0])} />
              </div>
            </div>
            <Button className="w-full" disabled={!selected || !selected.courses.length} onClick={createItem}>
              Add item
            </Button>
            {!selected?.courses.length ? <p className="text-sm text-neutral-500">Create at least one course before adding items.</p> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title={`Inventory${selected ? ` · ${selected.name}` : ""}`} description="Course, price, discount, stock status, and item actions." bodyClassName="p-0">
        <div className="divide-y divide-neutral-100">
          {selected?.menuItems.map((menuItem) => (
            <div key={menuItem.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:p-5">
              <div className="h-20 w-20 shrink-0 rounded-xl bg-neutral-100 bg-cover bg-center" style={{ backgroundImage: `url('${menuItem.imageUrl ?? PLACEHOLDER}')` }} />
              <div className="min-w-0 flex-1">
                {editingId === menuItem.id ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                    <Select value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}>
                      {selected.courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </Select>
                    <Input type="number" min={1} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
                    <Input type="number" min={0} max={90} value={draft.discountPercent} onChange={(event) => setDraft({ ...draft, discountPercent: event.target.value })} />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{menuItem.name}</p>
                      <Badge tone={menuItem.available ? "green" : "red"}>{menuItem.available ? "Available" : "Out of stock"}</Badge>
                      {menuItem.discountPercent ? <Badge tone="amber">{menuItem.discountPercent}% off</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {menuItem.course.name} · <span className="font-semibold text-neutral-900">{formatPaise(menuItem.pricePaise)}</span>
                    </p>
                  </>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold transition hover:bg-neutral-100">
                    {uploadingId === menuItem.id ? "Uploading..." : "Image"}
                    <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingId === menuItem.id} onChange={(event) => replaceItemImage(menuItem, event.target.files?.[0])} />
                  </label>
                  {menuItem.imageUrl ? (
                    <Button variant="outline" size="sm" disabled={uploadingId === menuItem.id} onClick={() => clearItemImage(menuItem)}>
                      Clear
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => stock(menuItem.id, !menuItem.available)}>
                    {menuItem.available ? "Mark out" : "Restock"}
                  </Button>
                  {editingId === menuItem.id ? (
                    <>
                      <Button size="sm" onClick={() => saveItem(menuItem)}>
                        Save
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => startEdit(menuItem)}>
                      Edit
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => deleteItem(menuItem.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {!selected ? <div className="p-8 text-center text-neutral-500">Select a restaurant to manage its items.</div> : null}
          {selected && !selected.menuItems.length ? (
            <div className="p-8 text-center text-neutral-500">No menu items yet. Add a course, then create your first item.</div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
