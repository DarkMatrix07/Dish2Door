"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Plus, Store } from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  courses: { id: string; name: string }[];
  menuItems: { id: string }[];
};

const PLACEHOLDER = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80";

export function RestaurantsManager({ initialRestaurants }: { initialRestaurants: Restaurant[] }) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [courseName, setCourseName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  const selected = restaurants.find((restaurant) => restaurant.id === managingId);
  const stats = useMemo(
    () => ({
      total: restaurants.length,
      live: restaurants.filter((restaurant) => restaurant.active).length,
      courses: restaurants.reduce((total, restaurant) => total + restaurant.courses.length, 0)
    }),
    [restaurants]
  );

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

  function openCreate() {
    setName("");
    setDescription("");
    onNewImage(undefined);
    setShowCreate(true);
  }

  async function createRestaurant() {
    if (!name.trim()) {
      toast.error("Enter a restaurant name");
      return;
    }
    setCreating(true);
    try {
      const imageUrl = imageFile ? await uploadImage(imageFile) : undefined;
      await action({
        action: "restaurant.create",
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description,
        imageUrl
      });
      setShowCreate(false);
      setName("");
      setDescription("");
      onNewImage(undefined);
      toast.success("Restaurant added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add restaurant");
    } finally {
      setCreating(false);
    }
  }

  async function updateProfile(patch: { name?: string; description?: string | null; imageUrl?: string | null }) {
    if (!selected) return;
    try {
      await action({ action: "restaurant.update", id: selected.id, ...patch });
      toast.success("Restaurant profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update restaurant");
    }
  }

  async function replaceImage(file: File | undefined) {
    if (!selected || !file) return;
    setUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      await updateProfile({ imageUrl });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update image");
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive() {
    if (!selected) return;
    await action({ action: "restaurant.active", id: selected.id, active: !selected.active });
    toast.success(selected.active ? "Restaurant hidden" : "Restaurant is visible");
  }

  async function deleteRestaurant() {
    if (!selected || !window.confirm(`Delete ${selected.name}? This only works when it has no historical orders.`)) return;
    try {
      await action({ action: "restaurant.delete", id: selected.id });
      setManagingId(null);
      toast.success("Restaurant deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete restaurant");
    }
  }

  async function createCourse() {
    if (!selected || !courseName.trim()) return;
    await action({ action: "course.create", restaurantId: selected.id, name: courseName, sortOrder: selected.courses.length });
    setCourseName("");
    toast.success("Course added");
  }

  async function renameCourse(id: string, currentName: string) {
    const next = window.prompt("Course/category name", currentName)?.trim();
    if (!next) return;
    await action({ action: "course.update", id, name: next });
    toast.success("Course updated");
  }

  async function moveCourse(index: number, direction: -1 | 1) {
    if (!selected) return;
    const target = index + direction;
    if (target < 0 || target >= selected.courses.length) return;
    const ids = selected.courses.map((course) => course.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await action({ action: "course.reorder", restaurantId: selected.id, orderedIds: ids });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder courses");
    }
  }

  async function deleteCourse(id: string) {
    if (!window.confirm("Delete this course? Move or delete its menu items first.")) return;
    try {
      await action({ action: "course.delete", id });
      toast.success("Course deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete course");
    }
  }

  // ---- Detail view: manage one restaurant ----
  if (selected) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setManagingId(null)}>
            <ChevronLeft size={16} className="-ml-1 mr-1" />
            All restaurants
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={toggleActive}>
              {selected.active ? "Hide" : "Show"}
            </Button>
            <Button variant="destructive" onClick={deleteRestaurant}>
              Delete
            </Button>
          </div>
        </div>

        <SectionCard title="Restaurant profile" description="This is what customers see on the menu restaurant cards.">
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div
              className="min-h-40 rounded-xl bg-neutral-100 bg-cover bg-center"
              style={{ backgroundImage: `url('${selected.imageUrl ?? PLACEHOLDER}')` }}
            />
            <div className="space-y-3">
              <Input defaultValue={selected.name} key={`name-${selected.id}`} onBlur={(event) => updateProfile({ name: event.target.value })} />
              <Textarea defaultValue={selected.description ?? ""} key={`desc-${selected.id}`} onBlur={(event) => updateProfile({ description: event.target.value })} />
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold transition hover:bg-neutral-100">
                  {uploading ? "Uploading..." : "Replace image"}
                  <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => replaceImage(event.target.files?.[0])} />
                </label>
                {selected.imageUrl ? (
                  <Button variant="outline" onClick={() => updateProfile({ imageUrl: null })}>
                    Clear image
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Courses" description="Menu sections that group items. Order controls how they appear on the customer menu.">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input placeholder="New course/category" value={courseName} onChange={(event) => setCourseName(event.target.value)} />
            <Button variant="outline" onClick={createCourse}>
              Add course
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {selected.courses.map((course, index) => (
              <div key={course.id} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                      disabled={index === 0}
                      aria-label="Move up"
                      onClick={() => moveCourse(index, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
                      disabled={index === selected.courses.length - 1}
                      aria-label="Move down"
                      onClick={() => moveCourse(index, 1)}
                    >
                      ▼
                    </button>
                  </div>
                  <span className="font-semibold">{course.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => renameCourse(course.id, course.name)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteCourse(course.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {!selected.courses.length ? (
              <div className="rounded-xl bg-neutral-50 p-6 text-center text-sm text-neutral-500 sm:col-span-2">No courses yet.</div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    );
  }

  // ---- List view: restaurant names ----
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Restaurants" value={stats.total} helper={`${stats.live} live`} />
        <StatCard label="Courses" value={stats.courses} helper="Across all restaurants" />
        <StatCard label="Hidden" value={stats.total - stats.live} helper="Not shown to customers" />
      </div>

      <SectionCard
        title="Restaurants"
        description="Tap a restaurant to edit its profile and courses."
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} className="-ml-1 mr-1" />
            Add restaurant
          </Button>
        }
        bodyClassName="p-4 sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {restaurants.map((restaurant) => (
            <button
              key={restaurant.id}
              type="button"
              onClick={() => setManagingId(restaurant.id)}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left transition hover:border-amber-300 hover:bg-amber-50"
            >
              <div
                className="h-14 w-14 shrink-0 rounded-xl bg-neutral-100 bg-cover bg-center"
                style={{ backgroundImage: `url('${restaurant.imageUrl ?? PLACEHOLDER}')` }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold text-neutral-950">{restaurant.name}</p>
                  {!restaurant.active ? <Badge tone="red">Hidden</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  {restaurant.menuItems.length} item{restaurant.menuItems.length === 1 ? "" : "s"} · {restaurant.courses.length} course
                  {restaurant.courses.length === 1 ? "" : "s"}
                </p>
              </div>
            </button>
          ))}
          {!restaurants.length ? (
            <div className="col-span-full grid place-items-center gap-3 rounded-xl bg-neutral-50 p-10 text-center text-neutral-500">
              <Store size={28} className="text-neutral-300" />
              <p>No restaurants yet. Add your first one.</p>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add restaurant"
        description="Create a new customer-facing restaurant profile."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button disabled={creating} onClick={createRestaurant}>
              {creating ? "Adding..." : "Add restaurant"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input placeholder="Restaurant name" value={name} onChange={(event) => setName(event.target.value)} />
          <Textarea placeholder="Short description" value={description} onChange={(event) => setDescription(event.target.value)} />
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
            <div className="mb-3 h-28 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url('${imagePreview || PLACEHOLDER}')` }} />
            <Input className="h-auto cursor-pointer bg-white py-2" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onNewImage(event.target.files?.[0])} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
