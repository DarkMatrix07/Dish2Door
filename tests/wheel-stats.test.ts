import assert from "node:assert/strict";
import test from "node:test";
import { WHEEL_SEGMENTS, WHEEL_TOTAL_WEIGHT } from "../lib/spin-wheel";
import {
  MIN_SPINS_TO_JUDGE,
  buildOddsReport,
  formatChance,
  likePattern,
  parsePrizeSearch,
  phoneDigits,
  prizeSearchToParams,
  prizeSourceLabel,
  prizeStatus
} from "../lib/wheel-stats";

const params = (record: Record<string, string>) => ({ get: (name: string) => record[name] ?? null });

// A sample that matches the set chances exactly.
function exactCounts(total: number) {
  return new Map<number, number>(WHEEL_SEGMENTS.map((segment) => [segment.percent, (segment.weight / WHEEL_TOTAL_WEIGHT) * total]));
}

test("set chances come from the wheel weights and add up to 100", () => {
  const report = buildOddsReport(new Map());
  const sum = report.rows.reduce((total, row) => total + row.setChance, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9);
  const sixteen = report.rows.find((row) => row.percent === 16);
  assert.ok(sixteen);
  assert.ok(Math.abs(sixteen.setChance - (2 / WHEEL_TOTAL_WEIGHT) * 100) < 1e-9);
  assert.deepEqual(report.rows.map((row) => row.percent), [16, 14, 12, 10, 8, 6, 4, 2]);
});

test("no spins yet", () => {
  const report = buildOddsReport(new Map());
  assert.equal(report.total, 0);
  assert.equal(report.enough, false);
  assert.match(report.note, /Nobody has spun/);
  assert.equal(report.rows[0].actualChance, null);
  assert.equal(report.rows[0].verdict, null);
});

test("a small sample is not judged", () => {
  const report = buildOddsReport(new Map([[16, 3], [2, 10]]));
  assert.equal(report.total, 13);
  assert.equal(report.enough, false);
  assert.match(report.note, /too few/);
  assert.ok(report.rows.every((row) => row.verdict === null));
});

test("enough spins that match the set chances look fine", () => {
  const report = buildOddsReport(exactCounts(1000));
  assert.equal(report.enough, true);
  assert.ok(report.rows.every((row) => row.verdict === "ok"));
  assert.match(report.note, /close to the set chances/);
});

test("a prize coming up far too often is flagged", () => {
  const counts = exactCounts(1000);
  counts.set(2, 600);
  counts.set(4, 100);
  const report = buildOddsReport(counts);
  assert.equal(report.rows.find((row) => row.percent === 2)?.verdict, "more");
  assert.equal(report.rows.find((row) => row.percent === 4)?.verdict, "less");
  assert.match(report.note, /2% is coming up more often than set/);
});

test("a very rare prize is not flagged on a handful of spins", () => {
  const counts = exactCounts(MIN_SPINS_TO_JUDGE);
  counts.set(16, 5);
  const report = buildOddsReport(counts);
  assert.equal(report.rows.find((row) => row.percent === 16)?.verdict, "ok");
});

test("chance text is short and readable", () => {
  assert.equal(formatChance(null), "—");
  assert.equal(formatChance(0), "0%");
  assert.equal(formatChance(2), "2.0%");
  assert.equal(formatChance(30), "30%");
  assert.equal(formatChance(26.0869), "26%");
});

test("status: used beats expired, and a coupon past its date counts as expired", () => {
  const now = new Date("2026-10-02T10:00:00Z");
  assert.equal(prizeStatus({ redeemedAt: new Date(), expiredAt: new Date() }, null, now), "used");
  assert.equal(prizeStatus({ redeemedAt: null, expiredAt: new Date() }, null, now), "expired");
  assert.equal(prizeStatus({ redeemedAt: null, expiredAt: null }, "2026-10-01T00:00:00Z", now), "expired");
  assert.equal(prizeStatus({ redeemedAt: null, expiredAt: null }, "2026-10-03T00:00:00Z", now), "waiting");
  assert.equal(prizeStatus({ redeemedAt: null, expiredAt: null }, null, now), "waiting");
  // Used on a coupon that has since expired is still used.
  assert.equal(prizeStatus({ redeemedAt: new Date("2026-09-01"), expiredAt: null }, "2026-09-02T00:00:00Z", now), "used");
});

test("source label tells won from given", () => {
  assert.equal(prizeSourceLabel({ issuedById: null }), "Won on wheel");
  assert.equal(prizeSourceLabel({ issuedById: "u1", issuedByName: "Ravi" }), "Given by Ravi");
  assert.equal(prizeSourceLabel({ issuedById: "u1", issuedByName: null }), "Given by an admin");
});

test("prize filters are allow-listed and round-trip", () => {
  assert.deepEqual(parsePrizeSearch(params({})), { search: "", status: null, source: null });
  assert.deepEqual(parsePrizeSearch(params({ status: "DROP TABLE", source: "x" })), { search: "", status: null, source: null });
  const search = parsePrizeSearch(params({ q: "  9876  ", status: "used", source: "given" }));
  assert.deepEqual(search, { search: "9876", status: "used", source: "given" });
  assert.deepEqual(prizeSearchToParams(search), { q: "9876", status: "used", source: "given" });
  assert.equal(parsePrizeSearch(params({ q: "x".repeat(200) })).search.length, 80);
});

test("phone search tolerates spaces and +91, and ignores short or non-phone text", () => {
  assert.equal(phoneDigits("+91 98765 43210"), "9876543210");
  assert.equal(phoneDigits("98765"), "98765");
  assert.equal(phoneDigits("123"), "");
  assert.equal(phoneDigits("WHEEL1234"), "");
});

test("LIKE wildcards in a search are matched literally", () => {
  assert.equal(likePattern("50%"), "%50\\%%");
  assert.equal(likePattern("A_B"), "%A\\_B%");
});
