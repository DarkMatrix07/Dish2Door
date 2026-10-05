// Pure helpers for the shared Dropdown, kept out of the component so the filtering,
// keyboard movement and panel placement can be tested without a browser.

export type DropdownBadgeTone = "amber" | "red" | "green" | "neutral";

export type DropdownOption = {
  value: string;
  label: string;
  // Muted second line under the label.
  description?: string;
  // Only used when the option is shown on the closed button; falls back to description.
  selectedDescription?: string;
  // A photo tile. Leave it out entirely for plain text options; pass null when there is no
  // photo yet and an initial-letter tile should stand in.
  imageUrl?: string | null;
  // Small pill right after the label, on the closed button and in the list.
  badge?: { text: string; tone: DropdownBadgeTone };
  // Small pill at the right edge of a list row only.
  endBadge?: { text: string; tone: DropdownBadgeTone };
  disabled?: boolean;
};

// Lists longer than this get a search box unless the caller says otherwise.
export const SEARCH_THRESHOLD = 7;

export function shouldSearch(optionCount: number, searchable?: boolean) {
  return searchable ?? optionCount > SEARCH_THRESHOLD;
}

export function filterByText<T>(list: T[], query: string, textOf: (entry: T) => string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((entry) => textOf(entry).toLowerCase().includes(needle));
}

export function optionInitial(label: string) {
  const first = label.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

// Moves the highlighted row, wrapping at both ends and skipping disabled rows. With nothing
// to land on there is no row.
export function moveActiveIndex(current: number, delta: number, length: number, isDisabled?: (index: number) => boolean) {
  if (length <= 0) return -1;
  const step = delta < 0 ? -1 : 1;
  let index = current < 0 || current >= length ? (step < 0 ? length : -1) : current;
  for (let tries = 0; tries < length; tries += 1) {
    index = (index + step + length) % length;
    if (!isDisabled?.(index)) return index;
  }
  return -1;
}

// First or last row that can be picked, for Home and End.
export function edgeIndex(length: number, edge: "first" | "last", isDisabled?: (index: number) => boolean) {
  for (let tries = 0; tries < length; tries += 1) {
    const index = edge === "first" ? tries : length - 1 - tries;
    if (!isDisabled?.(index)) return index;
  }
  return -1;
}

// Where the highlight starts when the list opens: on the chosen option if it can be picked,
// otherwise the first one that can.
export function initialActiveIndex(list: { value: string; disabled?: boolean }[], selectedValue: string | null | undefined) {
  const found = list.findIndex((entry) => entry.value === selectedValue);
  if (found >= 0 && !list[found].disabled) return found;
  return edgeIndex(list.length, "first", (index) => Boolean(list[index].disabled));
}

export type PanelPlacement = {
  left: number;
  width: number;
  // Exactly one of top and bottom is set: the panel hangs below the button or sits above it.
  top: number | null;
  bottom: number | null;
  // Tallest the scrolling list may be in the room that is left.
  listMax: number;
};

const LIST_MIN = 120;
export const LIST_MAX = 320;

// Works out where the desktop panel goes (it is fixed to the viewport, so no parent can clip
// it): under the button when it fits, above it when there is clearly more room there, and
// pulled back inside the screen at the sides.
export function placePanel(input: {
  rect: { top: number; bottom: number; left: number; width: number };
  viewport: { width: number; height: number };
  // Height taken up by everything except the list (search box and padding).
  extraHeight: number;
  // How tall the list would like to be with every row showing, capped at LIST_MAX.
  listWanted: number;
  minWidth?: number;
  gap?: number;
  margin?: number;
}): PanelPlacement {
  const { rect, viewport, extraHeight, listWanted, minWidth = 176, gap = 8, margin = 12 } = input;
  const width = Math.min(Math.max(rect.width, minWidth), Math.max(0, viewport.width - margin * 2));
  const left = Math.max(margin, Math.min(rect.left, viewport.width - margin - width));

  const below = viewport.height - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;
  const needed = Math.min(listWanted, LIST_MAX) + extraHeight;
  const openUp = below < needed && above > below;
  const room = openUp ? above : below;

  return {
    left,
    width,
    top: openUp ? null : rect.bottom + gap,
    bottom: openUp ? viewport.height - rect.top + gap : null,
    listMax: Math.max(LIST_MIN, Math.min(LIST_MAX, room - extraHeight))
  };
}

export function samePlacement(a: PanelPlacement | null, b: PanelPlacement | null) {
  if (!a || !b) return a === b;
  return a.left === b.left && a.width === b.width && a.top === b.top && a.bottom === b.bottom && a.listMax === b.listMax;
}
