"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Gift, PartyPopper, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CustomerIdentity } from "@/lib/customer-identity";
import { WHEEL_SEGMENTS } from "@/lib/spin-wheel";

const SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;
const CX = 140;
const CY = 140;
const R = 126;
const SPIN_MS = 4200;

// 0deg points at the top pointer; angle grows clockwise.
function pointOnRim(radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: CX + radius * Math.sin(radians), y: CY - radius * Math.cos(radians) };
}

function slicePath(startDeg: number, endDeg: number) {
  const start = pointOnRim(R, startDeg);
  const end = pointOnRim(R, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

type Reward = { discountPercent: number; couponCode: string };

export function SpinWheel({
  identity,
  onWin,
  onClose
}: {
  identity: CustomerIdentity;
  onWin: (reward: Reward) => void;
  onClose: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);

  function handleCloseClick() {
    // Closing after a win keeps the coupon (it is saved server-side and auto-applies
    // later), so no warning. Closing before spinning gives up the one-time chance.
    if (reward) return onClose();
    setConfirmingClose(true);
  }

  async function confirmForfeit() {
    setForfeiting(true);
    try {
      await fetch("/api/customer/spin/forfeit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: identity.phone })
      });
    } catch {
      // Best-effort; close regardless.
    }
    onClose();
  }

  async function spin() {
    if (spinning || reward) return;
    setSpinning(true);
    try {
      const response = await fetch("/api/customer/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identity)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not spin the wheel.");

      const index = Number(data.segmentIndex) || 0;
      // Land the winning face's centre under the top pointer after several turns,
      // with a little jitter so it never stops dead-centre every time.
      const jitter = Math.random() * (SEGMENT_ANGLE - 18) - (SEGMENT_ANGLE - 18) / 2;
      const target = 360 * 6 + (360 - (index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2)) + jitter;
      setRotation(target);
      window.setTimeout(() => {
        setReward({ discountPercent: Number(data.discountPercent), couponCode: String(data.couponCode) });
        setSpinning(false);
      }, SPIN_MS);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not spin the wheel.");
      setSpinning(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[120] grid place-items-center bg-[#171713]/65 p-5 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Discount wheel"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-[#fffdf8] p-6 text-center shadow-[0_30px_100px_rgba(0,0,0,0.32)] sm:p-8"
      >
        {!spinning ? (
          <button
            type="button"
            aria-label="Close"
            onClick={handleCloseClick}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full text-[#716a5f] transition hover:bg-black/5 hover:text-[#171713]"
          >
            <X size={19} />
          </button>
        ) : null}

        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f6b73c] text-[#171713]">
          <Gift size={24} />
        </span>
        <h2 className="mt-4 text-3xl font-black tracking-[-0.04em]">You unlocked a spin!</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#716a5f]">
          Thanks for being a regular. Spin the wheel for a discount on this order.
        </p>

        <div className="relative mx-auto mt-6 h-[280px] w-[280px]">
          {/* Pointer */}
          <div className="absolute left-1/2 top-[-2px] z-10 -translate-x-1/2">
            <div className="h-0 w-0 border-l-[13px] border-r-[13px] border-t-[22px] border-l-transparent border-r-transparent border-t-[#c65d24] drop-shadow" />
          </div>

          <motion.svg
            viewBox="0 0 280 280"
            className="h-full w-full drop-shadow-[0_18px_40px_rgba(58,43,22,0.25)]"
            animate={{ rotate: rotation }}
            transition={{ duration: SPIN_MS / 1000, ease: [0.16, 1, 0.16, 1] }}
          >
            <circle cx={CX} cy={CY} r={R + 6} fill="#fffdf8" stroke="#171713" strokeWidth={3} />
            {WHEEL_SEGMENTS.map((segment, index) => {
              const start = index * SEGMENT_ANGLE;
              const end = start + SEGMENT_ANGLE;
              const mid = start + SEGMENT_ANGLE / 2;
              const label = pointOnRim(R * 0.66, mid);
              const isDark = index % 2 === 1;
              return (
                <g key={segment.percent}>
                  <path d={slicePath(start, end)} fill={isDark ? "#171713" : "#f6b73c"} stroke="#fffdf8" strokeWidth={2} />
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${mid} ${label.x} ${label.y})`}
                    className="font-black"
                    fontSize={20}
                    fill={isDark ? "#f6b73c" : "#171713"}
                  >
                    {segment.percent}%
                  </text>
                </g>
              );
            })}
            <circle cx={CX} cy={CY} r={22} fill="#171713" stroke="#fffdf8" strokeWidth={3} />
          </motion.svg>
        </div>

        {reward ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
            <p className="flex items-center justify-center gap-2 text-lg font-black text-[#34705a]">
              <PartyPopper size={20} /> You won {reward.discountPercent}% off!
            </p>
            <p className="mt-1 text-sm text-[#716a5f]">
              Coupon <span className="font-mono font-black text-[#171713]">{reward.couponCode}</span> is ready.
            </p>
            <button
              type="button"
              onClick={() => onWin(reward)}
              className="cart-dark-link mt-5 flex min-h-14 w-full items-center justify-center rounded-md bg-[#171713] px-5 py-3 font-black transition hover:bg-[#c65d24]"
            >
              Apply {reward.discountPercent}% to my order
            </button>
          </motion.div>
        ) : (
          <button
            type="button"
            disabled={spinning}
            onClick={spin}
            className="cart-dark-link mt-6 flex min-h-14 w-full items-center justify-center rounded-md bg-[#171713] px-5 font-black transition hover:bg-[#c65d24] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {spinning ? "Spinning…" : "Spin the wheel"}
          </button>
        )}

        {confirmingClose ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-20 grid place-items-center rounded-3xl bg-[#fffdf8]/95 p-6 backdrop-blur-sm sm:p-8"
          >
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#fbe3c4] text-[#c65d24]">
                <AlertTriangle size={24} />
              </span>
              <h3 className="mt-4 text-2xl font-black tracking-[-0.03em]">Give up your spin?</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#716a5f]">
                This is a one-time chance. If you close now your spin is used up — you won&apos;t be able to claim this discount later.
              </p>
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => setConfirmingClose(false)}
                  className="cart-dark-link flex min-h-14 w-full items-center justify-center rounded-md bg-[#171713] px-5 font-black transition hover:bg-[#c65d24]"
                >
                  Keep my spin
                </button>
                <button
                  type="button"
                  onClick={confirmForfeit}
                  disabled={forfeiting}
                  className="min-h-11 w-full rounded-md px-5 text-sm font-bold text-[#a3564b] transition hover:bg-[#a3564b]/8 disabled:opacity-60"
                >
                  {forfeiting ? "Closing…" : "Give it up"}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
