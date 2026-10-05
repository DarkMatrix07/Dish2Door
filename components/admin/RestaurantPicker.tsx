"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  filterRestaurants,
  initialActiveIndex,
  moveActiveIndex,
  restaurantCountsLine,
  restaurantInitial,
  type PickerRestaurant
} from "@/lib/restaurant-picker";
import { cn } from "@/lib/utils";

export type { PickerRestaurant };

// A neutral initial-letter tile stands in when there is no photo or the photo fails to load.
function Thumb({ restaurant, className }: { restaurant: PickerRestaurant; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = restaurant.imageUrl;
  const showImage = Boolean(url) && failedUrl !== url;
  return (
    <span className={cn("grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-neutral-100 text-sm font-bold text-neutral-500", className)} aria-hidden="true">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnails come from uploads/external URLs of any size
        <img src={url ?? ""} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFailedUrl(url ?? null)} />
      ) : (
        restaurantInitial(restaurant.name)
      )}
    </span>
  );
}

export function RestaurantPicker({
  restaurants,
  value,
  onChange,
  label,
  className
}: {
  restaurants: PickerRestaurant[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-list`;
  const optionId = (id: string) => `${baseId}-opt-${id}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = restaurants.find((entry) => entry.id === value) ?? null;
  const shown = useMemo(() => filterRestaurants(restaurants, query), [restaurants, query]);
  const activeId = shown[activeIndex]?.id;

  function openPicker() {
    setQuery("");
    setActiveIndex(initialActiveIndex(restaurants, value));
    setOpen(true);
  }

  function closePicker(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function pick(id: string) {
    // Re-picking the current restaurant should not reset the page's filters.
    if (id !== value) onChange(id);
    closePicker(true);
  }

  // Closing on a press outside (not on focus loss) so dragging the list's scrollbar is safe.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(optionId(activeId))?.scrollIntoView({ block: "nearest" });
    // optionId only depends on baseId, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeId]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openPicker();
    }
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => moveActiveIndex(current, 1, shown.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => moveActiveIndex(current, -1, shown.length));
        break;
      case "Home":
        if (shown.length) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (shown.length) {
          event.preventDefault();
          setActiveIndex(shown.length - 1);
        }
        break;
      case "Enter":
        event.preventDefault();
        if (activeId) pick(activeId);
        break;
      case "Escape":
        event.preventDefault();
        // Stops an enclosing dialog from also closing on the same key press.
        event.stopPropagation();
        closePicker(true);
        break;
      case "Tab":
        // Hand focus back to the button first so Tab continues from there.
        closePicker(true);
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("relative w-full max-w-lg", className)}>
      {label ? (
        <span id={labelId} className="mb-1 block text-xs font-semibold text-neutral-500">
          {label}
        </span>
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={label ? labelId : undefined}
        onClick={() => (open ? closePicker(false) : openPicker())}
        onKeyDown={onButtonKeyDown}
        className={cn(
          "flex min-h-[52px] w-full items-center gap-3 rounded-xl border bg-white px-3 py-2 text-left shadow-sm outline-none transition focus-visible:ring-4 focus-visible:ring-amber-200",
          open ? "border-neutral-950" : "border-neutral-300 hover:border-neutral-400"
        )}
      >
        {selected ? (
          <>
            <Thumb restaurant={selected} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-neutral-950">{selected.name}</span>
                {selected.active === false ? <Badge tone="red" className="shrink-0 px-2 py-0.5">Switched off</Badge> : null}
              </span>
              <span className="block truncate text-xs text-neutral-500">{restaurantCountsLine(selected, true)}</span>
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-neutral-500">Choose a restaurant</span>
        )}
        <ChevronDown size={18} className={cn("shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? (
        <>
          {/* Phones: dim the page behind the bottom sheet; tapping it closes the sheet. */}
          <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" aria-hidden="true" onClick={() => closePicker(false)} />
          <div
            className={cn(
              "z-50 flex flex-col overflow-hidden bg-white shadow-[0_18px_50px_rgba(23,23,19,0.22)]",
              "fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl",
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-full sm:rounded-xl sm:border sm:border-neutral-200"
            )}
          >
            <div className="border-b border-neutral-100 p-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeId ? optionId(activeId) : undefined}
                  aria-label="Search restaurants"
                  placeholder="Search restaurants"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    // The top match is highlighted so Enter picks it straight away.
                    setActiveIndex(filterRestaurants(restaurants, event.target.value).length ? 0 : -1);
                  }}
                  onKeyDown={onSearchKeyDown}
                  className="h-11 w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-3 text-base outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-amber-200 sm:text-sm"
                />
              </div>
            </div>

            <ul
              id={listId}
              role="listbox"
              aria-label={label ?? "Restaurants"}
              // Keeps the search box focused while a row or the scrollbar is pressed.
              onMouseDown={(event) => event.preventDefault()}
              className="admin-scrollbar max-h-[60dvh] overflow-y-auto overscroll-contain p-1.5 sm:max-h-80"
            >
              {shown.length ? (
                shown.map((entry, index) => {
                  const isSelected = entry.id === value;
                  const soldOut = entry.soldOutCount ?? 0;
                  return (
                    <li
                      key={entry.id}
                      id={optionId(entry.id)}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => pick(entry.id)}
                      onMouseMove={() => index !== activeIndex && setActiveIndex(index)}
                      className={cn(
                        "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5",
                        index === activeIndex ? "bg-amber-50" : "bg-white",
                        isSelected && "ring-1 ring-inset ring-[#f6b73c]"
                      )}
                    >
                      <Thumb restaurant={entry} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-neutral-950">{entry.name}</span>
                          {entry.active === false ? <Badge tone="red" className="shrink-0 px-2 py-0.5">Switched off</Badge> : null}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">{restaurantCountsLine(entry, false)}</span>
                      </span>
                      {soldOut > 0 ? <Badge tone="amber" className="shrink-0 px-2 py-0.5">Sold out: {soldOut}</Badge> : null}
                      <Check size={16} className={cn("shrink-0 text-neutral-950", !isSelected && "invisible")} aria-hidden="true" />
                    </li>
                  );
                })
              ) : (
                <li role="presentation" className="px-3 py-8 text-center text-sm text-neutral-500">
                  No restaurant matches
                </li>
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
