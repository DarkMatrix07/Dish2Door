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
