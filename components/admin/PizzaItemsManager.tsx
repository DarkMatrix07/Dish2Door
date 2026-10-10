"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/admin/AdminShell";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PizzaStatRow } from "@/components/admin/PizzaStatRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn, formatPaise } from "@/lib/utils";

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

type Draft = { name: string; price: string; discountPercent: string; courseId: string; sizeLabel: string; sizeOrder: string; isVeg: string };

const PLACEHOLDER = "/pizza-placeholder.webp";
const IMAGE_TYPES = "image/png,image/jpeg,image/webp";

const VEG_OPTIONS = [
  { value: "veg", label: "Veg" },
  { value: "nonveg", label: "Non-veg" }
];

function priceAfterDiscount(item: Pick<MenuItem, "pricePaise" | "discountPercent">) {
  return Math.round(item.pricePaise * (1 - (item.discountPercent ?? 0) / 100));
}

// A visible label above a form control, same look as the Dropdown's own label.
function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block text-xs font-semibold text-neutral-500", className)}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

// A normal-looking button that opens the phone's photo picker (the browser's own file
// control is too wide and its text can't be changed).
function ChoosePhoto({ busy, onPick }: { busy?: boolean; onPick: (file: File | undefined) => void }) {
  return (
    <label
      className={cn(
        "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 focus-within:ring-4 focus-within:ring-amber-200",
        busy && "pointer-events-none opacity-55"
      )}
    >
      {busy ? "Uploading..." : "Choose photo"}
      <input
        className="sr-only"
        type="file"
        accept={IMAGE_TYPES}
        disabled={busy}
        onChange={(event) => {
          onPick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );
}

export function PizzaItemsManager({ restaurant: initialRestaurant }: { restaurant: Restaurant }) {
  const [restaurant, setRestaurant] = useState(initialRestaurant);
  const [confirm, confirmDialog] = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  // A dish is entered once with however many size/price rows it actually has. An empty
  // sizeLabel means "no sizes" — a single plain price, which is the old behaviour.
  const [item, setItem] = useState({ name: "", discountPercent: "0", courseId: "", isVeg: "veg" });
  const [sizeRows, setSizeRows] = useState<{ label: string; price: string }[]>([{ label: "", price: "" }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", price: "", discountPercent: "0", courseId: "", sizeLabel: "", sizeOrder: "0", isVeg: "veg" });
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
    try {
      await action({ action: "item.stock", id, available });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update stock");
    }
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
    setSaving(true);
    try {
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
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

  async function deleteItem(menuItem: MenuItem) {
    const label = menuItem.sizeLabel ? `${menuItem.name} (${menuItem.sizeLabel})` : menuItem.name;
    const ok = await confirm({
      title: `Delete ${label}?`,
      description: "Customers will no longer see it on the menu.",
      confirmLabel: "Delete",
      destructive: true
    });
    if (!ok) return;
    try {
      await action({ action: "item.delete", id: menuItem.id });
      toast.success("Menu item deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete item");
    }
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

  const courseOptions = restaurant.courses.map((course) => ({ value: course.id, label: course.name }));

  return (
    <div className="space-y-5">
      {/* Stats on their own full-width row; the Add button sits under them on phones. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PizzaStatRow
          className="sm:max-w-xl"
          stats={[
            { label: "Items", value: restaurant.menuItems.length },
            { label: "Live", value: restaurant.menuItems.filter((i) => i.available).length },
            { label: "Out", value: restaurant.menuItems.filter((i) => !i.available).length }
          ]}
        />
        <Button className="w-full sm:w-auto" onClick={openCreate}>
          <Plus size={16} className="-ml-1 mr-1" />
          Add item
        </Button>
      </div>

      <SectionCard title="Inventory" description="Every dish with its sizes, prices, discount and stock." bodyClassName="p-0">
        <div className="divide-y divide-neutral-100">
          {groups.map((group) => {
            const dish = group[0];
            return (
              <div key={`${dish.courseId}::${dish.name}`} className="space-y-3 p-3 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-xl bg-neutral-100 bg-cover bg-center sm:h-20 sm:w-20" style={{ backgroundImage: `url('${dish.imageUrl ?? PLACEHOLDER}')` }} />
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{dish.name}</p>
                    <p className="text-xs text-neutral-500">{dish.course.name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.map((menuItem) => {
                    const editing = editingId === menuItem.id;
                    const uploading = uploadingId === menuItem.id;
                    return (
                      <div
                        key={menuItem.id}
                        className={cn(
                          "rounded-xl border p-2.5 sm:p-3",
                          editing ? "border-amber-200 bg-amber-50/40" : menuItem.available ? "border-neutral-100 bg-neutral-50/60" : "border-red-100 bg-red-50/40"
                        )}
                      >
                        {editing ? (
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field label="Item name" className="sm:col-span-2">
                                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                              </Field>
                              <Dropdown label="Course" placeholder="Choose a course" value={draft.courseId} onChange={(courseId) => setDraft({ ...draft, courseId })} options={courseOptions} />
                              <Dropdown label="Veg / Non-veg" value={draft.isVeg} onChange={(isVeg) => setDraft({ ...draft, isVeg })} options={VEG_OPTIONS} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="Price (₹)">
                                <Input type="number" inputMode="decimal" min={1} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
                              </Field>
                              <Field label="Discount (%)">
                                <Input type="number" inputMode="numeric" min={0} max={90} value={draft.discountPercent} onChange={(event) => setDraft({ ...draft, discountPercent: event.target.value })} />
                              </Field>
                              <Field label="Size name">
                                <Input placeholder="e.g. Large" value={draft.sizeLabel} onChange={(event) => setDraft({ ...draft, sizeLabel: event.target.value })} />
                              </Field>
                              <Field label="Size position (0 = first)">
                                <Input type="number" inputMode="numeric" value={draft.sizeOrder} onChange={(event) => setDraft({ ...draft, sizeOrder: event.target.value })} />
                              </Field>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-neutral-500">Photo</p>
                              <div className="mt-1 flex items-center gap-3">
                                <div className="h-16 w-16 shrink-0 rounded-lg bg-neutral-100 bg-cover bg-center" style={{ backgroundImage: `url('${menuItem.imageUrl ?? PLACEHOLDER}')` }} />
                                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                                  <ChoosePhoto busy={uploading} onPick={(file) => replaceItemImage(menuItem, file)} />
                                  {menuItem.imageUrl ? (
                                    <button
                                      type="button"
                                      disabled={uploading}
                                      onClick={() => clearItemImage(menuItem)}
                                      className="inline-flex h-10 items-center whitespace-nowrap px-1 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-55"
                                    >
                                      Remove photo
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-neutral-500">A new photo is saved straight away.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                              <Button variant="outline" size="sm" className="h-10 sm:h-9" disabled={saving} onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                              <Button size="sm" className="h-10 sm:h-9" disabled={saving} onClick={() => saveItem(menuItem)}>
                                {saving ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                              {menuItem.sizeLabel ? <Badge tone="neutral">{menuItem.sizeLabel}</Badge> : null}
                              <span className="text-sm">
                                <span className="font-semibold text-neutral-900">{formatPaise(priceAfterDiscount(menuItem))}</span>
                                {menuItem.discountPercent ? <span className="ml-1.5 text-xs text-neutral-400 line-through">{formatPaise(menuItem.pricePaise)}</span> : null}
                              </span>
                              {menuItem.discountPercent ? <Badge tone="amber">{menuItem.discountPercent}% off</Badge> : null}
                              <Badge tone={menuItem.available ? "green" : "red"}>{menuItem.available ? "In stock" : "Sold out"}</Badge>
                            </div>
                            {/* Four actions on one line on phones; Delete stays quiet red text because every row has one. */}
                            <div className="mt-2.5 grid grid-cols-[1fr_1.5fr_0.8fr_1.1fr] gap-1.5 sm:flex sm:justify-end sm:gap-2 [&>*]:whitespace-nowrap">
                              <label
                                className={cn(
                                  "inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-neutral-300 bg-white px-1 text-sm font-semibold transition hover:bg-neutral-100 focus-within:ring-4 focus-within:ring-amber-200 sm:h-9 sm:px-3",
                                  uploading && "pointer-events-none opacity-55"
                                )}
                              >
                                {uploading ? "Wait..." : "Image"}
                                <input
                                  className="sr-only"
                                  type="file"
                                  accept={IMAGE_TYPES}
                                  disabled={uploading}
                                  onChange={(event) => {
                                    replaceItemImage(menuItem, event.target.files?.[0]);
                                    event.target.value = "";
                                  }}
                                />
                              </label>
                              <Button variant="outline" size="sm" className="h-10 px-1 sm:h-9 sm:px-3" onClick={() => stock(menuItem.id, !menuItem.available)}>
                                {menuItem.available ? "Mark out" : "Restock"}
                              </Button>
                              <Button variant="outline" size="sm" className="h-10 px-1 sm:h-9 sm:px-3" onClick={() => startEdit(menuItem)}>
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" className="h-10 px-1 text-red-600 hover:bg-red-50 hover:text-red-700 sm:h-9 sm:px-3" onClick={() => deleteItem(menuItem)}>
                                Delete
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!restaurant.menuItems.length ? (
            <EmptyState title="No menu items yet" description="Use “Add item” to create your first one." />
          ) : null}
        </div>
      </SectionCard>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add menu item"
        description="Prices are in rupees. Discount is optional."
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
          <Field label="Item name">
            <Input placeholder="e.g. Peppy Paneer" value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Dropdown label="Veg / Non-veg" value={item.isVeg} onChange={(isVeg) => setItem({ ...item, isVeg })} options={VEG_OPTIONS} />
            <Field label="Discount (%)">
              <Input type="number" inputMode="numeric" min={0} max={90} value={item.discountPercent} onChange={(event) => setItem({ ...item, discountPercent: event.target.value })} />
            </Field>
          </div>

          <div className="rounded-xl border border-neutral-200 p-2.5 sm:p-3">
            <p className="text-sm font-semibold text-[#202126]">Sizes &amp; prices</p>
            <p className="mt-0.5 text-xs text-[#777981]">
              Leave the size name blank for a dish sold one way. Sizes differ per dish, so add only what this one has.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5 h-10 w-full whitespace-nowrap sm:h-9 sm:w-auto"
              onClick={() => setSizeRows((rows) => [...rows, { label: "", price: "" }])}
            >
              <Plus size={14} /> Add size
            </Button>

            <div className="mt-3 space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_2.75rem] gap-1.5 text-xs font-semibold text-neutral-500">
                <span>Size name</span>
                <span>Price (₹)</span>
                <span className="sr-only">Remove</span>
              </div>
              {sizeRows.map((row, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_5.5rem_2.75rem] items-center gap-1.5">
                  <Input
                    className="px-2.5"
                    placeholder="Size"
                    aria-label={`Size name, row ${index + 1}`}
                    value={row.label}
                    onChange={(event) =>
                      setSizeRows((rows) => rows.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))
                    }
                  />
                  <Input
                    className="px-2.5"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    placeholder="Price"
                    aria-label={`Price in rupees, row ${index + 1}`}
                    value={row.price}
                    onChange={(event) =>
                      setSizeRows((rows) => rows.map((entry, i) => (i === index ? { ...entry, price: event.target.value } : entry)))
                    }
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    aria-label="Remove this size"
                    disabled={sizeRows.length === 1}
                    onClick={() => setSizeRows((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Dropdown label="Course" placeholder="Choose a course" value={item.courseId} onChange={(courseId) => setItem({ ...item, courseId })} options={courseOptions} />

          <div>
            <p className="text-xs font-semibold text-neutral-500">
              Photo <span className="font-medium text-neutral-400">(optional)</span>
            </p>
            <div className="mt-1 space-y-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
              <div className="h-24 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url('${imagePreview || PLACEHOLDER}')` }} />
              <div className="flex items-center gap-3">
                <ChoosePhoto onPick={onNewImage} />
                <span className="min-w-0 truncate text-sm text-neutral-500">{imageFile ? imageFile.name : "No photo chosen"}</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  );
}
