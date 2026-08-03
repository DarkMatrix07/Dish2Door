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

export function minutesToTimeInput(minutes: number) {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function timeInputToMinutes(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function paiseToRupees(value: number) {
  return String(value / 100);
}

export function rupeesToPaise(value: string) {
  return Math.round(Number(value || 0) * 100);
}

// The settings API requires the full object, so every sub-page submits all fields.
export async function saveSettings(settings: Settings): Promise<Settings> {
  const response = await fetch("/api/admin/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not save settings");
  return data.settings as Settings;
}
