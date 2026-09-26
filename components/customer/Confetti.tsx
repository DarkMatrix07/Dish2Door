"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

const COLOURS = ["#f6b73c", "#c65d24", "#171713", "#34705a", "#e8d9bf"];

// A one-off burst for "your order is confirmed". Pieces are generated once on mount
// (this only ever renders client-side, after payment), and nothing is drawn for
// visitors who asked their phone to reduce motion.
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  const reduceMotion = useReducedMotion();
  const [burst] = useState(() =>
    Array.from({ length: pieces }, (_, index) => ({
      id: index,
      x: (Math.random() - 0.5) * 520,
      y: 180 + Math.random() * 320,
      lift: -(60 + Math.random() * 140),
      rotate: (Math.random() - 0.5) * 720,
      delay: Math.random() * 0.15,
      width: 6 + Math.random() * 6,
      colour: COLOURS[index % COLOURS.length],
      round: index % 3 === 0
    }))
  );
  if (reduceMotion) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[150] flex justify-center overflow-hidden" style={{ height: "100vh" }}>
      <div className="relative top-24 h-0 w-0">
        {burst.map((piece) => (
          <motion.span
            key={piece.id}
            className="absolute block"
            style={{ width: piece.width, height: piece.round ? piece.width : piece.width * 1.6, backgroundColor: piece.colour, borderRadius: piece.round ? 999 : 2 }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
            animate={{ x: piece.x, y: [0, piece.lift, piece.y], opacity: [1, 1, 0], rotate: piece.rotate, scale: 1 }}
            transition={{ duration: 1.6, delay: piece.delay, ease: [0.2, 0.7, 0.4, 1], times: [0, 0.35, 1] }}
          />
        ))}
      </div>
    </div>
  );
}
