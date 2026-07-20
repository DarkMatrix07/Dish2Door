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
