// Checkout recovery stores opaque capabilities and the provider's signed callback,
// never contact details. The callback permits verification, not another charge.
type Attempt = { key: string; capability: string; pending?: boolean; terminal?: boolean };
const memory = new Map<string, Attempt>();
const ACTIVE_KEY = "dish2door_checkout_active";
export type PaymentProof = { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string };
type ActiveCheckout = { owner: string; state: "opening" | "pending"; expiresAt: number; key?: string; capability?: string; storageKey?: string; proof?: PaymentProof };
let activeMemory: ActiveCheckout | null = null;
let activeStorageWritable = true;

function readActive(): ActiveCheckout | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? "null") as ActiveCheckout | null;
    if (value?.owner && value.expiresAt > Date.now() && (value.state === "opening" || value.state === "pending")) return value;
    return activeStorageWritable ? null : activeMemory && activeMemory.expiresAt > Date.now() ? activeMemory : null;
  } catch { /* Browser storage is optional. */ }
  return activeMemory && activeMemory.expiresAt > Date.now() ? activeMemory : null;
}

function writeActive(value: ActiveCheckout | null) {
  activeMemory = value;
  try {
    if (value) localStorage.setItem(ACTIVE_KEY, JSON.stringify(value));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { activeStorageWritable = false; }
}

export function hasPendingCheckout(): boolean {
  return readActive()?.state === "pending";
}

export function getPendingCheckout() {
  const active = readActive();
  return active?.state === "pending" && active.key && active.capability
    ? { ...active, key: active.key, capability: active.capability }
    : null;
}

export function saveCheckoutProof(proof: PaymentProof) {
  const active = getPendingCheckout();
  if (active) writeActive({ ...active, proof });
}

export function clearPendingCheckout() {
  if (readActive()?.state === "pending") writeActive(null);
}

export function completePendingCheckout() {
  const active = getPendingCheckout();
  if (active?.storageKey) {
    memory.delete(active.storageKey);
    try { localStorage.removeItem(active.storageKey); } catch { /* Storage is optional. */ }
  }
  clearPendingCheckout();
}

export function markCheckoutTerminal() {
  const active = getPendingCheckout();
  if (active?.storageKey && active.key && active.capability) {
    const terminal: Attempt = { key: active.key, capability: active.capability, terminal: true };
    memory.set(active.storageKey, terminal);
    try { localStorage.setItem(active.storageKey, JSON.stringify(terminal)); } catch { /* Storage is optional. */ }
  }
  clearPendingCheckout();
}

export async function claimCheckout(): Promise<string | null> {
  const claim = () => {
    if (readActive()) return null;
    const owner = crypto.randomUUID();
    writeActive({ owner, state: "opening", expiresAt: Date.now() + 30 * 60_000 });
    return owner;
  };
  return navigator.locks ? navigator.locks.request("dish2door-checkout", claim) : claim();
}

export function releaseCheckout(owner: string) {
  const active = readActive();
  if (active?.owner === owner && active.state === "opening") writeActive(null);
}

export async function getCheckoutAttempt(payload: string) {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const storageKey = `dish2door_checkout_${digest}`;
  const allocate = () => {
    let attempt = memory.get(storageKey);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Attempt | null;
      if (stored && /^[\w-]{36}$/.test(stored.key) && /^[\w-]{36}$/.test(stored.capability)) attempt = stored;
    } catch { /* Browser storage is optional. */ }
    attempt ??= { key: crypto.randomUUID(), capability: crypto.randomUUID() };
    memory.set(storageKey, attempt);
    try { localStorage.setItem(storageKey, JSON.stringify(attempt)); } catch { /* In-memory fallback. */ }
    return { ...attempt, storageKey };
  };
  return navigator.locks ? navigator.locks.request("dish2door-checkout", allocate) : allocate();
}

export function markCheckoutPending(attempt: Awaited<ReturnType<typeof getCheckoutAttempt>>, owner?: string) {
  const stored = { key: attempt.key, capability: attempt.capability, pending: true };
  memory.set(attempt.storageKey, stored);
  try { localStorage.setItem(attempt.storageKey, JSON.stringify(stored)); } catch { /* In-memory fallback. */ }
  writeActive({ owner: owner ?? attempt.key, state: "pending", expiresAt: Date.now() + 7 * 24 * 60 * 60_000, key: attempt.key, capability: attempt.capability, storageKey: attempt.storageKey });
}

export function completeCheckoutAttempt(attempt: Awaited<ReturnType<typeof getCheckoutAttempt>>) {
  memory.delete(attempt.storageKey);
  try { localStorage.removeItem(attempt.storageKey); } catch { /* Storage is optional. */ }
  writeActive(null);
}
