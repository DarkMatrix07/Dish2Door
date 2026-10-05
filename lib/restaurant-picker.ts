// Pure helpers for the admin restaurant picker. The picker is a thin wrapper around the
// shared Dropdown, so the search and keyboard behaviour lives in lib/dropdown.ts.

import {
  filterByText,
  initialActiveIndex as initialDropdownIndex,
  moveActiveIndex,
  optionInitial,
  type DropdownOption
} from "./dropdown";

export { moveActiveIndex };

export type PickerRestaurant = {
  id: string;
  name: string;
  imageUrl?: string | null;
  itemCount: number;
  soldOutCount?: number;
  active?: boolean;
  // Replaces the default "N items" line, e.g. "2 combos · 14 items" on the Combos page.
  summary?: string;
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function filterRestaurants<T extends { name: string }>(list: T[], query: string): T[] {
  return filterByText(list, query, (entry) => entry.name);
}

// "73 items", with ", 2 sold out" when the caller wants it inline (the closed button).
export function restaurantCountsLine(restaurant: PickerRestaurant, includeSoldOut: boolean) {
  const base = restaurant.summary ?? plural(restaurant.itemCount, "item");
  const soldOut = restaurant.soldOutCount ?? 0;
  return includeSoldOut && soldOut > 0 ? `${base} · ${soldOut} sold out` : base;
}

export const restaurantInitial = optionInitial;

// Where the highlight starts when the list opens: on the chosen restaurant if it is shown.
export function initialActiveIndex<T extends { id: string }>(list: T[], selectedId: string | null | undefined) {
  return initialDropdownIndex(
    list.map((entry) => ({ value: entry.id })),
    selectedId
  );
}

// A restaurant as a dropdown row. imageUrl is always passed (null when there is no photo) so
// every row gets a tile.
export function restaurantToOption(restaurant: PickerRestaurant): DropdownOption {
  const soldOut = restaurant.soldOutCount ?? 0;
  return {
    value: restaurant.id,
    label: restaurant.name,
    imageUrl: restaurant.imageUrl ?? null,
    description: restaurantCountsLine(restaurant, false),
    selectedDescription: restaurantCountsLine(restaurant, true),
    badge: restaurant.active === false ? { text: "Switched off", tone: "red" } : undefined,
    endBadge: soldOut > 0 ? { text: `Sold out: ${soldOut}`, tone: "amber" } : undefined
  };
}
