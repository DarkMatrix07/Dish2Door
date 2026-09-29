import { calculateTotals } from "./money";

// Pure helpers behind the admin Settings page: what counts as "unsaved", what a section is
// allowed to send, and how typed money/time text becomes stored numbers.

// The store-wide settings row as the settings API returns it. The fee fields are legacy:
// campuses price orders now, but the API still requires them, so they are carried through
// untouched and never shown.
export type Settings = {
  ordersOpen: boolean;
  closedMessage: string;
  contactNumber: string;
  platformFeePaise: number;
  hostelDeliveryFeePaise: number;
  paymentChargePercentBps: number;
  paymentChargeFixedPaise: number;
  orderingOpenMinute: number;
  orderingCloseMinute: number;
  spinWheelForEveryone: boolean;
};

// The API answers with the whole database row; only these fields belong on the page.
export const SETTINGS_KEYS = [
  "ordersOpen",
  "closedMessage",
  "contactNumber",
  "platformFeePaise",
  "hostelDeliveryFeePaise",
  "paymentChargePercentBps",
  "paymentChargeFixedPaise",
  "orderingOpenMinute",
  "orderingCloseMinute",
  "spinWheelForEveryone"
] as const satisfies readonly (keyof Settings)[];

export const ORDERING_FIELDS = ["ordersOpen", "orderingOpenMinute", "orderingCloseMinute", "closedMessage", "contactNumber"] as const;
export const WHEEL_FIELDS = ["spinWheelForEveryone"] as const;

type Keys = readonly (keyof Settings)[];

function pick<T extends object>(source: T, keys: readonly (keyof T)[]) {
  const out: Partial<T> = {};
  for (const key of keys) out[key] = source[key];
  return out;
}

export function pickSettings(row: Settings): Settings {
  return pick(row, SETTINGS_KEYS) as Settings;
}

export function isSectionDirty(saved: Settings, draft: Settings, keys: Keys) {
  return keys.some((key) => saved[key] !== draft[key]);
}

// Each section saves on its own, so it starts from what is already saved and overlays only
// its own fields. Edits waiting unsaved in another section are never sent by accident.
export function buildSettingsPayload(saved: Settings, draft: Settings, keys: Keys): Settings {
  return { ...saved, ...pick(draft, keys) };
}

// After a save, the server's answer replaces only the saved section's fields in the draft so
// half-typed edits elsewhere on the page survive.
export function mergeSavedSection(draft: Settings, serverSettings: Settings, keys: Keys): Settings {
  return { ...draft, ...pick(serverSettings, keys) };
}

export function minutesToTimeInput(minutes: number) {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

// null for an empty or malformed value (a cleared time box), so callers can ignore it
// instead of silently turning "nothing" into midnight.
export function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// These mirror the settings API's limits, so a mistake is explained here in plain words
// rather than as a raw validation error after pressing Save.
export function validateOrdering(draft: Pick<Settings, "closedMessage" | "contactNumber" | "orderingOpenMinute" | "orderingCloseMinute">): string | null {
  if (draft.orderingOpenMinute >= draft.orderingCloseMinute) {
    return "Ordering must open earlier in the day than it closes. Ordering cannot run past midnight.";
  }
  const message = draft.closedMessage.trim();
  if (message.length < 5) return "The closed message needs at least 5 characters.";
  if (message.length > 240) return "The closed message can be at most 240 characters.";
  const contact = draft.contactNumber.trim();
  if (contact.length < 3) return "Add a contact number customers can reach you on.";
  if (contact.length > 40) return "The contact number can be at most 40 characters.";
  return null;
}

// ---- Campuses -------------------------------------------------------------------------

export type CampusForm = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  platformFeePaise: number;
  hostelDeliveryFeePaise: number;
  hostelDeliveryEnabled: boolean;
  hostelDeliveryNightOnly: boolean;
  paymentChargePercentBps: number;
  paymentChargeFixedPaise: number;
  orderCount: number;
};

export const CAMPUS_SAVE_FIELDS = [
  "name",
  "active",
  "platformFeePaise",
  "hostelDeliveryFeePaise",
  "hostelDeliveryEnabled",
  "hostelDeliveryNightOnly",
  "paymentChargePercentBps",
  "paymentChargeFixedPaise"
] as const;

