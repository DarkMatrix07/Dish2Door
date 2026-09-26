"use client";

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { formatPaise } from "@/lib/utils";

// A rupee amount that counts to its new value instead of jumping, so a changing
// total reads as "went up by one item" rather than a flicker. Renders the exact
// final value; only the in-between frames are interpolated.
export function AnimatedPaise({ value, className }: { value: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const [shown, setShown] = useState(value);

  useMotionValueEvent(motionValue, "change", (latest) => setShown(Math.round(latest)));

  useEffect(() => {
    if (reduceMotion) {
      motionValue.jump(value);
      return;
    }
    const controls = animate(motionValue, value, { duration: 0.45, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, reduceMotion, motionValue]);

  return <span className={className}>{formatPaise(reduceMotion ? value : shown)}</span>;
}
