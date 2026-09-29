"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { SectionCard } from "@/components/admin/AdminShell";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button, linkButtonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  MAX_BULK_ITEMS,
  MAX_DISCOUNT_PERCENT,
  countItems,
  filterDishGroups,
  groupDishes,
  parseDiscountPercent,
  parsePricePaise,
  parseSizeOrder,
  removeById,
  upsertById,
  upsertManyById,
  type ItemFilter
} from "@/lib/menu-admin";
import { cn, formatPaise } from "@/lib/utils";

type Course = { id: string; name: string };

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
  sizeOrder: number;
};

export type RestaurantChoice = { id: string; name: string; itemCount: number; soldOutCount: number };
export type RestaurantMenu = { courses: Course[]; items: MenuItem[] };

type Draft = { name: string; price: string; discountPercent: string; courseId: string; sizeLabel: string; sizeOrder: string };

const PLACEHOLDER = "/dish-placeholder.webp";
const EMPTY_DRAFT: Draft = { name: "", price: "", discountPercent: "0", courseId: "", sizeLabel: "", sizeOrder: "0" };

const FILTERS: { value: ItemFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "soldOut", label: "Sold out" },
  { value: "discounted", label: "Discounted" }
];

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

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block text-xs font-semibold text-neutral-500", className)}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function priceOf(item: Pick<MenuItem, "pricePaise" | "discountPercent">) {
  return Math.round(item.pricePaise * (1 - item.discountPercent / 100));
}

