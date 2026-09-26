"use client";

import { MotionConfig } from "framer-motion";

// Every framer-motion animation on the site honours the phone's "reduce motion"
// setting: movement is dropped, opacity fades are kept.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
