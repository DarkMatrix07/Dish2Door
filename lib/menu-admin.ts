// The rules behind the main-store menu screens (Restaurants, Items, Combos), kept pure
// (no database, no React) so the API and the browser share them and they can be tested.

export const MAIN_STORE_MODE = "ONLINE_PAYMENT";
export const DOMINOS_MODE = "WHATSAPP";

export const DOMINOS_MANAGED_MESSAGE = "Domino's is managed from the Domino's Pizza section.";

// The same limits item.update has always allowed.
export const MAX_DISCOUNT_PERCENT = 90;
export const MIN_PRICE_PAISE = 100;
export const MAX_BULK_ITEMS = 500;

export function isMainStoreMode(orderMode: string) {
  return orderMode === MAIN_STORE_MODE;
}

// Never delete a restaurant that has taken orders: that would wipe the order history.
// Returns the reason to refuse, or null when there is nothing to protect.
export function restaurantDeleteBlock(orderCount: number): string | null {
  if (orderCount <= 0) return null;
  return `This restaurant has ${orderCount} past order${orderCount === 1 ? "" : "s"}. Switch it off instead so its history stays.`;
}

// ---- Which record does an API request touch? ----

export type MenuTarget =
  | { kind: "restaurant"; id: string }
  | { kind: "course"; id: string }
  | { kind: "item"; id: string }
  | { kind: "combo"; id: string };

// Every mutation names the row it changes, directly or through its parent. Resolving that
// to one (kind, id) lets the server look up the restaurant and refuse a Domino's target.
// Actions that don't touch a restaurant's menu (coupons, the bulk discount, which
// filters by restaurant itself) return null.
export function menuTargetOf(body: { action: string } & Record<string, unknown>): MenuTarget | null {
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : null);
  const build = (kind: MenuTarget["kind"], key: string): MenuTarget | null => {
    const id = str(key);
    return id ? { kind, id } : null;
  };
  switch (body.action) {
    case "restaurant.update":
    case "restaurant.delete":
    case "restaurant.active":
      return build("restaurant", "id");
    case "course.create":
    case "course.reorder":
    case "item.create":
    case "combo.create":
      return build("restaurant", "restaurantId");
    case "course.update":
    case "course.delete":
      return build("course", "id");
    case "item.update":
    case "item.stock":
    case "item.delete":
      return build("item", "id");
    case "combo.update":
    case "combo.active":
    case "combo.delete":
      return build("combo", "id");
    default:
      return null;
  }
}

// ---- Sized dishes ----

export type DishItem = {
  id: string;
  name: string;
  courseId: string;
  available: boolean;
  discountPercent: number;
  pricePaise: number;
  sizeLabel: string | null;
  sizeOrder: number;
};

export type DishGroup<T extends DishItem> = {
  key: string;
  name: string;
  courseId: string;
  // Sorted by sizeOrder, then price.
  items: T[];
  // Several sizes but at least one has no label: the owner can't tell the rows apart.
  needsSizeLabels: boolean;
};

export function dishKey(item: Pick<DishItem, "courseId" | "name">) {
  // Exactly what the storefront uses, so the admin shows the same dishes customers see.
  return `${item.courseId}::${item.name}`;
}

export function needsSizeLabels(items: Pick<DishItem, "sizeLabel">[]) {
  return items.length > 1 && items.some((item) => !item.sizeLabel?.trim());
}

// Items sharing a name within a course are one dish with several sizes. Groups follow the
// course order (courseOrder = course ids in menu order), then the dish name.
export function groupDishes<T extends DishItem>(items: T[], courseOrder: string[] = []): DishGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = dishKey(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  const rank = new Map(courseOrder.map((id, index) => [id, index]));
  const courseRank = (courseId: string) => rank.get(courseId) ?? Number.MAX_SAFE_INTEGER;

  return Array.from(map.entries())
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => a.sizeOrder - b.sizeOrder || a.pricePaise - b.pricePaise);
      return { key, name: sorted[0].name, courseId: sorted[0].courseId, items: sorted, needsSizeLabels: needsSizeLabels(sorted) };
    })
    .sort((a, b) => courseRank(a.courseId) - courseRank(b.courseId) || a.name.localeCompare(b.name));
}

