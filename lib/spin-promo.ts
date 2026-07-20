import { prisma } from "@/lib/db";
import { getIndiaMinutes } from "@/lib/order-slots";
import { DEFAULT_SETTINGS_ID, getSettings } from "@/lib/settings";
import { everyoneModeUntilDay, getIndiaSpinDay, shouldRevertEveryoneMode } from "@/lib/spin-wheel";

// Stamp for a promo being switched on now. Thin wrapper so callers don't have to know
// about IST minute conversion; the rule itself lives in lib/spin-wheel.ts.
export function promoUntilDayFromNow(closeMinute: number, now = new Date()) {
  return everyoneModeUntilDay(closeMinute, getIndiaMinutes(now), now);
}

// Called from the background interval. Ends the "wheel for everyone" promo once the
// ordering window closes on its day, so it can never be left on by accident.
export async function revertExpiredEveryoneMode(now = new Date()) {
  const settings = await getSettings();
  const revert = shouldRevertEveryoneMode({
    forEveryone: settings.spinWheelForEveryone,
    untilDay: settings.spinWheelEveryoneUntilDay,
    today: getIndiaSpinDay(now),
    nowMinute: getIndiaMinutes(now),
    closeMinute: settings.orderingCloseMinute
  });
  if (!revert) return false;

  await prisma.systemSettings.update({
    where: { id: DEFAULT_SETTINGS_ID },
    data: { spinWheelForEveryone: false, spinWheelEveryoneUntilDay: null }
  });
  console.info("[spin] everyone-mode promo ended; reverted to regulars-only");
  return true;
}
