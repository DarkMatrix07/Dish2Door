// Pure rules for the Activity log filters (no database, no React) so the URL parsing and
// the query they build can be unit-tested. Every value from the address bar is checked
// against an allow-list here before it can reach a Prisma query.
import type { Prisma } from "@prisma/client";
import { AUDIT_GROUPS, actionsInGroup, type AuditGroup } from "@/lib/audit-actions";
import { istDayStartUtc } from "@/lib/ist-day";

export const AUDIT_PAGE_SIZE = 30;

export const AUDIT_RANGES = ["all", "today", "7d", "30d"] as const;
export type AuditRange = (typeof AUDIT_RANGES)[number];

export const AUDIT_RANGE_LABELS: Record<AuditRange, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days"
};

// "unknown" is a sign-in attempt that matched no account, so it has no person.
export const UNKNOWN_WHO = "unknown";

export type AuditSearch = {
  who: string | null;
  group: AuditGroup | null;
  range: AuditRange;
  q: string;
};

export const DEFAULT_AUDIT_SEARCH: AuditSearch = { who: null, group: null, range: "all", q: "" };

const MAX_QUERY_LENGTH = 80;
// User ids are cuids; anything else cannot match a row.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type ParamSource = { get(name: string): string | null | undefined };

export function parseAuditSearch(params: ParamSource): AuditSearch {
  const who = params.get("who");
  const group = params.get("group");
  const range = params.get("range");
  return {
    who: who && ID_PATTERN.test(who) ? who : null,
    group: AUDIT_GROUPS.includes(group as AuditGroup) ? (group as AuditGroup) : null,
    range: AUDIT_RANGES.includes(range as AuditRange) ? (range as AuditRange) : "all",
    q: (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH)
  };
}

// Next hands pages a plain object; a repeated key uses its first value.
export function auditParamsFromRecord(record: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

// Defaults are left out so equal filters always produce the same address.
export function auditSearchToParams(search: AuditSearch) {
  const params: Record<string, string> = {};
  if (search.who) params.who = search.who;
  if (search.group) params.group = search.group;
  if (search.range !== "all") params.range = search.range;
  if (search.q) params.q = search.q;
  return params;
}

// When a date preset starts, as a UTC instant on an IST day boundary. "7d" and "30d" count
// today as one of the days, the same as the Reviews page.
export function auditRangeStart(range: AuditRange, now = new Date()): Date | null {
  if (range === "all") return null;
  return istDayStartUtc(range === "today" ? 0 : range === "7d" ? 6 : 29, now);
}

export function buildAuditWhere(search: AuditSearch, now = new Date()): Prisma.AuditEventWhereInput {
  const clauses: Prisma.AuditEventWhereInput[] = [];
  if (search.who === UNKNOWN_WHO) clauses.push({ actorId: null });
  else if (search.who) clauses.push({ actorId: search.who });
  if (search.group) clauses.push({ action: { in: actionsInGroup(search.group) } });
  const start = auditRangeStart(search.range, now);
  if (start) clauses.push({ createdAt: { gte: start } });
  if (search.q) {
    clauses.push({
      OR: [
        { detail: { contains: search.q, mode: "insensitive" } },
        { targetId: { contains: search.q, mode: "insensitive" } }
      ]
    });
  }
  return clauses.length ? { AND: clauses } : {};
}

// ---- Where a row's target lives ----

// Rows about something that no longer exists have nowhere to link to.
const NO_LINK_ACTIONS = new Set(["menu.restaurant.delete", "menu.course.delete", "menu.item.delete", "menu.combo.delete", "coupon.delete", "delivery.delete"]);

export type AuditLink = { href: string; label: string };

export function auditTargetLink(action: string, targetType: string, targetId: string | null | undefined): AuditLink | null {
  if (NO_LINK_ACTIONS.has(action)) return null;
  switch (targetType) {
    case "order":
      return targetId && /^[A-Za-z0-9]{4,12}$/.test(targetId) ? { href: `/admin/orders/${targetId}`, label: "Open order" } : null;
    case "customer":
      return targetId && /^\d{6,15}$/.test(targetId) ? { href: `/admin/customers/${targetId}`, label: "Open customer" } : null;
    case "restaurant":
      return targetId && ID_PATTERN.test(targetId) ? { href: `/admin/menu/items?restaurant=${encodeURIComponent(targetId)}`, label: "Open menu" } : null;
    case "shop":
      return { href: "/admin/pizza", label: "Open Domino's shop" };
    case "coupon":
      return { href: "/admin/offers/coupons", label: "Open coupons" };
    case "settings":
    case "campus":
      return { href: "/admin/settings", label: "Open settings" };
    default:
      return null;
  }
}
