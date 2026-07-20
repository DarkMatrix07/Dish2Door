export const CUSTOMER_IDENTITY_KEY = "dish2door_customer";

export type CustomerIdentity = {
  name: string;
  email: string;
  phone: string;
};

export function readStoredIdentity(): CustomerIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(CUSTOMER_IDENTITY_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<CustomerIdentity>;
    if (!parsed.name || !parsed.phone) return null;
    return { name: parsed.name, email: parsed.email ?? "", phone: parsed.phone };
  } catch {
    return null;
  }
}

export function writeStoredIdentity(identity: CustomerIdentity) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOMER_IDENTITY_KEY, JSON.stringify(identity));
}
