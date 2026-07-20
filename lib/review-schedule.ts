// Pure scheduling rules for review-reminder emails. Kept free of database imports so
// the timing logic stays unit-testable; the sending job lives in lib/review-reminders.ts.

// How long after delivery each reminder goes out. Three reminders, all inside the two
// days after delivery — plus the delivered notification itself, that is four total
// emails about one order, which is as far as this should ever go. Chasing harder trains
// people to mark the sender as spam, and these share a sending reputation with the
// order/passcode emails customers actually need.
export const REVIEW_REMINDER_OFFSETS_MS = [
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  44 * 60 * 60 * 1000
];

// Only orders delivered inside this window are ever considered. This is what stops the
// first run from emailing every historically unrated order at once.
export const REVIEW_REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

// Which reminder (if any) is due for an order right now, given how many have already
// been sent. Returns null when it is too early or the order has had its full quota.
export function dueReminderIndex(deliveredAt: Date, alreadySent: number, now: Date) {
  if (alreadySent >= REVIEW_REMINDER_OFFSETS_MS.length) return null;
  if (now.getTime() - deliveredAt.getTime() > REVIEW_REMINDER_WINDOW_MS) return null;
  const dueAt = deliveredAt.getTime() + REVIEW_REMINDER_OFFSETS_MS[alreadySent];
  return now.getTime() >= dueAt ? alreadySent : null;
}
