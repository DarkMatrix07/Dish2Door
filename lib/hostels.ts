import { z } from "zod";

export const HOSTEL_BLOCKS = [
  "MH-1",
  "MH-2",
  "MH-3",
  "MH-4",
  "MH-5",
  "MH-6",
  "MH-7",
  "LH-1",
  "LH-2",
  "LH-3",
  "LH-4",
] as const;

export type HostelBlock = (typeof HOSTEL_BLOCKS)[number];

const hostelBlockSet = new Set<string>(HOSTEL_BLOCKS);

export function isHostelBlock(value: string): value is HostelBlock {
  return hostelBlockSet.has(value);
}

// Checkout forms keep hostelBlock in state as "" until a block is picked, so a gate
// order posts an empty string. A bare z.enum().optional() rejects "" (optional only
// allows undefined), which failed every gate order — treat ""/null as "not provided".
export const optionalHostelBlockSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.enum(HOSTEL_BLOCKS).optional()
);