export function isCampusDirty(saved: CampusForm, draft: CampusForm) {
  return CAMPUS_SAVE_FIELDS.some((key) => saved[key] !== draft[key]);
}

// The number boxes hold what the admin is typing, so "1." or "12.5" survive between
// keystrokes; only a valid amount becomes paise/bps. Null means "not a valid amount yet".
export function parseDecimalToUnits(text: string, unitsPerWhole: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed) && !/^\.\d{1,2}$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * unitsPerWhole);
}

export const parseRupeesToPaise = (text: string) => parseDecimalToUnits(text, 100);
export const parsePercentToBps = (text: string) => parseDecimalToUnits(text, 100);

export function unitsToDecimalText(units: number) {
  return String(units / 100);
}

// Same ceilings the campus API enforces.
export const CAMPUS_LIMITS = { feePaise: 100_000, percentBps: 1_000 } as const;

// What is typed in a campus card: the switches plus the three number boxes as text.
export type CampusDraft = Pick<CampusForm, "active" | "hostelDeliveryEnabled" | "hostelDeliveryNightOnly"> & {
  platformFee: string;
  hostelDeliveryFee: string;
  paymentPercent: string;
};

export type CampusProblems = Partial<Record<"platformFee" | "hostelDeliveryFee" | "paymentPercent", string>>;

export function draftFromCampus(campus: CampusForm): CampusDraft {
  return {
    active: campus.active,
    hostelDeliveryEnabled: campus.hostelDeliveryEnabled,
    hostelDeliveryNightOnly: campus.hostelDeliveryNightOnly,
    platformFee: unitsToDecimalText(campus.platformFeePaise),
    hostelDeliveryFee: unitsToDecimalText(campus.hostelDeliveryFeePaise),
    paymentPercent: unitsToDecimalText(campus.paymentChargePercentBps)
  };
}

// Turns the typed draft into the campus that would be saved. A box that is not a valid
// amount keeps its saved value in the result and is reported in problems instead, so the
// preview and the dirty check never run on garbage.
export function campusFromDraft(saved: CampusForm, draft: CampusDraft): { campus: CampusForm; problems: CampusProblems } {
  const problems: CampusProblems = {};
  const amount = (text: string, fallback: number, key: keyof CampusProblems, limit: number, limitText: string) => {
    const value = parseDecimalToUnits(text, 100);
    if (value === null) {
      problems[key] = "Enter a number such as 2 or 2.50.";
      return fallback;
    }
    if (value > limit) {
      problems[key] = `This can be at most ${limitText}.`;
      return fallback;
    }
    return value;
  };
  const campus: CampusForm = {
    ...saved,
    active: draft.active,
    hostelDeliveryEnabled: draft.hostelDeliveryEnabled,
    hostelDeliveryNightOnly: draft.hostelDeliveryNightOnly,
    platformFeePaise: amount(draft.platformFee, saved.platformFeePaise, "platformFee", CAMPUS_LIMITS.feePaise, "₹1,000"),
    hostelDeliveryFeePaise: amount(draft.hostelDeliveryFee, saved.hostelDeliveryFeePaise, "hostelDeliveryFee", CAMPUS_LIMITS.feePaise, "₹1,000"),
    paymentChargePercentBps: amount(draft.paymentPercent, saved.paymentChargePercentBps, "paymentPercent", CAMPUS_LIMITS.percentBps, "10%")
  };
  return { campus, problems };
}

// A card holds unsaved changes when its numbers or switches differ from what is saved,
// or when a box holds text that is not a usable amount yet.
export function isCampusDraftDirty(saved: CampusForm, draft: CampusDraft) {
  const { campus, problems } = campusFromDraft(saved, draft);
  return isCampusDirty(saved, campus) || Object.keys(problems).length > 0;
}

// What a ₹200 gate-pickup order costs the customer here, via the same calculator checkout uses.
export function sampleOrderTotalPaise(campus: Pick<CampusForm, "platformFeePaise" | "hostelDeliveryFeePaise" | "paymentChargePercentBps" | "paymentChargeFixedPaise">) {
  return calculateTotals(20_000, "GATE", campus, true).totalPaise;
}
