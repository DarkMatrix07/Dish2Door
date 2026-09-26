"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { readStoredCart } from "@/lib/cart";

// Styled as a button but rendered as the link itself. A <button> nested inside an <a>
// is invalid HTML and gave keyboard users two tab stops for one control.
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
    <Link
      href="/cart"
      aria-label={count ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart"}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 font-semibold text-neutral-950 transition hover:bg-amber-200"
    >
      <ShoppingBag size={18} />
      Cart
      {count ? (
        <motion.span
          key={count}
          initial={{ scale: 1.4 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 16 }}
          className="grid h-5 min-w-5 place-items-center rounded-full bg-[#171713] px-1 text-[11px] font-black tabular-nums text-white"
        >
          {count}
        </motion.span>
      ) : null}
    </Link>
  );
}