export type ItemFilter = "all" | "soldOut" | "discounted";

export function matchesItemFilter(item: Pick<DishItem, "available" | "discountPercent">, filter: ItemFilter) {
  if (filter === "soldOut") return !item.available;
  if (filter === "discounted") return item.discountPercent > 0;
  return true;
}

// Search matches the dish name; the filter keeps only the sizes that match, so a dish
// with one sold-out size shows just that size under "Sold out". The size-label warning
// still reflects the whole dish, not the filtered view.
export function filterDishGroups<T extends DishItem>(groups: DishGroup<T>[], options: { query: string; filter: ItemFilter }): DishGroup<T>[] {
  const query = options.query.trim().toLowerCase();
  const result: DishGroup<T>[] = [];
  for (const group of groups) {
    if (query && !group.name.toLowerCase().includes(query)) continue;
    const items = group.items.filter((item) => matchesItemFilter(item, options.filter));
    if (items.length) result.push({ ...group, items });
  }
  return result;
}

export function countItems(items: Pick<DishItem, "available" | "discountPercent">[]) {
  return {
    total: items.length,
    soldOut: items.filter((item) => !item.available).length,
    discounted: items.filter((item) => item.discountPercent > 0).length
  };
}

// ---- Keeping the page's list in step with what the server just saved ----

// Replaces the row with the saved one (keeping any extra fields the response left out),
// or adds it when it's new.
export function upsertById<T extends { id: string }>(rows: T[], saved: T): T[] {
  return rows.some((row) => row.id === saved.id) ? rows.map((row) => (row.id === saved.id ? { ...row, ...saved } : row)) : [...rows, saved];
}

export function upsertManyById<T extends { id: string }>(rows: T[], saved: T[]): T[] {
  return saved.reduce((list, row) => upsertById(list, row), rows);
}

export function removeById<T extends { id: string }>(rows: T[], id: string): T[] {
  return rows.filter((row) => row.id !== id);
}

// Puts rows in the order of `orderedIds`; rows not named keep their place at the end.
export function reorderByIds<T extends { id: string }>(rows: T[], orderedIds: string[]): T[] {
  const position = new Map(orderedIds.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

// ---- Form input ----

export type ParsedNumber = { ok: true; value: number } | { ok: false; error: string };

// "10" -> 10. Whole numbers from 0 to 90 only; blank means no discount.
export function parseDiscountPercent(text: string): ParsedNumber {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: 0 };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: `Discount must be a whole number between 0 and ${MAX_DISCOUNT_PERCENT}.` };
  const value = Number(trimmed);
  if (value > MAX_DISCOUNT_PERCENT) return { ok: false, error: `Discount can be at most ${MAX_DISCOUNT_PERCENT}%.` };
  return { ok: true, value };
}

// Rupees typed by the owner ("249", "249.50") to paise. Rejects blanks, junk and anything
// under the ₹1 minimum the API accepts.
export function parsePricePaise(text: string): ParsedNumber {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, error: "Enter the price in rupees, like 249 or 249.50." };
  const paise = Math.round(Number(trimmed) * 100);
  if (paise < MIN_PRICE_PAISE) return { ok: false, error: "The price must be at least ₹1." };
  return { ok: true, value: paise };
}

// Size order is only used to sort the sizes of one dish; blank means "first".
export function parseSizeOrder(text: string): number {
  const value = Math.trunc(Number(text.trim() || 0));
  return Number.isFinite(value) ? value : 0;
}

// The restaurant named in ?restaurant=, but only if it's one of the restaurants on this
// page (so a stale link or a Domino's id falls back to the default choice).
export function pickRestaurantId(requested: string | null | undefined, restaurantIds: string[]): string | null {
  if (requested && restaurantIds.includes(requested)) return requested;
  return restaurantIds[0] ?? null;
}

// Ids in the shape the database uses. Stops stray text from reaching a query.
export function isPlausibleId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
