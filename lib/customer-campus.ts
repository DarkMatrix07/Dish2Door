// Client-safe campus shape. Lives here (not lib/campus.ts) so client components can
// import the type without pulling Prisma into the browser bundle.
export type CampusPublic = {
  code: string;
  name: string;
  platformFeePaise: number;
  hostelDeliveryFeePaise: number;
  hostelDeliveryEnabled: boolean;
  paymentChargePercentBps: number;
  paymentChargeFixedPaise: number;
};

export const CAMPUS_STORAGE_KEY = "dish2door_campus";

// Only the campus CODE is kept on the device. Fees and hostel-delivery rules are always
// resolved from the database at checkout, so editing this value can't buy cheaper fees.
export function readStoredCampus(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CAMPUS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredCampus(code: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CAMPUS_STORAGE_KEY, code);
    window.dispatchEvent(new Event("dish2door-campus-updated"));
  } catch {
    // Private browsing / storage disabled — the picker still works for this session.
  }
}
