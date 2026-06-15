export const CART_STORAGE_KEY = "dish2door_cart";

export type StoredCartItem = {
  id: string;
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

export function readStoredCart(): StoredCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(CART_STORAGE_KEY);
    return value ? (JSON.parse(value) as StoredCartItem[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredCart(items: StoredCartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("dish2door-cart-updated"));
}

export function clearStoredCart() {
  writeStoredCart([]);
}
