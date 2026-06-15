"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPaise } from "@/lib/utils";

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  courses: { id: string; name: string }[];
  menuItems: {
    id: string;
    name: string;
    pricePaise: number;
    discountPercent: number;
    available: boolean;
    imageUrl: string | null;
    courseId: string;
    course: { name: string };
  }[];
};

type Section = "overview" | "restaurants" | "items";

const tabs: { id: Section; label: string; helper: string }[] = [
  { id: "overview", label: "Overview", helper: "Quick health" },
  { id: "restaurants", label: "Restaurants", helper: "Profiles and courses" },
  { id: "items", label: "Items", helper: "Inventory and stock" }
];

export function MenuManager({ initialRestaurants }: { initialRestaurants: Restaurant[] }) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [section, setSection] = useState<Section>("overview");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(restaurants[0]?.id ?? "");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantDescription, setRestaurantDescription] = useState("");
  const [restaurantImageFile, setRestaurantImageFile] = useState<File | null>(null);
  const [restaurantImagePreview, setRestaurantImagePreview] = useState("");
  const [courseName, setCourseName] = useState("");
  const [item, setItem] = useState({ name: "", price: "", discountPercent: "0", courseId: "" });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState({ name: "", price: "", discountPercent: "0", courseId: "" });
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState("");
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);

  const selected = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId);
  const stats = useMemo(
    () => ({
      restaurants: restaurants.length,
      liveRestaurants: restaurants.filter((restaurant) => restaurant.active).length,
      items: restaurants.reduce((total, restaurant) => total + restaurant.menuItems.length, 0),
      availableItems: restaurants.reduce((total, restaurant) => total + restaurant.menuItems.filter((item) => item.available).length, 0)
    }),
    [restaurants]
  );

  useEffect(() => {
    return () => {
      if (itemImagePreview.startsWith("blob:")) URL.revokeObjectURL(itemImagePreview);
      if (restaurantImagePreview.startsWith("blob:")) URL.revokeObjectURL(restaurantImagePreview);
    };
  }, [itemImagePreview, restaurantImagePreview]);

  async function refresh() {
    const response = await fetch("/api/admin/menu");
    const data = await response.json();
    setRestaurants(data.restaurants);
    if (!selectedRestaurantId && data.restaurants[0]) setSelectedRestaurantId(data.restaurants[0].id);
  }

  async function action(body: unknown) {
    const response = await fetch("/api/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Menu action failed");
    await refresh();
  }

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/admin/uploads/menu-image", {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Image upload failed");
    return data.imageUrl as string;
  }

  async function createRestaurant() {
    try {
      const imageUrl = restaurantImageFile ? await uploadImage(restaurantImageFile) : undefined;
      await action({
        action: "restaurant.create",
        name: restaurantName,
        slug: restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description: restaurantDescription,
        imageUrl
      });
      setRestaurantName("");
      setRestaurantDescription("");
      setRestaurantImageFile(null);
      setRestaurantImagePreview("");
      toast.success("Restaurant added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add restaurant");
    }
  }

  async function createCourse() {
    if (!selected) return;
    try {
      await action({ action: "course.create", restaurantId: selected.id, name: courseName, sortOrder: selected.courses.length });
      setCourseName("");
      toast.success("Course added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add course");
    }
  }

  async function createItem() {
    if (!selected) return;
    const courseId = item.courseId || selected.courses[0]?.id;
    if (!courseId) {
      toast.error("Create a course before adding menu items.");
      return;
    }

    try {
      const imageUrl = itemImageFile ? await uploadImage(itemImageFile) : undefined;
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
      setItemImageFile(null);
      setItemImagePreview("");
      toast.success("Menu item added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add item");
    }
  }

  async function stock(id: string, available: boolean) {
    await action({ action: "item.stock", id, available });
  }

  async function toggleRestaurant(id: string, active: boolean) {
    await action({ action: "restaurant.active", id, active });
    toast.success(active ? "Restaurant is visible" : "Restaurant hidden from customers");
  }

  async function updateRestaurantProfile(patch: { name?: string; description?: string | null; imageUrl?: string | null }) {
    if (!selected) return;
    await action({ action: "restaurant.update", id: selected.id, ...patch });
    toast.success("Restaurant profile updated");
  }

  async function replaceRestaurantImage(file: File | undefined) {
    if (!selected || !file) return;
    setUploadingImageId(selected.id);
    try {
      const imageUrl = await uploadImage(file);
      await updateRestaurantProfile({ imageUrl });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update restaurant image");
    } finally {
      setUploadingImageId(null);
    }
  }

  async function deleteRestaurant() {
    if (!selected || !window.confirm(`Delete ${selected.name}? This only works when it has no historical orders.`)) return;
    await action({ action: "restaurant.delete", id: selected.id });
    setSelectedRestaurantId("");
    toast.success("Restaurant deleted");
  }

  async function renameCourse(id: string, currentName: string) {
    const name = window.prompt("Course/category name", currentName)?.trim();
    if (!name) return;
    await action({ action: "course.update", id, name });
    toast.success("Course updated");
  }

  async function deleteCourse(id: string) {
    if (!window.confirm("Delete this course? Move or delete its menu items first.")) return;
    await action({ action: "course.delete", id });
    toast.success("Course deleted");
  }

  async function deleteItem(id: string) {
    await action({ action: "item.delete", id });
    toast.success("Menu item deleted");
  }

  function startEditItem(menuItem: Restaurant["menuItems"][number]) {
    setEditingItemId(menuItem.id);
    setItemDraft({
      name: menuItem.name,
      price: String(menuItem.pricePaise / 100),
      discountPercent: String(menuItem.discountPercent),
      courseId: menuItem.courseId
    });
  }

  async function saveItem(menuItem: Restaurant["menuItems"][number]) {
    await action({
      action: "item.update",
      id: menuItem.id,
      name: itemDraft.name,
      courseId: itemDraft.courseId,
      pricePaise: Math.round(Number(itemDraft.price) * 100),
      discountPercent: Number(itemDraft.discountPercent || 0)
    });
    setEditingItemId(null);
    toast.success("Menu item updated");
  }

  async function replaceItemImage(menuItem: Restaurant["menuItems"][number], file: File | undefined) {
    if (!file) return;
    setUploadingImageId(menuItem.id);
    try {
      const imageUrl = await uploadImage(file);
      await action({ action: "item.update", id: menuItem.id, imageUrl });
      toast.success(`${menuItem.name} image updated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update image");
    } finally {
      setUploadingImageId(null);
    }
  }

  async function clearItemImage(menuItem: Restaurant["menuItems"][number]) {
    setUploadingImageId(menuItem.id);
    try {
      await action({ action: "item.update", id: menuItem.id, imageUrl: null });
      toast.success(`${menuItem.name} image removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove image");
    } finally {
      setUploadingImageId(null);
    }
  }

  function onNewItemImage(file: File | undefined) {
    if (!file) {
      setItemImageFile(null);
      setItemImagePreview("");
      return;
    }

    setItemImageFile(file);
    setItemImagePreview((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  function onNewRestaurantImage(file: File | undefined) {
    if (!file) {
      setRestaurantImageFile(null);
      setRestaurantImagePreview("");
      return;
    }

    setRestaurantImageFile(file);
    setRestaurantImagePreview((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-white p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`rounded-2xl px-4 py-3 text-left transition ${
                section === tab.id ? "bg-neutral-950 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"
              }`}
              onClick={() => setSection(tab.id)}
            >
              <span className="block font-black">{tab.label}</span>
              <span className={`block text-xs ${section === tab.id ? "text-white/60" : "text-neutral-400"}`}>{tab.helper}</span>
            </button>
          ))}
        </div>
      </Card>

      {section === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Restaurants", stats.restaurants, `${stats.liveRestaurants} live`],
              ["Menu items", stats.items, `${stats.availableItems} available`],
              ["Selected", selected?.name ?? "None", "Current workspace"]
            ].map(([label, value, helper]) => (
              <Card key={label} className="border-0 bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-neutral-500">{label}</p>
                <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-neutral-400">{helper}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {restaurants.map((restaurant) => (
              <button
                key={restaurant.id}
                className={`rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${
                  restaurant.id === selectedRestaurantId ? "border-amber-500 ring-4 ring-amber-100" : "border-transparent"
                }`}
                onClick={() => {
                  setSelectedRestaurantId(restaurant.id);
                  setSection("items");
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Restaurant</p>
                    <h3 className="mt-2 text-xl font-black">{restaurant.name}</h3>
                    <p className="mt-1 text-sm text-neutral-500">/{restaurant.slug}</p>
                  </div>
                  <Badge tone={restaurant.active ? "green" : "red"}>{restaurant.active ? "Live" : "Hidden"}</Badge>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <p className="text-2xl font-black">{restaurant.courses.length}</p>
                    <p className="text-xs text-neutral-500">Courses</p>
                  </div>
                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <p className="text-2xl font-black">{restaurant.menuItems.length}</p>
                    <p className="text-xs text-neutral-500">Items</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {section === "restaurants" ? (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <Card className="border-0 bg-white p-5 shadow-sm">
              <h3 className="font-black">Create restaurant</h3>
              <p className="mt-1 text-sm text-neutral-500">Add a new customer-facing restaurant profile.</p>
              <Input className="mt-4" placeholder="Restaurant name" value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} />
              <Textarea className="mt-3" placeholder="Short restaurant description" value={restaurantDescription} onChange={(event) => setRestaurantDescription(event.target.value)} />
              <div className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
                <div
                  className="mb-3 h-28 rounded-2xl bg-cover bg-center"
                  style={{
                    backgroundImage: `url('${restaurantImagePreview || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80"}')`
                  }}
                />
                <Input
                  className="h-auto cursor-pointer bg-white py-2"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => onNewRestaurantImage(event.target.files?.[0])}
                />
              </div>
              <Button className="mt-3 w-full" onClick={createRestaurant}>Add restaurant</Button>
            </Card>

            <Card className="border-0 bg-white p-5 shadow-sm">
              <h3 className="font-black">Restaurant controls</h3>
              <p className="mt-1 text-sm text-neutral-500">Select, show/hide, rename, or delete a restaurant.</p>
              <Select className="mt-4" value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
                <option value="">Select restaurant</option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}{restaurant.active ? "" : " (hidden)"}
                  </option>
                ))}
              </Select>
              {selected ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => toggleRestaurant(selected.id, !selected.active)}>
                    {selected.active ? "Hide" : "Show"}
                  </Button>
                  <Button variant="destructive" onClick={deleteRestaurant}>Delete</Button>
                </div>
              ) : null}
            </Card>
          </div>

          <div className="space-y-6">
            {selected ? (
              <Card className="overflow-hidden border-0 bg-white shadow-sm">
                <div className="border-b border-neutral-100 p-5">
                  <h3 className="text-xl font-black">Restaurant profile</h3>
                  <p className="mt-1 text-sm text-neutral-500">This is what customers see on the menu restaurant cards.</p>
                </div>
                <div className="grid gap-5 p-5 xl:grid-cols-[280px_1fr]">
                  <div
                    className="min-h-48 rounded-3xl bg-neutral-100 bg-cover bg-center shadow-inner"
                    style={{
                      backgroundImage: `url('${selected.imageUrl ?? "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80"}')`
                    }}
                  />
                  <div className="space-y-3">
                    <Input defaultValue={selected.name} onBlur={(event) => updateRestaurantProfile({ name: event.target.value })} />
                    <Textarea defaultValue={selected.description ?? ""} onBlur={(event) => updateRestaurantProfile({ description: event.target.value })} />
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold transition hover:bg-neutral-100">
                        {uploadingImageId === selected.id ? "Uploading..." : "Replace image"}
                        <input
                          className="hidden"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={uploadingImageId === selected.id}
                          onChange={(event) => replaceRestaurantImage(event.target.files?.[0])}
                        />
                      </label>
                      {selected.imageUrl ? (
                        <Button variant="outline" onClick={() => updateRestaurantProfile({ imageUrl: null })}>Clear image</Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>
            ) : null}

            <Card className="overflow-hidden border-0 bg-white shadow-sm">
            <div className="border-b border-neutral-100 p-5">
              <h3 className="text-xl font-black">Courses for {selected?.name ?? "selected restaurant"}</h3>
              <p className="mt-1 text-sm text-neutral-500">Create and manage menu sections separately from item inventory.</p>
            </div>
            <div className="p-5">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input placeholder="New course/category" value={courseName} onChange={(event) => setCourseName(event.target.value)} />
                <Button variant="outline" disabled={!selected} onClick={createCourse}>Add course</Button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {selected?.courses.map((course) => (
                  <div key={course.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-4">
                    <span className="font-black">{course.name}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => renameCourse(course.id, course.name)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteCourse(course.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
                {!selected?.courses.length ? (
                  <div className="rounded-2xl bg-neutral-50 p-8 text-center text-neutral-500 md:col-span-2">No courses yet.</div>
                ) : null}
              </div>
            </div>
            </Card>
          </div>
        </div>
      ) : null}

      {section === "items" ? (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <Card className="border-0 bg-white p-5 shadow-sm">
              <h3 className="font-black">Select restaurant</h3>
              <p className="mt-1 text-sm text-neutral-500">Choose which inventory you are editing.</p>
              <Select className="mt-4" value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
                <option value="">Select restaurant</option>
                {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
              </Select>
            </Card>

            <Card className="border-0 bg-white p-5 shadow-sm">
              <h3 className="font-black">Add menu item</h3>
              <p className="mt-1 text-sm text-neutral-500">Price is entered in INR. Discount is optional.</p>
              <Input className="mt-4" placeholder="Item name" value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} />
              <Input className="mt-3" type="number" placeholder="Price in INR" value={item.price} onChange={(event) => setItem({ ...item, price: event.target.value })} />
              <Input className="mt-3" type="number" min={0} max={90} placeholder="Item discount %" value={item.discountPercent} onChange={(event) => setItem({ ...item, discountPercent: event.target.value })} />
              <Select className="mt-3" value={item.courseId} onChange={(event) => setItem({ ...item, courseId: event.target.value })}>
                <option value="">Select course</option>
                {selected?.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </Select>
              <div className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
                <div className="grid gap-3 sm:grid-cols-[96px_1fr] sm:items-center">
                  <div
                    className="h-24 rounded-2xl bg-cover bg-center shadow-inner"
                    style={{
                      backgroundImage: `url('${itemImagePreview || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80"}')`
                    }}
                  />
                  <div>
                    <p className="text-sm font-black text-neutral-800">Item photo</p>
                    <p className="mt-1 text-xs text-neutral-500">Upload JPG, PNG, or WebP up to 5 MB.</p>
                    <Input
                      className="mt-3 h-auto cursor-pointer bg-white py-2"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => onNewItemImage(event.target.files?.[0])}
                    />
                  </div>
                </div>
              </div>
              <Button className="mt-3 w-full" disabled={!selected || !selected.courses.length} onClick={createItem}>Add item</Button>
              {!selected?.courses.length ? (
                <p className="mt-3 text-sm text-neutral-500">Create at least one course/category before adding items.</p>
              ) : null}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border border-amber-200 bg-[#fffaf1] p-6 text-neutral-950 shadow-xl shadow-amber-900/5">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Inventory</p>
                  <h3 className="mt-2 text-3xl font-black">{selected?.name ?? "No restaurant selected"}</h3>
                  <p className="mt-2 text-sm text-neutral-600">Everything customers can see, buy, or miss because it is out of stock.</p>
                </div>
                {selected ? (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-2xl font-black">{selected.menuItems.length}</p><p className="text-xs text-neutral-500">Items</p></div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-2xl font-black">{selected.menuItems.filter((item) => item.available).length}</p><p className="text-xs text-neutral-500">Live</p></div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-2xl font-black">{selected.menuItems.filter((item) => !item.available).length}</p><p className="text-xs text-neutral-500">Out</p></div>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="overflow-hidden border-0 bg-white shadow-sm">
              <div className="border-b border-neutral-100 p-5">
                <h3 className="text-xl font-black">Menu inventory</h3>
                <p className="mt-1 text-sm text-neutral-500">Course, price, discount, stock status, and item actions.</p>
              </div>
              <div className="divide-y divide-neutral-100">
                {selected?.menuItems.map((menuItem) => (
                  <div key={menuItem.id} className="grid gap-4 p-5 xl:grid-cols-[96px_1fr_150px_320px] xl:items-center">
                    <div
                      className="h-24 rounded-2xl bg-neutral-100 bg-cover bg-center shadow-inner"
                      style={{
                        backgroundImage: `url('${menuItem.imageUrl ?? "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80"}')`
                      }}
                    />
                    <div>
                      {editingItemId === menuItem.id ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input value={itemDraft.name} onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })} />
                          <Select value={itemDraft.courseId} onChange={(event) => setItemDraft({ ...itemDraft, courseId: event.target.value })}>
                            {selected.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                          </Select>
                          <Input type="number" min={1} value={itemDraft.price} onChange={(event) => setItemDraft({ ...itemDraft, price: event.target.value })} />
                          <Input type="number" min={0} max={90} value={itemDraft.discountPercent} onChange={(event) => setItemDraft({ ...itemDraft, discountPercent: event.target.value })} />
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black">{menuItem.name}</p>
                            <Badge tone={menuItem.available ? "green" : "red"}>{menuItem.available ? "Available" : "Out of stock"}</Badge>
                            {menuItem.discountPercent ? <Badge tone="amber">{menuItem.discountPercent}% off</Badge> : null}
                          </div>
                          <p className="mt-1 text-sm text-neutral-500">Course: {menuItem.course.name}</p>
                          <p className="mt-1 max-w-xl truncate text-xs text-neutral-400">
                            {menuItem.imageUrl ? menuItem.imageUrl : "Using default placeholder image"}
                          </p>
                        </>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">Price</p>
                      <p className="mt-1 text-xl font-black">{formatPaise(menuItem.pricePaise)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold transition hover:bg-neutral-100">
                        {uploadingImageId === menuItem.id ? "Uploading..." : "Image"}
                        <input
                          className="hidden"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={uploadingImageId === menuItem.id}
                          onChange={(event) => replaceItemImage(menuItem, event.target.files?.[0])}
                        />
                      </label>
                      {menuItem.imageUrl ? (
                        <Button variant="outline" size="sm" disabled={uploadingImageId === menuItem.id} onClick={() => clearItemImage(menuItem)}>
                          Clear
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => stock(menuItem.id, !menuItem.available)}>
                        {menuItem.available ? "Mark out" : "Restock"}
                      </Button>
                      {editingItemId === menuItem.id ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => saveItem(menuItem)}>Save</Button>
                          <Button variant="outline" size="sm" onClick={() => setEditingItemId(null)}>Cancel</Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => startEditItem(menuItem)}>Edit</Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => deleteItem(menuItem.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
                {!selected?.menuItems.length ? (
                  <div className="p-8 text-center text-neutral-500">No menu items yet. Add a course, then create your first item.</div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

    </div>
  );
}
