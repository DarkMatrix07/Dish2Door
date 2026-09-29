// India runs at a fixed UTC+05:30 with no daylight saving, so IST day boundaries are a
// simple offset. Shared by the admin reporting pages so "today" means the same thing
// everywhere.
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istDayKey(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// UTC instant at which the IST day `daysAgo` days back began.
export function istDayStartUtc(daysAgo = 0, now = new Date()) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() - daysAgo) - IST_OFFSET_MS
  );
}

// Start and end of today in IST as UTC instants for a createdAt filter, plus a
// human label such as "Tuesday, 29 September 2026".
export function istTodayRange(now = new Date()) {
  const start = istDayStartUtc(0, now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const label = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(start);
  return { start, end, label };
}

export function formatIstDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

// Turns a yyyy-mm-dd calendar day, as an admin picks it, into the UTC instant that IST
// day begins. Parsing it in the server's own timezone (UTC on the VPS) would shift every
// range by five and a half hours. Returns undefined for anything that is not a real day:
// Date quietly rolls 2026-02-31 over to March, so the value must round-trip unchanged.
export function parseIstDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const utc = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) return undefined;
  return new Date(utc.getTime() - IST_OFFSET_MS);
}

// Clock time only, such as "2:15 pm", for lists that already say which day they cover.
export function formatIstTime(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

// Full IST timestamp for detail views, such as "29 Sep 2026, 2:15 pm".
export function formatIstFull(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

// Compact gap between two instants: "under a minute", "45m", "2h 10m", "1d 3h".
export function formatElapsed(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

// How long ago something happened, measured from now: "just now", "42m ago", "3h 5m ago",
// "3d ago". Days drop the hours since a count of days is all that matters that far back.
export function formatAgo(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m ago` : `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
