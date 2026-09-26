export const CART_STORAGE_KEY = "dish2door_cart";

// Mirrors the server's per-line cap in resolveItems. Enforcing it while the cart is
// built means the customer hears about it on the + button, not as a failed payment.
export const MAX_LINE_QUANTITY = 20;

export type StoredCartItem = {
  // For a menu item this is the MenuItem id. For a combo it is `combo:<comboId>` so
  // the two id spaces never collide in the cart. `kind` disambiguates at checkout.
  id: string;
  kind?: "item" | "combo";
  comboId?: string;
  name: string;
  description: string | null;
  pricePaise: number;
  discountPercent?: number;
  imageUrl: string | null;
  available: boolean;
  restaurantId: string;
  restaurantName: string;
  quantity: number;
};

// A line saved by an older build, or hand-edited, must not be able to break the cart
// totals (NaN) or the checkout payload.
function isCartItem(value: unknown): value is StoredCartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredCartItem>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.restaurantId === "string" &&
    Number.isInteger(item.pricePaise) &&
    Number.isInteger(item.quantity) &&
    (item.quantity as number) > 0
  );
}

export function readStoredCart(): StoredCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter(isCartItem).map((item) => ({ ...item, quantity: Math.min(item.quantity, MAX_LINE_QUANTITY) }))
      : [];
  } catch {
    return [];
  }
}

export function writeStoredCart(items: StoredCartItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private browsing or a full quota: the cart still works in memory for this page.
  }
  window.dispatchEvent(new Event("dish2door-cart-updated"));
}

export function clearStoredCart() {
  writeStoredCart([]);
}
