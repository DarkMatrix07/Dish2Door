"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Minus, Package, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/admin/AdminShell";
import { formatPaise } from "@/lib/utils";

type MenuItemLite = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  discountPercent: number;
  imageUrl: string | null;
  available: boolean;
};

type ComboLine = { id: string; quantity: number; menuItem: MenuItemLite };

type Combo = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  comboPricePaise: number;
  active: boolean;
  sortOrder: number;
  items: ComboLine[];
};

type Restaurant = {
  id: string;
  menuItems: MenuItemLite[];
  combos: Combo[];
};

function discountedUnit(item: Pick<MenuItemLite, "pricePaise" | "discountPercent">) {
  return Math.round(item.pricePaise * (1 - (item.discountPercent ?? 0) / 100));
}

async function postAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/admin/menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Action failed");
  return data;
}

export function PizzaCombosManager({ restaurant: initialRestaurant }: { restaurant: Restaurant }) {
  const [restaurant, setRestaurant] = useState(initialRestaurant);

  // Builder state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [comboRupees, setComboRupees] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [itemQuery, setItemQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const menuItems = restaurant.menuItems;
  const menuMap = useMemo(() => new Map(menuItems.map((item) => [item.id, item])), [menuItems]);

  const filteredItems = useMemo(() => {
    const search = itemQuery.trim().toLowerCase();
    if (!search) return menuItems;
    return menuItems.filter((item) => item.name.toLowerCase().includes(search));
  }, [menuItems, itemQuery]);

  const selectedLines = useMemo(
    () =>
      Object.entries(selected)
        .map(([id, quantity]) => ({ item: menuMap.get(id), quantity }))
        .filter((line): line is { item: MenuItemLite; quantity: number } => Boolean(line.item)),
    [selected, menuMap]
  );

  const distinctCount = selectedLines.length;
  const realTotalPaise = selectedLines.reduce((sum, line) => sum + discountedUnit(line.item) * line.quantity, 0);
  const comboPaise = Math.round((parseFloat(comboRupees) || 0) * 100);
  const savingsPaise = Math.max(0, realTotalPaise - comboPaise);
  const savingsPercent = realTotalPaise > 0 ? Math.round((savingsPaise / realTotalPaise) * 100) : 0;
  const priceAboveItems = comboPaise > 0 && comboPaise >= realTotalPaise;

  function resetBuilder() {
    setEditingId(null);
    setName("");
    setDescription("");
    setImageUrl("");
    setComboRupees("");
    setSelected({});
    setItemQuery("");
  }

  function addItem(id: string) {
    setSelected((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }

  function stepItem(id: string, delta: number) {
    setSelected((current) => {
      const next = (current[id] ?? 0) + delta;
      const clone = { ...current };
      if (next <= 0) delete clone[id];
      else clone[id] = next;
      return clone;
    });
  }

  function loadForEdit(combo: Combo) {
    setEditingId(combo.id);
    setName(combo.name);
    setDescription(combo.description ?? "");
    setImageUrl(combo.imageUrl ?? "");
    setComboRupees((combo.comboPricePaise / 100).toString());
    setSelected(Object.fromEntries(combo.items.map((line) => [line.menuItem.id, line.quantity])));
    setItemQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function upsertCombo(combo: Combo) {
    setRestaurant((current) => ({
      ...current,
      combos: current.combos.some((existing) => existing.id === combo.id)
        ? current.combos.map((existing) => (existing.id === combo.id ? combo : existing))
        : [combo, ...current.combos]
    }));
  }

  async function save() {
    if (name.trim().length < 2) return toast.error("Give the combo a name.");
    if (distinctCount < 2) return toast.error("Add at least two items to the combo.");
    if (comboPaise < 100) return toast.error("Set a combo price of at least ₹1.");

    const items = selectedLines.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity }));
    setSaving(true);
    try {
      const payload = editingId
        ? { action: "combo.update", id: editingId, name: name.trim(), description: description.trim() || null, imageUrl: imageUrl.trim() || null, comboPricePaise: comboPaise, items }
        : { action: "combo.create", restaurantId: restaurant.id, name: name.trim(), description: description.trim() || undefined, imageUrl: imageUrl.trim() || undefined, comboPricePaise: comboPaise, items };
      const { combo } = await postAction(payload);
      upsertCombo(combo as Combo);
      toast.success(editingId ? "Combo updated" : "Combo created");
      resetBuilder();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save combo");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(combo: Combo) {
    try {
      const { combo: updated } = await postAction({ action: "combo.active", id: combo.id, active: !combo.active });
      upsertCombo(updated as Combo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update combo");
    }
  }

  async function removeCombo(combo: Combo) {
    if (!window.confirm(`Delete the combo "${combo.name}"? This cannot be undone.`)) return;
    try {
      await postAction({ action: "combo.delete", id: combo.id });
      setRestaurant((current) => ({ ...current, combos: current.combos.filter((existing) => existing.id !== combo.id) }));
      if (editingId === combo.id) resetBuilder();
      toast.success("Combo deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete combo");
    }
  }

  if (!restaurant.menuItems.length) {
    return (
      <SectionCard>
        <div className="grid place-items-center py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f3f4f6]"><Package size={22} /></span>
          <h2 className="mt-4 text-lg font-black">No menu items yet</h2>
          <p className="mt-1 text-sm text-[#777981]">Add some menu items first, then build combos here.</p>
        </div>
      </SectionCard>
    );
  }

  const combos = restaurant.combos;
  const inputClass = "h-11 w-full rounded-lg border border-black/12 bg-white px-3.5 text-sm font-medium outline-none transition focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Builder */}
        <SectionCard
          title={editingId ? "Edit combo" : "Build a combo"}
          description="Pick items, then set your bundle price."
          actions={editingId ? <button type="button" onClick={resetBuilder} className="inline-flex items-center gap-1.5 rounded-lg border border-black/12 px-3 py-1.5 text-sm font-bold text-[#4e5057] transition hover:border-black/25"><X size={14} /> Cancel edit</button> : null}
          bodyClassName="space-y-5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-[#3f4046]">Combo name<input className={`${inputClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Lunch Feast" maxLength={80} /></label>
            <label className="text-sm font-bold text-[#3f4046]">Image URL <span className="font-medium text-[#a0a2a8]">(optional)</span><input className={`${inputClass} mt-1.5`} value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="/uploads/combo.png or https://…" /></label>
            <label className="text-sm font-bold text-[#3f4046] sm:col-span-2">Short description <span className="font-medium text-[#a0a2a8]">(optional)</span><input className={`${inputClass} mt-1.5`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What makes this combo great" maxLength={300} /></label>
          </div>

          {/* Item picker */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#3f4046]">Items in this combo</p>
              <span className="text-xs font-semibold text-[#85878e]">{distinctCount} selected</span>
            </div>
            <div className="relative mt-2">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a2a8]" />
              <input className={`${inputClass} pl-9`} value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder="Search menu items" />
            </div>

            <div className="admin-scrollbar mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {filteredItems.length ? filteredItems.map((item) => {
                const quantity = selected[item.id] ?? 0;
                const chosen = quantity > 0;
                return (
                  <div key={item.id} className={`flex items-center gap-3 rounded-lg border p-2.5 transition ${chosen ? "border-[#f6b73c] bg-[#f6b73c]/[0.08]" : "border-black/8 bg-white hover:border-black/15"}`}>
                    <img loading="lazy" decoding="async" alt={item.name} src={item.imageUrl ?? "/dish-placeholder.webp"} className="h-11 w-11 shrink-0 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#202126]">{item.name}{!item.available ? <span className="ml-2 rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#9a9ca2]">Sold out</span> : null}</p>
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#70727a]">{formatPaise(discountedUnit(item))}{item.discountPercent ? <span className="ml-1.5 text-[#a0a2a8] line-through">{formatPaise(item.pricePaise)}</span> : null}</p>
                    </div>
                    {chosen ? (
                      <div className="flex h-9 items-center rounded-lg bg-[#171713] text-white">
                        <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => stepItem(item.id, -1)} className="grid h-9 w-9 place-items-center transition hover:bg-white/10"><Minus size={13} /></button>
                        <span className="w-6 text-center text-sm font-black tabular-nums">{quantity}</span>
                        <button type="button" aria-label={`Add one ${item.name}`} onClick={() => stepItem(item.id, 1)} className="grid h-9 w-9 place-items-center transition hover:bg-white/10"><Plus size={13} /></button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => addItem(item.id)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-black/12 bg-white px-3 text-sm font-black text-[#202126] transition hover:border-[#f6b73c] hover:bg-[#f6b73c]">Add</button>
                    )}
                  </div>
                );
              }) : (
                <p className="rounded-lg border border-dashed border-black/12 px-3 py-6 text-center text-sm text-[#85878e]">No menu items match.</p>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Live price summary */}
        <SectionCard title="Pricing" bodyClassName="space-y-4" className="lg:sticky lg:top-6 lg:h-fit">
          {distinctCount ? (
            <div className="space-y-1.5">
              <AnimatePresence initial={false}>
                {selectedLines.map((line) => (
                  <motion.div key={line.item.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-[#4e5057]"><span className="font-black tabular-nums">{line.quantity}×</span> {line.item.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-[#202126]">{formatPaise(discountedUnit(line.item) * line.quantity)}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-black/12 px-3 py-6 text-center text-sm text-[#85878e]">Add items to see the bundle value.</p>
          )}

          <div className="flex items-center justify-between border-t border-black/8 pt-3 text-sm">
            <span className="font-bold text-[#4e5057]">Items real total</span>
            <span className="font-black tabular-nums text-[#202126]">{formatPaise(realTotalPaise)}</span>
          </div>

          <label className="block text-sm font-bold text-[#3f4046]">
            Combo price (₹)
            <div className="mt-1.5 flex items-center rounded-lg border border-black/12 bg-white px-3 focus-within:border-[#c65d24] focus-within:ring-2 focus-within:ring-[#c65d24]/10">
              <span className="text-sm font-black text-[#85878e]">₹</span>
              <input inputMode="decimal" value={comboRupees} onChange={(event) => setComboRupees(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="h-11 w-full bg-transparent px-2 text-sm font-black tabular-nums outline-none" />
            </div>
          </label>

          <AnimatePresence mode="wait">
            {comboPaise >= 100 && distinctCount ? (
              priceAboveItems ? (
                <motion.p key="warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-lg bg-[#8a342c]/[0.07] px-3 py-2.5 text-xs font-bold text-[#8a342c]">
                  This price isn&apos;t a saving — it&apos;s at or above the items&apos; real total.
                </motion.p>
              ) : (
                <motion.div key="save" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-between rounded-lg bg-[#34705a]/[0.09] px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-black text-[#2b6e56]"><Sparkles size={15} /> Customer saves</span>
                  <span className="text-sm font-black tabular-nums text-[#2b6e56]">{formatPaise(savingsPaise)} · {savingsPercent}%</span>
                </motion.div>
              )
            ) : null}
          </AnimatePresence>

          <button type="button" disabled={saving} onClick={save} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#171713] px-4 text-sm font-black text-white transition hover:bg-[#c65d24] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Saving…" : editingId ? "Save changes" : "Create combo"}
          </button>
        </SectionCard>
      </div>

      {/* Existing combos */}
      <SectionCard title="Combos" description={combos.length ? `${combos.length} combo${combos.length === 1 ? "" : "s"} — customers see these first.` : undefined}>
        {combos.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {combos.map((combo) => {
              const real = combo.items.reduce((sum, line) => sum + discountedUnit(line.menuItem) * line.quantity, 0);
              const saved = Math.max(0, real - combo.comboPricePaise);
              const savedPct = real > 0 ? Math.round((saved / real) * 100) : 0;
              return (
                <div key={combo.id} className={`flex flex-col rounded-xl border p-4 transition ${combo.active ? "border-black/10 bg-white" : "border-black/8 bg-[#f3f4f6]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black tracking-[-0.02em]">{combo.name}</h3>
                      {!combo.active ? <span className="mt-1 inline-block rounded bg-[#e9e5dd] px-2 py-0.5 text-[10px] font-black uppercase text-[#8a857c]">Hidden</span> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label="Edit combo" onClick={() => loadForEdit(combo)} className="grid h-8 w-8 place-items-center rounded-lg border border-black/10 text-[#4e5057] transition hover:border-black/25"><Pencil size={14} /></button>
                      <button type="button" aria-label="Delete combo" onClick={() => removeCombo(combo)} className="grid h-8 w-8 place-items-center rounded-lg border border-black/10 text-[#8a342c] transition hover:border-[#8a342c]/40 hover:bg-[#8a342c]/5"><Trash2 size={14} /></button>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 text-sm text-[#625b50]">
                    {combo.items.map((line) => (
                      <li key={line.id} className="flex items-center gap-1.5"><span className="font-black tabular-nums text-[#171713]">{line.quantity}×</span> <span className="truncate">{line.menuItem.name}</span></li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-end justify-between border-t border-black/8 pt-3">
                    <div>
                      <p className="text-lg font-black tabular-nums">{formatPaise(combo.comboPricePaise)}</p>
                      {saved > 0 ? <p className="text-xs font-bold text-[#2b6e56]">saves {formatPaise(saved)} · {savedPct}%</p> : <p className="text-xs font-semibold text-[#a0a2a8] tabular-nums">worth {formatPaise(real)}</p>}
                    </div>
                    <button type="button" onClick={() => toggleActive(combo)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition ${combo.active ? "bg-[#34705a]/10 text-[#2b6e56] hover:bg-[#34705a]/20" : "bg-[#f3f4f6] text-[#85878e] hover:bg-black/5"}`}>
                      {combo.active ? <><Check size={13} /> Live</> : "Hidden"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid place-items-center py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f3f4f6]"><Package size={22} /></span>
            <h3 className="mt-4 text-base font-black">No combos yet</h3>
            <p className="mt-1 text-sm text-[#85878e]">Build one above — it&apos;ll show up first for customers.</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
