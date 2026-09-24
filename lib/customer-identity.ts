/**
 * Optional, opt-in convenience prefill for checkout contact details.
 *
 * A remembered phone number is NOT proof of ownership and is NOT an
 * authenticated session. Never treat it as authorization for order lookup,
 * payment, or account access, and never store tokens or secrets here.
 */
export const CUSTOMER_IDENTITY_KEY = "dish2door_customer";
export const IDENTITY_VERSION = 1;
export const IDENTITY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CustomerIdentity = {
  name: string;
  email: string;
  phone: string;
};

type StoredIdentity = {
  v: typeof IDENTITY_VERSION;
  remember: true;
  expiresAt: number;
  name: string;
  email: string;
  phone: string;
};

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeKey(storage: Storage) {
  try {
    storage.removeItem(CUSTOMER_IDENTITY_KEY);
  } catch {
    // Storage may be unavailable (private mode, quota, policy).
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function readStoredIdentity(): CustomerIdentity | null {
  const storage = getStorage();
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(CUSTOMER_IDENTITY_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeKey(storage);
    return null;
  }

  const data = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<StoredIdentity>;
  const valid =
    data.v === IDENTITY_VERSION &&
    data.remember === true &&
    typeof data.expiresAt === "number" &&
    Number.isFinite(data.expiresAt) &&
    data.expiresAt > Date.now() &&
    isNonEmptyString(data.name) &&
    isNonEmptyString(data.phone);

  if (!valid) {
    removeKey(storage);
    return null;
  }

  return {
    name: data.name as string,
    email: typeof data.email === "string" ? data.email : "",
    phone: data.phone as string,
  };
}

export function writeStoredIdentity(
  identity: CustomerIdentity,
  options?: { remember?: boolean },
): void {
  const storage = getStorage();
  if (!storage) return;

  if (options?.remember !== true) {
    removeKey(storage);
    return;
  }

  const payload: StoredIdentity = {
    v: IDENTITY_VERSION,
    remember: true,
    expiresAt: Date.now() + IDENTITY_TTL_MS,
    name: identity.name,
    email: identity.email ?? "",
    phone: identity.phone,
  };

  try {
    storage.setItem(CUSTOMER_IDENTITY_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable (private mode, quota, policy).
  }
}

export function forgetStoredIdentity(): void {
  const storage = getStorage();
  if (!storage) return;
  removeKey(storage);
}
