"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
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
  sizeLabel: string | null;
  isVeg: boolean | null;
  sizeOrder: number;
};

type Restaurant = {
  id: string;
  courses: { id: string; name: string }[];
  menuItems: MenuItem[];
};

const PLACEHOLDER = "/pizza-placeholder.webp";

export function PizzaItemsManager({ restaurant: initialRestaurant }: { restaurant: Restaurant }) {
  const [restaurant, setRestaurant] = useState(initialRestaurant);
  const [showCreate, setShowCreate] = useState(false);
  // A dish is entered once with however many size/price rows it actually has. An empty
  // sizeLabel means "no sizes" — a single plain price, which is the old behaviour.
  const [item, setItem] = useState({ name: "", discountPercent: "0", courseId: "", isVeg: "veg" });
  const [sizeRows, setSizeRows] = useState<{ label: string; price: string }[]>([{ label: "", price: "" }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", price: "", discountPercent: "0", courseId: "", sizeLabel: "", sizeOrder: "0", isVeg: "veg" });
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  async function refresh() {
    const response = await fetch("/api/admin/menu");
    const data = await response.json();
    const updated = (data.restaurants as Restaurant[]).find((entry) => entry.id === restaurant.id);
    if (updated) setRestaurant(updated);
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
    if (!restaurant.courses.length) {
      toast.error("Create a course before adding menu items.");
      return;
    }
    setItem({ name: "", discountPercent: "0", courseId: restaurant.courses[0]?.id ?? "", isVeg: "veg" });
    setSizeRows([{ label: "", price: "" }]);
    onNewImage(undefined);
    setShowCreate(true);
  }

  async function createItem() {
    const courseId = item.courseId || restaurant.courses[0]?.id;
    if (!courseId) {
      toast.error("Create a course before adding menu items.");
      return;
    }
    if (!item.name.trim()) {
      toast.error("Enter an item name.");
      return;
    }

    const rows = sizeRows
      .map((row) => ({ label: row.label.trim(), price: Number(row.price) }))
      .filter((row) => row.label || row.price);

    if (!rows.length || rows.some((row) => !row.price || row.price <= 0)) {
      toast.error("Every size needs a price.");
      return;
    }
    if (rows.length > 1 && rows.some((row) => !row.label)) {
      toast.error("Name each size, or keep just one row for a dish with no sizes.");
      return;
    }
    const labels = rows.map((row) => row.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      toast.error("Two sizes share the same name.");
      return;
    }

    setCreating(true);
    try {
      // Uploaded once and shared by every size, so all rows of a dish look the same.
      const imageUrl = imageFile ? await uploadImage(imageFile) : undefined;
      for (const [index, row] of rows.entries()) {
        await action({
          action: "item.create",
          restaurantId: restaurant.id,
          courseId,
          name: item.name,
          pricePaise: Math.round(row.price * 100),
          discountPercent: Number(item.discountPercent || 0),
          imageUrl,
          sizeLabel: row.label || null,
          sizeOrder: index,
          isVeg: item.isVeg === "veg"
        });
      }
      setShowCreate(false);
      setItem({ name: "", discountPercent: "0", courseId: "", isVeg: "veg" });
      setSizeRows([{ label: "", price: "" }]);
      onNewImage(undefined);
      toast.success(rows.length > 1 ? `Added ${item.name} in ${rows.length} sizes` : "Menu item added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add item");
    } finally {
      setCreating(false);
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
      courseId: menuItem.courseId,
      sizeLabel: menuItem.sizeLabel ?? "",
      isVeg: menuItem.isVeg === false ? "nonveg" : "veg",
      sizeOrder: String(menuItem.sizeOrder ?? 0)
    });
  }

  async function saveItem(menuItem: MenuItem) {
    await action({
      action: "item.update",
      id: menuItem.id,
      name: draft.name,
      courseId: draft.courseId,
      pricePaise: Math.round(Number(draft.price) * 100),
      discountPercent: Number(draft.discountPercent || 0),
      sizeLabel: draft.sizeLabel.trim() || null,
      sizeOrder: Number(draft.sizeOrder || 0),
      isVeg: draft.isVeg === "veg"
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

  // Pizza-style dishes are several rows sharing a name within the same course, one per
  // size. Group them so all sizes of one dish render together, sorted by sizeOrder then
  // price, instead of scattered alphabetically among unrelated items.
  const groups = (() => {
    const map = new Map<string, MenuItem[]>();
    for (const menuItem of restaurant.menuItems) {
      const key = `${menuItem.courseId}::${menuItem.name}`;
      const list = map.get(key) ?? [];
      list.push(menuItem);
      map.set(key, list);
    }
    return Array.from(map.values()).map((list) => [...list].sort((a, b) => a.sizeOrder - b.sizeOrder || a.pricePaise - b.pricePaise));
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3 text-center min-[430px]:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xl font-bold">{restaurant.menuItems.length}</p>
            <p className="text-xs text-neutral-500">Items</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xl font-bold">{restaurant.menuItems.filter((i) => i.available).length}</p>
            <p className="text-xs text-neutral-500">Live</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xl font-bold">{restaurant.menuItems.filter((i) => !i.available).length}</p>
            <p className="text-xs text-neutral-500">Out</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} className="-ml-1 mr-1" />
          Add item
        </Button>
      </div>

      <SectionCard title="Inventory" description="Course, size, price, discount, stock status, and item actions." bodyClassName="p-0">
        <div className="divide-y divide-neutral-100">
          {groups.map((group) => {
            const dish = group[0];
            return (
              <div key={`${dish.courseId}::${dish.name}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:p-5">
                <div className="h-20 w-20 shrink-0 rounded-xl bg-neutral-100 bg-cover bg-center" style={{ backgroundImage: `url('${dish.imageUrl ?? PLACEHOLDER}')` }} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="font-semibold">{dish.name}</p>
                    <p className="text-xs text-neutral-500">{dish.course.name}</p>
                  </div>
                  {group.map((menuItem) => (
                    <div key={menuItem.id} className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3">
                      {editingId === menuItem.id ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                          <Select value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}>
                            {restaurant.courses.map((course) => (
                              <option key={course.id} value={course.id}>
                                {course.name}
                              </option>
                            ))}
                          </Select>
                          <Input type="number" min={1} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
                          <Input type="number" min={0} max={90} value={draft.discountPercent} onChange={(event) => setDraft({ ...draft, discountPercent: event.target.value })} />
                          <Input placeholder="Size (e.g. Regular, Medium, Large)" value={draft.sizeLabel} onChange={(event) => setDraft({ ...draft, sizeLabel: event.target.value })} />
                          <Input type="number" placeholder="Size order" value={draft.sizeOrder} onChange={(event) => setDraft({ ...draft, sizeOrder: event.target.value })} />
                          <Select value={draft.isVeg} onChange={(event) => setDraft({ ...draft, isVeg: event.target.value })}>
                            <option value="veg">Veg</option>
                            <option value="nonveg">Non-veg</option>
                          </Select>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            {menuItem.sizeLabel ? <Badge tone="neutral">{menuItem.sizeLabel}</Badge> : null}
                            <Badge tone={menuItem.available ? "green" : "red"}>{menuItem.available ? "Available" : "Out of stock"}</Badge>
                            {menuItem.discountPercent ? <Badge tone="amber">{menuItem.discountPercent}% off</Badge> : null}
                          </div>
                          <p className="mt-1 text-sm text-neutral-500">
                            <span className="font-semibold text-neutral-900">{formatPaise(menuItem.pricePaise)}</span>
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
                  ))}
                </div>
              </div>
            );
          })}
          {!restaurant.menuItems.length ? (
            <div className="p-8 text-center text-neutral-500">No menu items yet. Use “Add item” to create your first one.</div>
          ) : null}
        </div>
      </SectionCard>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add menu item"
        description="Price in INR, discount optional."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button disabled={creating} onClick={createItem}>
              {creating ? "Adding..." : "Add item"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input placeholder="Item name" value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={item.isVeg} onChange={(event) => setItem({ ...item, isVeg: event.target.value })}>
              <option value="veg">Veg</option>
              <option value="nonveg">Non-veg</option>
            </Select>
            <Input type="number" min={0} max={90} placeholder="Discount %" value={item.discountPercent} onChange={(event) => setItem({ ...item, discountPercent: event.target.value })} />
          </div>

          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#202126]">Sizes &amp; prices</p>
                <p className="mt-0.5 text-xs text-[#777981]">
                  Leave the size name blank for a dish sold one way. Sizes differ per dish, so add only what this one has.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSizeRows((rows) => [...rows, { label: "", price: "" }])}
              >
                <Plus size={14} /> Add type
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {sizeRows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                  <Input
                    placeholder={index === 0 ? "Size (e.g. Regular) — optional" : "Size (e.g. Medium)"}
                    value={row.label}
                    onChange={(event) =>
                      setSizeRows((rows) => rows.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))
                    }
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="₹ Price"
                    value={row.price}
                    onChange={(event) =>
                      setSizeRows((rows) => rows.map((entry, i) => (i === index ? { ...entry, price: event.target.value } : entry)))
                    }
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Remove this size"
                    disabled={sizeRows.length === 1}
                    onClick={() => setSizeRows((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Select value={item.courseId} onChange={(event) => setItem({ ...item, courseId: event.target.value })}>
            <option value="">Select course</option>
            {restaurant.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
            <div className="grid gap-3 min-[430px]:grid-cols-[80px_1fr] min-[430px]:items-center">
              <div className="h-20 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url('${imagePreview || PLACEHOLDER}')` }} />
              <Input className="h-auto cursor-pointer bg-white py-2" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onNewImage(event.target.files?.[0])} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
