// Pure rules for the Discount wheel page: the odds check, the status of a prize and the
// filters on the prize list. No database and no React, so they can be unit-tested.
// A prize the customer won by spinning has no issuedById; one an admin gave by hand does.
// Gifts are left out of the odds and win counts because the wheel did not pick them.
import { WHEEL_SEGMENTS } from "@/lib/spin-wheel";

export const WHEEL_PAGE_SIZE = 25;

// Below this many spins the percentages swing too much to say anything about fairness.
export const MIN_SPINS_TO_JUDGE = 50;

// ---- Odds check ----

export type OddsRow = {
  percent: number;
  // Set chance, 0 to 100, from the wheel's weights.
  setChance: number;
  count: number;
  // How often it really came up, 0 to 100. Null when nothing has been spun yet.
  actualChance: number | null;
  // Only given once there are enough spins, and never for prizes so rare that a handful
  // of spins would still be normal.
  verdict: "ok" | "more" | "less" | null;
};

export type OddsReport = {
  total: number;
  enough: boolean;
  rows: OddsRow[];
  // One plain sentence for the page.
  note: string;
};

const SEGMENTS_DESC = [...WHEEL_SEGMENTS].sort((a, b) => b.percent - a.percent);

// Counts is "percent -> times it came up" for spun prizes only. A 3-sigma gap is used
// because eight prizes are compared at once and a stricter bar avoids false alarms.
export function buildOddsReport(
  counts: ReadonlyMap<number, number> | Record<number, number>,
  segments: readonly { percent: number; weight: number }[] = SEGMENTS_DESC
): OddsReport {
  const countOf = (percent: number) => (counts instanceof Map ? counts.get(percent) : (counts as Record<number, number>)[percent]) ?? 0;
  const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
  const total = segments.reduce((sum, segment) => sum + countOf(segment.percent), 0);
  const enough = total >= MIN_SPINS_TO_JUDGE;

  const rows = segments.map<OddsRow>((segment) => {
    const p = segment.weight / totalWeight;
    const count = countOf(segment.percent);
    let verdict: OddsRow["verdict"] = null;
    if (enough) {
      verdict = "ok";
      const expected = total * p;
      const sigma = Math.sqrt(total * p * (1 - p));
      // Under five expected wins the bell-curve maths is unreliable, so say nothing.
      if (expected >= 5 && sigma > 0) {
        const z = (count - expected) / sigma;
        if (z >= 3) verdict = "more";
        else if (z <= -3) verdict = "less";
      }
    }
    return { percent: segment.percent, setChance: p * 100, count, actualChance: total ? (count / total) * 100 : null, verdict };
  });

  let note: string;
  if (total === 0) {
    note = "Nobody has spun yet, so there is nothing to compare.";
  } else if (!enough) {
    note = `Only ${total} ${total === 1 ? "spin" : "spins"} so far. That is too few to say whether the wheel is fair: a few lucky spins can look very different from the set chances. Check again after ${MIN_SPINS_TO_JUDGE} or more.`;
  } else {
    const off = rows.filter((row) => row.verdict === "more" || row.verdict === "less");
    note = off.length
      ? `Worth a look: ${off.map((row) => `${row.percent}% is coming up ${row.verdict === "more" ? "more" : "less"} often than set`).join(", ")}.`
      : "Results are close to the set chances.";
  }
  return { total, enough, rows, note };
}

export function formatChance(value: number | null) {
  if (value === null) return "—";
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

// ---- Prize status ----

export type PrizeStatus = "waiting" | "used" | "expired";
export const PRIZE_STATUS_LABELS: Record<PrizeStatus, string> = { waiting: "Waiting", used: "Used", expired: "Expired" };

// A prize is only marked expired when someone tries it after the coupon ran out, so one
// the customer never touched can sit as "not expired" for days. Judge it by the coupon's
// own date too, which is what the customer actually runs into at checkout.
export function prizeStatus(
  prize: { redeemedAt: Date | string | null; expiredAt: Date | string | null },
  couponExpiresAt: Date | string | null,
  now = new Date()
): PrizeStatus {
  if (prize.redeemedAt) return "used";
  if (prize.expiredAt) return "expired";
  if (couponExpiresAt && new Date(couponExpiresAt) <= now) return "expired";
  return "waiting";
}

export function prizeSourceLabel(prize: { issuedById: string | null; issuedByName?: string | null }) {
  if (!prize.issuedById) return "Won on wheel";
  return `Given by ${prize.issuedByName?.trim() || "an admin"}`;
}

// ---- Prize list filters ----

export const PRIZE_SOURCES = ["won", "given"] as const;
export type PrizeSource = (typeof PRIZE_SOURCES)[number];

export type PrizeSearch = {
  search: string;
  status: PrizeStatus | null;
  source: PrizeSource | null;
};

const MAX_SEARCH_LENGTH = 80;
const STATUSES: readonly PrizeStatus[] = ["waiting", "used", "expired"];

type ParamSource = { get(name: string): string | null | undefined };

export function parsePrizeSearch(params: ParamSource): PrizeSearch {
  const status = params.get("status");
  const source = params.get("source");
  return {
    search: (params.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    status: STATUSES.includes(status as PrizeStatus) ? (status as PrizeStatus) : null,
    source: PRIZE_SOURCES.includes(source as PrizeSource) ? (source as PrizeSource) : null
  };
}

// Defaults are left out so equal filters make the same address.
export function prizeSearchToParams(search: PrizeSearch) {
  const params: Record<string, string> = {};
  if (search.search) params.q = search.search;
  if (search.status) params.status = search.status;
  if (search.source) params.source = search.source;
  return params;
}

// A typed phone number may carry spaces, dashes or +91 that the stored 10 digits lack.
export function phoneDigits(term: string) {
  if (!/^[\d\s+()-]+$/.test(term)) return "";
  const digits = term.replace(/\D/g, "");
  if (digits.length < 4) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// So a search for "50%" or "WHEEL_" matches that text and not "anything".
export function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (char) => "\\" + char)}%`;
}
