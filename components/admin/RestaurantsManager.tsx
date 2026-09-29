"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronUp, Plus, Store } from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/AdminShell";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { removeById, reorderByIds, restaurantDeleteBlock, upsertById } from "@/lib/menu-admin";

type Course = { id: string; name: string };

export type AdminRestaurant = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  courses: Course[];
  itemCount: number;
  comboCount: number;
  orderCount: number;
};

const PLACEHOLDER = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// scope=main makes the server refuse anything aimed at Domino's (its own admin owns it).
async function post(body: unknown) {
  const response = await fetch("/api/admin/menu?scope=main", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Action failed");
  return data;
}

async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/admin/uploads/menu-image", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Image upload failed");
  return data.imageUrl as string;
}

export function RestaurantsManager({ initialRestaurants }: { initialRestaurants: AdminRestaurant[] }) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [courseName, setCourseName] = useState("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const sorted = useMemo(() => [...restaurants].sort((a, b) => a.name.localeCompare(b.name)), [restaurants]);
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

  function patchRestaurant(id: string, patch: Partial<AdminRestaurant>) {
    setRestaurants((current) => current.map((restaurant) => (restaurant.id === id ? { ...restaurant, ...patch } : restaurant)));
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
    if (name.trim().length < 2) {
      toast.error("Enter a restaurant name");
      return;
    }
    setCreating(true);
    try {
      const imageUrl = imageFile ? await uploadImage(imageFile) : undefined;
      const { restaurant } = await post({
        action: "restaurant.create",
        name: name.trim(),
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description,
        imageUrl
      });
      setRestaurants((current) => [...current, { ...restaurant, courses: [], itemCount: 0, comboCount: 0, orderCount: 0 }]);
      setShowCreate(false);
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
      const { restaurant } = await post({ action: "restaurant.update", id: selected.id, ...patch });
      patchRestaurant(selected.id, { name: restaurant.name, description: restaurant.description, imageUrl: restaurant.imageUrl });
      toast.success("Restaurant profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update restaurant");
    }
  }

  // Saving on blur fires whether or not anything changed, so skip the no-ops.
  function saveName(value: string) {
    if (!selected || value.trim() === selected.name) return;
    if (value.trim().length < 2) {
      toast.error("The name needs at least 2 characters.");
      return;
    }
    void updateProfile({ name: value.trim() });
  }

  function saveDescription(value: string) {
    if (!selected || value.trim() === (selected.description ?? "")) return;
    void updateProfile({ description: value.trim() });
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
    if (selected.active) {
      const ok = await confirm({
        title: `Switch off ${selected.name}?`,
        description: "Customers will no longer see it or be able to order from it. Its menu and past orders stay, and you can switch it back on any time.",
        confirmLabel: "Switch off",
        cancelLabel: "Keep it on"
      });
      if (!ok) return;
    }
    try {
      const { restaurant } = await post({ action: "restaurant.active", id: selected.id, active: !selected.active });
      patchRestaurant(selected.id, { active: restaurant.active });
      toast.success(restaurant.active ? `${selected.name} is switched on` : `${selected.name} is switched off`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update restaurant");
    }
  }

  async function deleteRestaurant() {
    if (!selected) return;
    // The server refuses too; this just saves a pointless click.
    const block = restaurantDeleteBlock(selected.orderCount);
    if (block) {
      toast.error(block);
      return;
    }
    const ok = await confirm({
      title: `Delete ${selected.name}?`,
      description: `This permanently removes the restaurant with its ${plural(selected.courses.length, "course")}, ${plural(selected.itemCount, "menu item")} and ${plural(selected.comboCount, "combo")}. It has no orders, so no history is lost.`,
      confirmLabel: "Delete restaurant",
      cancelLabel: "Keep it",
      destructive: true
    });
    if (!ok) return;
    try {
      await post({ action: "restaurant.delete", id: selected.id });
      setRestaurants((current) => removeById(current, selected.id));
      setManagingId(null);
      toast.success("Restaurant deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete restaurant");
    }
  }

  function setCourses(id: string, update: (courses: Course[]) => Course[]) {
    setRestaurants((current) => current.map((restaurant) => (restaurant.id === id ? { ...restaurant, courses: update(restaurant.courses) } : restaurant)));
  }

  async function createCourse() {
    if (!selected) return;
    const value = courseName.trim();
    if (value.length < 2) {
      toast.error("Enter a course name (at least 2 characters).");
      return;
    }
    try {
      const { course } = await post({ action: "course.create", restaurantId: selected.id, name: value, sortOrder: selected.courses.length });
      setCourses(selected.id, (courses) => [...courses, { id: course.id, name: course.name }]);
      setCourseName("");
      toast.success("Course added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add course");
    }
  }

  async function saveCourseName(courseId: string) {
    if (!selected) return;
    const value = courseDraft.trim();
    if (value.length < 2) {
      toast.error("Course name must be at least 2 characters.");
      return;
    }
    try {
      const { course } = await post({ action: "course.update", id: courseId, name: value });
      setCourses(selected.id, (courses) => upsertById(courses, { id: course.id, name: course.name }));
      setEditingCourseId(null);
      toast.success("Course updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update course");
    }
  }

  async function moveCourse(index: number, direction: -1 | 1) {
    if (!selected) return;
    const target = index + direction;
    if (target < 0 || target >= selected.courses.length) return;
    const ids = selected.courses.map((course) => course.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await post({ action: "course.reorder", restaurantId: selected.id, orderedIds: ids });
      setCourses(selected.id, (courses) => reorderByIds(courses, ids));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder courses");
    }
  }

  async function deleteCourse(course: Course) {
    if (!selected) return;
    const ok = await confirm({
      title: `Delete the course "${course.name}"?`,
      description: "A course that still has menu items can't be deleted. Move or delete those items first.",
      confirmLabel: "Delete course",
      destructive: true
    });
    if (!ok) return;
    try {
      await post({ action: "course.delete", id: course.id });
      setCourses(selected.id, (courses) => removeById(courses, course.id));
      toast.success("Course deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete course");
    }
  }

  // ---- Detail view: manage one restaurant ----
  if (selected) {
    const deleteBlock = restaurantDeleteBlock(selected.orderCount);
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setManagingId(null)}>
            <ChevronLeft size={16} className="-ml-1 mr-1" />
            All restaurants
          </Button>
          <Button variant={selected.active ? "outline" : "secondary"} onClick={toggleActive}>
            {selected.active ? "Switch off" : "Switch on"}
          </Button>
        </div>

        <SectionCard
          title={selected.name}
          description={
            selected.active
              ? "Switched on: customers can see this restaurant and order from it."
              : "Switched off: customers can't see this restaurant. Its menu and order history are kept."
          }
          actions={selected.active ? <Badge tone="green">Live</Badge> : <Badge tone="red">Switched off</Badge>}
          bodyClassName="grid grid-cols-3 gap-3 text-center"
        >
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xl font-bold">{selected.itemCount}</p>
            <p className="text-xs text-neutral-500">Menu items</p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xl font-bold">{selected.comboCount}</p>
            <p className="text-xs text-neutral-500">Combos</p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xl font-bold">{selected.orderCount}</p>
            <p className="text-xs text-neutral-500">Past orders</p>
          </div>
        </SectionCard>

        <SectionCard title="Restaurant profile" description="This is what customers see on the menu restaurant cards.">
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div
              className="h-40 rounded-xl bg-neutral-100 bg-cover bg-center"
              style={{ backgroundImage: `url('${selected.imageUrl ?? PLACEHOLDER}')` }}
            />
            <div className="min-w-0 space-y-3">
              <Input defaultValue={selected.name} key={`name-${selected.id}-${selected.name}`} aria-label="Restaurant name" onBlur={(event) => saveName(event.target.value)} />
              <Textarea defaultValue={selected.description ?? ""} key={`desc-${selected.id}`} aria-label="Description" placeholder="Short description" onBlur={(event) => saveDescription(event.target.value)} />
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
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input placeholder="New course/category" value={courseName} onChange={(event) => setCourseName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createCourse(); }} />
            <Button variant="outline" className="shrink-0" onClick={createCourse}>
              <Plus size={16} className="-ml-1 mr-1" />
              Add course
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {selected.courses.map((course, index) => (
              <div key={course.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 p-3">
                {editingCourseId === course.id ? (
                  <>
                    <Input className="min-w-0 flex-1" autoFocus value={courseDraft} aria-label="Course name" onChange={(event) => setCourseDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveCourseName(course.id); if (event.key === "Escape") setEditingCourseId(null); }} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveCourseName(course.id)}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingCourseId(null)}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="flex shrink-0 flex-col">
                        <button type="button" className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30" disabled={index === 0} aria-label={`Move ${course.name} up`} onClick={() => moveCourse(index, -1)}>
                          <ChevronUp size={16} />
                        </button>
                        <button type="button" className="text-neutral-400 hover:text-neutral-900 disabled:opacity-30" disabled={index === selected.courses.length - 1} aria-label={`Move ${course.name} down`} onClick={() => moveCourse(index, 1)}>
                          <ChevronDown size={16} />
                        </button>
                      </div>
                      <span className="min-w-0 truncate font-semibold">{course.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingCourseId(course.id); setCourseDraft(course.name); }}>
                        Rename
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteCourse(course)}>
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {!selected.courses.length ? (
              <div className="rounded-xl bg-neutral-50 sm:col-span-2">
                <EmptyState title="No courses yet" description="Add a course like Starters or Mains, then you can add menu items to it." />
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Delete this restaurant" description="Only for a restaurant that never took an order. Otherwise, switch it off." bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600">
            {deleteBlock ?? "This restaurant has no orders, so it can be deleted for good."}
          </p>
          <Button variant="destructive" className="shrink-0" disabled={deleteBlock !== null} onClick={deleteRestaurant}>
            Delete restaurant
          </Button>
        </SectionCard>
        {confirmDialog}
      </div>
    );
  }

  // ---- List view: restaurant names ----
  return (
    <div className="space-y-5">
      <div className="grid gap-3 min-[430px]:grid-cols-3 sm:gap-4">
        <StatCard label="Restaurants" value={stats.total} helper={`${stats.live} live`} />
        <StatCard label="Courses" value={stats.courses} helper="Across all restaurants" />
        <StatCard label="Switched off" value={stats.total - stats.live} helper="Not shown to customers" />
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
        {sorted.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((restaurant) => (
              <button
                key={restaurant.id}
                type="button"
                onClick={() => setManagingId(restaurant.id)}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left transition hover:border-amber-300 hover:bg-amber-50"
              >
                <div
                  className="h-14 w-14 shrink-0 rounded-xl bg-neutral-100 bg-cover bg-center"
                  style={{ backgroundImage: `url('${restaurant.imageUrl ?? PLACEHOLDER}')` }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-neutral-950">{restaurant.name}</p>
                    {!restaurant.active ? <Badge tone="red" className="shrink-0">Switched off</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {plural(restaurant.itemCount, "item")} · {plural(restaurant.courses.length, "course")} · {plural(restaurant.orderCount, "order")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No restaurants yet"
            description="Add your first restaurant to start building a menu."
            action={
              <Button onClick={openCreate}>
                <Store size={16} className="-ml-1 mr-1" />
                Add restaurant
              </Button>
            }
          />
        )}
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
      {confirmDialog}
    </div>
  );
}
