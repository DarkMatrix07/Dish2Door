// The admin activity log's vocabulary and wording, kept pure (no database, no React) so the
// routes that write the log, the page that reads it and the tests all share one list.
// Writing to the database lives in lib/audit.ts.

export type AuditGroup = "menu" | "coupons" | "orders" | "settings" | "signins";

export const AUDIT_GROUPS: readonly AuditGroup[] = ["menu", "coupons", "orders", "settings", "signins"];

export const AUDIT_GROUP_LABELS: Record<AuditGroup, string> = {
  menu: "Menu",
  coupons: "Coupons & wheel",
  orders: "Orders",
  settings: "Settings",
  signins: "Sign-ins"
};

// Every action the log can hold. Adding one here is all the page needs to show it with a
// readable name and to include it in its group's filter.
export const AUDIT_ACTIONS = {
  "menu.restaurant.create": { label: "Added a restaurant", group: "menu" },
  "menu.restaurant.update": { label: "Edited a restaurant", group: "menu" },
  "menu.restaurant.active": { label: "Switched a restaurant on or off", group: "menu" },
  "menu.restaurant.delete": { label: "Deleted a restaurant", group: "menu" },
  "menu.course.create": { label: "Added a course", group: "menu" },
  "menu.course.update": { label: "Renamed a course", group: "menu" },
  "menu.course.delete": { label: "Deleted a course", group: "menu" },
  "menu.item.create": { label: "Added a menu item", group: "menu" },
  "menu.item.edit": { label: "Edited a menu item", group: "menu" },
  "menu.item.price": { label: "Changed an item's price", group: "menu" },
  "menu.item.discount": { label: "Changed an item's discount", group: "menu" },
  "menu.item.discount.bulk": { label: "Set a discount on several items", group: "menu" },
  "menu.item.stock": { label: "Marked an item in or out of stock", group: "menu" },
  "menu.item.delete": { label: "Deleted a menu item", group: "menu" },
  "menu.combo.create": { label: "Added a combo", group: "menu" },
  "menu.combo.update": { label: "Edited a combo", group: "menu" },
  "menu.combo.active": { label: "Switched a combo on or off", group: "menu" },
  "menu.combo.delete": { label: "Deleted a combo", group: "menu" },
  "menu.image.upload": { label: "Uploaded a menu photo", group: "menu" },
  "coupon.create": { label: "Created a coupon", group: "coupons" },
  "coupon.update": { label: "Edited a coupon", group: "coupons" },
  "coupon.active": { label: "Switched a coupon on or off", group: "coupons" },
  "coupon.delete": { label: "Deleted a coupon", group: "coupons" },
  "wheel.gift": { label: "Gave a customer a wheel coupon", group: "coupons" },
  "wheel.cancel": { label: "Cancelled a customer's wheel prize", group: "coupons" },
  "order.status": { label: "Moved an order forward", group: "orders" },
  "order.cancel": { label: "Cancelled an order", group: "orders" },
  "order.close_quietly": { label: "Closed an old order without messages", group: "orders" },
  "order.reached_bulk": { label: "Marked many orders as reached campus", group: "orders" },
  "order.manual_create": { label: "Created an order by hand", group: "orders" },
  "settings.update": { label: "Changed store settings", group: "settings" },
  "settings.orders_open": { label: "Opened or closed ordering", group: "settings" },
  "settings.notifications": { label: "Changed notification switches", group: "settings" },
  "campus.update": { label: "Changed a campus's fees or switches", group: "settings" },
  "shop.update": { label: "Changed the Domino's shop details", group: "settings" },
  "delivery.create": { label: "Added a delivery person", group: "settings" },
  "delivery.update": { label: "Edited a delivery person", group: "settings" },
  "delivery.password_reset": { label: "Reset a delivery person's password", group: "settings" },
  "delivery.delete": { label: "Deleted a delivery person", group: "settings" },
  "staff.login": { label: "Staff sign-in", group: "signins" }
} as const satisfies Record<string, { label: string; group: AuditGroup }>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

// What the row is about; the page turns it into a link where there is a page to open.
export type AuditTargetType = "order" | "customer" | "restaurant" | "shop" | "coupon" | "settings" | "campus" | "user" | "upload";

// ok: it happened. refused: the server said no to something the admin tried.
// failed: a sign-in that did not work.
export type AuditOutcome = "ok" | "refused" | "failed";

export const AUDIT_OUTCOME_LABELS: Record<AuditOutcome, string> = { ok: "Done", refused: "Refused", failed: "Failed" };

export function isAuditAction(value: string): value is AuditAction {
  return Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, value);
}

