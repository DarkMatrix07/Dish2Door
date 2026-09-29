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
