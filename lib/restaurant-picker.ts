// Pure helpers for the admin restaurant picker, kept out of the component so the
// filtering and keyboard behaviour can be tested without a browser.

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
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((entry) => entry.name.toLowerCase().includes(needle));
}

// "73 items", with ", 2 sold out" when the caller wants it inline (the closed button).
export function restaurantCountsLine(restaurant: PickerRestaurant, includeSoldOut: boolean) {
  const base = restaurant.summary ?? plural(restaurant.itemCount, "item");
  const soldOut = restaurant.soldOutCount ?? 0;
  return includeSoldOut && soldOut > 0 ? `${base} · ${soldOut} sold out` : base;
}

export function restaurantInitial(name: string) {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

// Moves the highlighted row, wrapping at both ends. With nothing to show there is no row.
export function moveActiveIndex(current: number, delta: number, length: number) {
  if (length <= 0) return -1;
  if (current < 0 || current >= length) return delta < 0 ? length - 1 : 0;
  return (current + delta + length) % length;
}

// Where the highlight starts when the list opens: on the chosen restaurant if it is shown.
export function initialActiveIndex<T extends { id: string }>(list: T[], selectedId: string | null | undefined) {
  if (!list.length) return -1;
  const found = list.findIndex((entry) => entry.id === selectedId);
  return found >= 0 ? found : 0;
}