// Rows written by a future version may carry an action this page does not know; show it as
// it is rather than hiding the row.
export function auditActionLabel(action: string) {
  return isAuditAction(action) ? AUDIT_ACTIONS[action].label : action;
}

export function auditActionGroup(action: string): AuditGroup | null {
  return isAuditAction(action) ? AUDIT_ACTIONS[action].group : null;
}

export function actionsInGroup(group: AuditGroup): AuditAction[] {
  return (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter((action) => AUDIT_ACTIONS[action].group === group);
}

// ---- Writing a row ----

export const AUDIT_DETAIL_MAX = 1_000;
const TARGET_ID_MAX = 200;

export type AuditEntry = {
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  outcome?: AuditOutcome;
  detail?: string | null;
};

export type AuditRow = {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: AuditOutcome;
  detail: string | null;
};

function clamp(text: string | null | undefined, max: number) {
  const value = text?.trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function clampDetail(detail: string | null | undefined) {
  return clamp(detail, AUDIT_DETAIL_MAX);
}

export function buildAuditRow(entry: AuditEntry): AuditRow {
  return {
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: clamp(entry.targetId, TARGET_ID_MAX),
    outcome: entry.outcome ?? "ok",
    detail: clampDetail(entry.detail)
  };
}

// The log is a record of what happened, never a gate on it: whatever goes wrong while
// writing (database down, the actor's account deleted a moment ago) is reported and
// swallowed so the admin's own action still succeeds.
export async function safeRecord(write: (row: AuditRow) => Promise<unknown>, entry: AuditEntry) {
  try {
    await write(buildAuditRow(entry));
  } catch (error) {
    console.error("[audit] could not record", entry.action, error instanceof Error ? error.message : "unknown error");
  }
}

// ---- Plain-English wording for "before -> after" ----

export function rupees(paise: number) {
  const value = paise / 100;
  const digits = Number.isInteger(value) ? 0 : 2;
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// 150 basis points is 1.5%.
export function bpsPercent(bps: number) {
  return `${bps / 100}%`;
}

// Minutes after midnight, as the clock shows them: 540 -> "9:00 am", 1260 -> "9:00 pm".
export function minuteOfDayLabel(minute: number) {
  const hours = Math.floor(minute / 60) % 24;
  const mins = minute % 60;
  const suffix = hours >= 12 ? "pm" : "am";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function quoted(value: string, max = 40) {
  const flat = value.replace(/\s+/g, " ").trim();
  return `"${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}"`;
}

// First few names, then "and 7 more", so one bulk row stays short however many items.
export function shortList(names: readonly string[], cap = 5) {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= cap) return clean.join(", ");
  return `${clean.slice(0, cap).join(", ")} and ${clean.length - cap} more`;
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export type ChangeKind = "text" | "money" | "percent" | "bps" | "bool" | "minute" | "number" | "changed";
export type ChangeSpec = {
  key: string;
  label: string;
  kind: ChangeKind;
  // What a missing value is called ("no limit", "none").
  empty?: string;
};

function formatValue(kind: ChangeKind, value: unknown, empty: string) {
  if (value === null || value === undefined || value === "") return empty;
  switch (kind) {
    case "money":
      return rupees(Number(value));
    case "percent":
      return `${Number(value)}%`;
    case "bps":
      return bpsPercent(Number(value));
    case "bool":
      return value ? "yes" : "no";
    case "minute":
      return minuteOfDayLabel(Number(value));
    case "number":
      return String(value);
    default:
      return quoted(String(value));
  }
}

// Compares only the listed fields and says what moved, e.g. `price ₹189 → ₹199`. Fields
// left undefined in `after` were not part of the update. "changed" fields (long texts,
// image links) are named without their values so the log stays short and readable.
export function describeChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  specs: readonly ChangeSpec[]
): string[] {
  const changes: string[] = [];
  for (const spec of specs) {
    const next = after[spec.key];
    if (next === undefined) continue;
    const previous = before ? before[spec.key] : undefined;
    const normalise = (value: unknown) => (value === undefined || value === "" ? null : value);
    if (before && normalise(previous) === normalise(next)) continue;
    if (spec.kind === "changed") {
      changes.push(`${spec.label} changed`);
      continue;
    }
    const empty = spec.empty ?? "none";
    changes.push(
      before
        ? `${spec.label} ${formatValue(spec.kind, previous, empty)} → ${formatValue(spec.kind, next, empty)}`
        : `${spec.label} set to ${formatValue(spec.kind, next, empty)}`
    );
  }
  return changes;
}

// "Paneer Tikka: price ₹189 → ₹199". No changes means nothing worth a row.
export function summariseChanges(subject: string, changes: readonly string[]) {
  return changes.length ? `${subject}: ${changes.join(", ")}` : null;
}
