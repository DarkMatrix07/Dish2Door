import { ShoppingBag } from "lucide-react";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[#f7f3eb]" role="status" aria-label="Loading Dish2Door">
      <div className="text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#171713] text-white"><ShoppingBag size={21} /></div>
        <p className="mt-4 text-xl font-black tracking-[-0.04em] text-[#171713]">Dish2Door</p>
        <div className="mx-auto mt-4 h-1 w-28 overflow-hidden rounded-full bg-black/10"><span className="dish-loading-bar block h-full w-1/2 rounded-full bg-[#f6b73c]" /></div>
      </div>
    </div>
  );
}
