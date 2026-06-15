"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readStoredCart } from "@/lib/cart";

export function CartNavButton() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function sync() {
      setCount(readStoredCart().reduce((total, item) => total + item.quantity, 0));
    }

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("dish2door-cart-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("dish2door-cart-updated", sync);
    };
  }, []);

  return (
    <Link href="/cart">
      <Button variant="secondary">
        <ShoppingBag size={18} />
        Cart {count ? `(${count})` : ""}
      </Button>
    </Link>
  );
}