export function ItemsManager({
  restaurants,
  initialRestaurantId,
  initialMenu
}: {
  restaurants: RestaurantChoice[];
  initialRestaurantId: string | null;
  initialMenu: RestaurantMenu | null;
}) {
  const [restaurantId, setRestaurantId] = useState(initialRestaurantId);
  // Each restaurant's menu is loaded on first visit and kept, so switching back is instant
  // and edits update just the row that changed.
  const [cache, setCache] = useState<Record<string, RestaurantMenu>>(initialRestaurantId && initialMenu ? { [initialRestaurantId]: initialMenu } : {});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const inflight = useRef(new Set<string>());

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPercent, setBulkPercent] = useState("10");
  const [bulkBusy, setBulkBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newItem, setNewItem] = useState<Draft>(EMPTY_DRAFT);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const menu = restaurantId ? cache[restaurantId] : undefined;
  const courses = useMemo(() => menu?.courses ?? [], [menu]);
  const items = useMemo(() => menu?.items ?? [], [menu]);
  const restaurant = restaurants.find((entry) => entry.id === restaurantId);
  const loadError = restaurantId ? loadErrors[restaurantId] : undefined;

  useEffect(() => {
    if (!restaurantId || cache[restaurantId] || loadErrors[restaurantId] || inflight.current.has(restaurantId)) return;
    const id = restaurantId;
    inflight.current.add(id);
    fetch(`/api/admin/menu?restaurantId=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load this menu");
        setCache((current) => ({ ...current, [id]: { courses: data.restaurant.courses, items: data.restaurant.menuItems } }));
      })
      .catch((error) => setLoadErrors((current) => ({ ...current, [id]: error instanceof Error ? error.message : "Could not load this menu" })))
      .finally(() => inflight.current.delete(id));
  }, [restaurantId, cache, loadErrors]);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const groups = useMemo(() => groupDishes(items, courses.map((course) => course.id)), [items, courses]);
  const shownGroups = useMemo(() => filterDishGroups(groups, { query, filter }), [groups, query, filter]);
  const shownItems = useMemo(() => shownGroups.flatMap((group) => group.items), [shownGroups]);
  const counts = useMemo(() => countItems(items), [items]);
  const allShownSelected = shownItems.length > 0 && shownItems.every((item) => selectedIds.has(item.id));

  function chooseRestaurant(id: string) {
    setRestaurantId(id);
    setSelectedIds(new Set());
    setEditingId(null);
    setQuery("");
    setFilter("all");
    // Keeps the link shareable and lets the dashboard's "sold out" links land here.
    window.history.replaceState(null, "", `?restaurant=${encodeURIComponent(id)}`);
  }

  function retryLoad() {
    if (!restaurantId) return;
    setLoadErrors((current) => removeKey(current, restaurantId));
  }

  // Server rows come back with their course; if not, take the name from the course list.
  function withCourse(row: MenuItem & { course?: { name: string } }): MenuItem {
    return { ...row, course: row.course ?? { name: courses.find((course) => course.id === row.courseId)?.name ?? "" } };
  }

  function changeItems(update: (list: MenuItem[]) => MenuItem[]) {
    const id = restaurantId;
    if (!id) return;
    setCache((current) => (current[id] ? { ...current, [id]: { ...current[id], items: update(current[id].items) } } : current));
  }

  function toggleSelected(ids: string[], on: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  // ---- Adding ----

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
    if (!restaurant) return;
    if (!courses.length) {
      toast.error("Add a course to this restaurant first (Menu > Restaurants), then add items.");
      return;
    }
    setNewItem({ ...EMPTY_DRAFT, courseId: courses[0].id });
    onNewImage(undefined);
    setShowCreate(true);
  }

  async function createItem() {
    if (!restaurant) return;
    const courseId = newItem.courseId || courses[0]?.id;
    if (!courseId) return toast.error("Add a course to this restaurant first.");
    if (newItem.name.trim().length < 2) return toast.error("Enter an item name (at least 2 characters).");
    const price = parsePricePaise(newItem.price);
    if (!price.ok) return toast.error(price.error);
    const discount = parseDiscountPercent(newItem.discountPercent);
    if (!discount.ok) return toast.error(discount.error);

    setCreating(true);
    try {
      const imageUrl = imageFile ? await uploadImage(imageFile) : undefined;
      const { item } = await post({
        action: "item.create",
        restaurantId: restaurant.id,
        courseId,
        name: newItem.name.trim(),
        pricePaise: price.value,
        discountPercent: discount.value,
        imageUrl,
        sizeLabel: newItem.sizeLabel.trim() || null,
        sizeOrder: parseSizeOrder(newItem.sizeOrder)
      });
      changeItems((list) => upsertById(list, withCourse(item)));
      setShowCreate(false);
      onNewImage(undefined);
      toast.success("Menu item added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add item");
    } finally {
      setCreating(false);
    }
  }

  // ---- Changing one item ----

  async function setStock(item: MenuItem, available: boolean) {
    try {
      const { item: saved } = await post({ action: "item.stock", id: item.id, available });
      changeItems((list) => upsertById(list, withCourse(saved)));
      toast.success(available ? `${item.name} is back in stock` : `${item.name} is sold out`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update stock");
    }
  }

  function startEdit(item: MenuItem) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      price: String(item.pricePaise / 100),
      discountPercent: String(item.discountPercent),
      courseId: item.courseId,
      sizeLabel: item.sizeLabel ?? "",
      sizeOrder: String(item.sizeOrder ?? 0)
    });
  }

  async function saveItem(item: MenuItem) {
    if (draft.name.trim().length < 2) return toast.error("Enter an item name (at least 2 characters).");
    const price = parsePricePaise(draft.price);
    if (!price.ok) return toast.error(price.error);
    const discount = parseDiscountPercent(draft.discountPercent);
    if (!discount.ok) return toast.error(discount.error);

    setSavingId(item.id);
    try {
      const { item: saved } = await post({
        action: "item.update",
        id: item.id,
        name: draft.name.trim(),
        courseId: draft.courseId,
        pricePaise: price.value,
        discountPercent: discount.value,
        sizeLabel: draft.sizeLabel.trim() || null,
        sizeOrder: parseSizeOrder(draft.sizeOrder)
      });
      changeItems((list) => upsertById(list, withCourse(saved)));
      setEditingId(null);
      toast.success("Menu item updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update item");
    } finally {
      setSavingId(null);
    }
  }

  // The picture belongs to the dish, so a change is written to every size of it.
  async function setDishImage(groupKey: string, dishItems: MenuItem[], imageUrl: string | null) {
    setUploadingKey(groupKey);
    try {
      const results = await Promise.allSettled(dishItems.map((item) => post({ action: "item.update", id: item.id, imageUrl })));
      const saved = results.flatMap((result) => (result.status === "fulfilled" ? [withCourse(result.value.item)] : []));
      changeItems((list) => upsertManyById(list, saved));
      if (saved.length < dishItems.length) toast.error("Some sizes could not be updated. Try again.");
      else toast.success(imageUrl ? "Image updated" : "Image removed");
    } finally {
      setUploadingKey(null);
    }
  }

  async function replaceDishImage(groupKey: string, dishItems: MenuItem[], file: File | undefined) {
    if (!file) return;
    setUploadingKey(groupKey);
    try {
      const imageUrl = await uploadImage(file);
      await setDishImage(groupKey, dishItems, imageUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update image");
      setUploadingKey(null);
    }
  }

  async function deleteItem(item: MenuItem) {
    const label = item.sizeLabel ? `${item.name} (${item.sizeLabel})` : item.name;
    const ok = await confirm({
      title: `Delete ${label}?`,
      description: "It disappears from the menu and from any combo that includes it. Past orders keep their record of it.",
      confirmLabel: "Delete item",
      destructive: true
    });
    if (!ok) return;
    try {
      await post({ action: "item.delete", id: item.id });
      changeItems((list) => removeById(list, item.id));
      toggleSelected([item.id], false);
      toast.success("Menu item deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete item");
    }
  }

  // ---- Discount for many items ----

  async function bulkDiscount(percent: number) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (ids.length > MAX_BULK_ITEMS) return toast.error(`Pick at most ${MAX_BULK_ITEMS} items at a time.`);
    const many = ids.length === 1 ? "1 item" : `${ids.length} items`;
    const ok = await confirm(
      percent > 0
        ? { title: `Apply ${percent}% off to ${many}?`, description: "Customers see the new prices straight away.", confirmLabel: `Apply ${percent}%`, cancelLabel: "Cancel" }
        : { title: `Remove the discount from ${many}?`, description: "They go back to full price straight away.", confirmLabel: "Remove discount", cancelLabel: "Cancel" }
    );
    if (!ok) return;
    setBulkBusy(true);
    try {
      const { items: saved } = await post({ action: "item.discount", ids, discountPercent: percent });
      changeItems((list) => upsertManyById(list, (saved as MenuItem[]).map(withCourse)));
      setSelectedIds(new Set());
      toast.success(percent > 0 ? `${percent}% off applied to ${many}` : `Discount removed from ${many}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update discounts");
    } finally {
      setBulkBusy(false);
    }
  }

  const bulkParsed = parseDiscountPercent(bulkPercent);
  const bulkValue = bulkParsed.ok && bulkParsed.value > 0 ? bulkParsed.value : null;

  // ---- Render ----

  if (!restaurants.length) {
    return (
      <SectionCard>
        <EmptyState
          title="No restaurants yet"
          description="Add a restaurant first, then come back to add its menu items."
          action={<Link href="/admin/menu/restaurants" className={linkButtonClasses("default", "md")}>Go to Restaurants</Link>}
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field label="Restaurant" className="w-full sm:max-w-sm">
          <Select value={restaurantId ?? ""} onChange={(event) => chooseRestaurant(event.target.value)}>
            {restaurants.map((entry) => {
              const loaded = cache[entry.id];
              const total = loaded ? loaded.items.length : entry.itemCount;
              return (
                <option key={entry.id} value={entry.id}>
                  {entry.name} ({total} item{total === 1 ? "" : "s"})
                </option>
              );
            })}
          </Select>
        </Field>
        <Button onClick={openCreate} disabled={!menu}>
          <Plus size={16} className="-ml-1 mr-1" />
          Add item
        </Button>
      </div>

      {!menu ? (
        <SectionCard>
          {loadError ? (
            <EmptyState title="Could not load this menu" description={loadError} action={<Button variant="outline" onClick={retryLoad}>Try again</Button>} />
          ) : (
            <p className="py-10 text-center text-sm text-neutral-500">Loading the menu...</p>
          )}
        </SectionCard>
      ) : (
        <>
          <div className="space-y-3 rounded-xl bg-white p-4 shadow-[0_10px_35px_rgba(30,32,38,0.05)] sm:p-5">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <Input className="pl-9" placeholder="Search items by name" aria-label="Search items by name" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((entry) => {
                const count = entry.value === "all" ? counts.total : entry.value === "soldOut" ? counts.soldOut : counts.discounted;
                return (
                  <Button key={entry.value} size="sm" variant={filter === entry.value ? "default" : "outline"} aria-pressed={filter === entry.value} onClick={() => setFilter(entry.value)}>
                    {entry.label} ({count})
                  </Button>
                );
              })}
              {shownItems.length ? (
                <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-700">
                  <input type="checkbox" className="h-4 w-4 accent-neutral-950" checked={allShownSelected} onChange={(event) => toggleSelected(shownItems.map((item) => item.id), event.target.checked)} />
                  Select all shown ({shownItems.length})
                </label>
              ) : null}
            </div>
          </div>

          {selectedIds.size ? (
            <div className="sticky top-20 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-950 p-3 text-white shadow-lg">
              <span className="px-1 text-sm font-bold">{selectedIds.size} selected</span>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_DISCOUNT_PERCENT}
                  aria-label="Discount percent"
                  className="h-9 w-20 text-neutral-950"
                  value={bulkPercent}
                  onChange={(event) => setBulkPercent(event.target.value)}
                />
                <span className="text-sm font-semibold">%</span>
              </div>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => (bulkValue ? bulkDiscount(bulkValue) : toast.error(bulkParsed.ok ? "Enter a discount from 1 to 90." : bulkParsed.error))}>
                Apply {bulkValue ?? "…"}% to selected
              </Button>
              <Button size="sm" variant="outline" className="text-neutral-950" disabled={bulkBusy} onClick={() => bulkDiscount(0)}>
                Remove discount from selected
              </Button>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          ) : null}

          <SectionCard
            title={restaurant?.name ?? "Menu"}
            description="Prices, discounts and stock for each dish. Dishes with several sizes show one row per size."
            bodyClassName="p-0"
          >
            {!items.length ? (
              <EmptyState
                title="No menu items yet"
                description={courses.length ? "Add the first dish for this restaurant." : "Add a course to this restaurant first, then you can add dishes to it."}
                action={
                  courses.length ? (
                    <Button onClick={openCreate}><Plus size={16} className="-ml-1 mr-1" />Add item</Button>
                  ) : (
                    <Link href="/admin/menu/restaurants" className={linkButtonClasses("default", "md")}>Go to Restaurants</Link>
                  )
                }
              />
            ) : !shownGroups.length ? (
              <EmptyState
                title="No items match"
                description="Try a different search, or show all items."
                action={<Button variant="outline" onClick={() => { setQuery(""); setFilter("all"); }}>Show all items</Button>}
              />
            ) : (
              <div className="divide-y divide-neutral-100">
                {shownGroups.map((group) => {
                  const dishImage = group.items.find((item) => item.imageUrl)?.imageUrl ?? null;
                  const fullDish = groups.find((entry) => entry.key === group.key)?.items ?? group.items;
                  const busyImage = uploadingKey === group.key;
                  const groupSelected = group.items.every((item) => selectedIds.has(item.id));
                  return (
                    // On phones the picture moves into the dish's header line, so the size rows get the full width.
                    <div key={group.key} className="p-3 sm:flex sm:gap-4 sm:p-5">
                      <div className="hidden h-20 w-20 shrink-0 rounded-xl bg-neutral-100 bg-cover bg-center sm:block" style={{ backgroundImage: `url('${dishImage ?? PLACEHOLDER}')` }} />
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                          <label className="flex min-w-0 cursor-pointer items-start gap-2">
                            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-neutral-950" aria-label={`Select ${group.name}`} checked={groupSelected} onChange={(event) => toggleSelected(group.items.map((item) => item.id), event.target.checked)} />
                            <span className="h-10 w-10 shrink-0 rounded-lg bg-neutral-100 bg-cover bg-center sm:hidden" style={{ backgroundImage: `url('${dishImage ?? PLACEHOLDER}')` }} />
                            <span className="min-w-0">
                              <span className="block break-words font-semibold">{group.name}</span>
                              <span className="block text-xs text-neutral-500">{group.items[0].course.name}</span>
                            </span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold transition hover:bg-neutral-100">
                              {busyImage ? "Uploading..." : "Image"}
                              <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={busyImage} onChange={(event) => replaceDishImage(group.key, fullDish, event.target.files?.[0])} />
                            </label>
                            {dishImage ? (
                              <Button variant="outline" size="sm" disabled={busyImage} onClick={() => setDishImage(group.key, fullDish, null)}>
                                Clear image
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        {group.needsSizeLabels ? (
                          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <span className="font-bold">Sizes need labels.</span> This dish has several prices but some have no size name, so customers can&apos;t tell them apart. Use Edit to add one (for example Small, Medium, Large).
                          </p>
                        ) : null}

                        <div className="space-y-2">
                          {group.items.map((item) => (
                            <ItemRow
                              key={item.id}
                              item={item}
                              courses={courses}
                              selected={selectedIds.has(item.id)}
                              editing={editingId === item.id}
                              saving={savingId === item.id}
                              draft={draft}
                              onDraft={setDraft}
                              onSelect={(on) => toggleSelected([item.id], on)}
                              onStock={() => setStock(item, !item.available)}
                              onEdit={() => startEdit(item)}
                              onCancel={() => setEditingId(null)}
                              onSave={() => saveItem(item)}
                              onDelete={() => deleteItem(item)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add menu item"
        description={`New item for ${restaurant?.name ?? "this restaurant"}. To add a size to an existing dish, use the same name and give each a size.`}
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
            <Input placeholder="e.g. Paneer Tikka" value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)">
              <Input type="number" inputMode="decimal" min={1} placeholder="e.g. 120" value={newItem.price} onChange={(event) => setNewItem({ ...newItem, price: event.target.value })} />
            </Field>
            <Field label="Discount (%)">
              <Input type="number" inputMode="numeric" min={0} max={MAX_DISCOUNT_PERCENT} value={newItem.discountPercent} onChange={(event) => setNewItem({ ...newItem, discountPercent: event.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Size (optional)">
              <Input placeholder="e.g. Regular, Large" value={newItem.sizeLabel} onChange={(event) => setNewItem({ ...newItem, sizeLabel: event.target.value })} />
            </Field>
            <Field label="Size position (0 = first)">
              <Input type="number" inputMode="numeric" value={newItem.sizeOrder} onChange={(event) => setNewItem({ ...newItem, sizeOrder: event.target.value })} />
            </Field>
          </div>
          <Field label="Course">
            <Select value={newItem.courseId} onChange={(event) => setNewItem({ ...newItem, courseId: event.target.value })}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
            <div className="grid gap-3 min-[430px]:grid-cols-[80px_1fr] min-[430px]:items-center">
              <div className="h-20 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url('${imagePreview || PLACEHOLDER}')` }} />
              <Input className="h-auto cursor-pointer bg-white py-2" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Item image" onChange={(event) => onNewImage(event.target.files?.[0])} />
            </div>
          </div>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  );
}

function removeKey(record: Record<string, string>, key: string) {
  const { [key]: removed, ...rest } = record;
  void removed;
  return rest;
}

// One size (or the only price) of a dish: what it costs, its discount and stock, and the
// buttons for it. Editing swaps the row for a small form in place.
function ItemRow({
  item,
  courses,
  selected,
  editing,
  saving,
  draft,
  onDraft,
  onSelect,
  onStock,
  onEdit,
  onCancel,
  onSave,
  onDelete
}: {
  item: MenuItem;
  courses: Course[];
  selected: boolean;
  editing: boolean;
  saving: boolean;
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onSelect: (on: boolean) => void;
  onStock: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  if (editing) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={draft.name} onChange={(event) => onDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field label="Course">
            <Select value={draft.courseId} onChange={(event) => onDraft({ ...draft, courseId: event.target.value })}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price (₹)">
            <Input type="number" inputMode="decimal" min={1} value={draft.price} onChange={(event) => onDraft({ ...draft, price: event.target.value })} />
          </Field>
          <Field label="Discount (%)">
            <Input type="number" inputMode="numeric" min={0} max={MAX_DISCOUNT_PERCENT} value={draft.discountPercent} onChange={(event) => onDraft({ ...draft, discountPercent: event.target.value })} />
          </Field>
          <Field label="Size (e.g. Regular, Large)">
            <Input value={draft.sizeLabel} onChange={(event) => onDraft({ ...draft, sizeLabel: event.target.value })} />
          </Field>
          <Field label="Size position (0 = first)">
            <Input type="number" inputMode="numeric" value={draft.sizeOrder} onChange={(event) => onDraft({ ...draft, sizeOrder: event.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving} onClick={onSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-2.5 sm:p-3", item.available ? "border-neutral-100 bg-neutral-50/60" : "border-red-100 bg-red-50/40")}>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-neutral-950" aria-label={`Select ${item.name}${item.sizeLabel ? ` ${item.sizeLabel}` : ""}`} checked={selected} onChange={(event) => onSelect(event.target.checked)} />
      {item.sizeLabel ? <Badge tone="neutral">{item.sizeLabel}</Badge> : null}
      <p className="text-sm">
        <span className="font-semibold text-neutral-900">{formatPaise(priceOf(item))}</span>
        {item.discountPercent ? <span className="ml-1.5 text-xs text-neutral-400 line-through">{formatPaise(item.pricePaise)}</span> : null}
      </p>
      {item.discountPercent ? <Badge tone="amber">{item.discountPercent}% off</Badge> : null}
      <Badge tone={item.available ? "green" : "red"}>{item.available ? "In stock" : "Sold out"}</Badge>
      {/* Three equal buttons on one line on phones; Delete stays quiet because every row has one. */}
      <div className="grid w-full grid-cols-[1.6fr_1fr_1fr] gap-2 sm:ml-auto sm:flex sm:w-auto [&>button]:whitespace-nowrap">
        <Button variant="outline" size="sm" className="px-2 sm:px-3" onClick={onStock}>
          {item.available ? "Mark sold out" : "Back in stock"}
        </Button>
        <Button variant="outline" size="sm" className="px-2 sm:px-3" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="px-2 text-red-600 hover:bg-red-50 hover:text-red-700 sm:px-3" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
