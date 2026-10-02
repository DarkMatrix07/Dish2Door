// Rate-limit rules for the guest tracking endpoints. Pure (builds keys and budgets only)
// so the rules are unit-testable; the routes feed each spec to consumeRateLimit.
//
// A 4-digit passcode has 10,000 combinations, so guessing has to stay bounded, but the
// budget must not let a stranger who merely knows a tracking code lock its owner out.
// Hence three layers:
//   1. per tracking code + source address: small, so one address cannot guess much
//      and cannot burn the budget of the owner's (different) address;
//   2. per source address: stops one address sweeping many tracking codes;
//   3. per tracking code across all sources: a high ceiling that keeps total brute
//      force bounded however many addresses an attacker has.

export const TRACKING_WINDOW_MS = 10 * 60 * 1000;
export const ATTEMPTS_PER_CODE_AND_SOURCE = 8;
export const ATTEMPTS_PER_SOURCE = 40;
export const ATTEMPTS_PER_CODE_ALL_SOURCES = 30;

export type LimitSpec = { key: string; max: number; windowMs: number };

export type PasscodeScope = "verify" | "rating";

// `source` is null when TRUST_PROXY is off (no trustworthy client address). Then the
// per-source layers cannot exist, so the per-code budget falls back to the old, stricter
// 8 per code from anyone: brute force stays bounded and the lock-out risk is accepted.
export function passcodeAttemptLimits(scope: PasscodeScope, trackingCode: string, source: string | null): LimitSpec[] {
  const limits: LimitSpec[] = [
    // One ceiling shared by /verify and /rating, so the two endpoints cannot be used
    // to double the guess budget.
    { key: `tracking-code:${trackingCode}`, max: ATTEMPTS_PER_CODE_ALL_SOURCES, windowMs: TRACKING_WINDOW_MS }
  ];
  if (source) {
    limits.push(
      { key: `${scope}:${trackingCode}:${source}`, max: ATTEMPTS_PER_CODE_AND_SOURCE, windowMs: TRACKING_WINDOW_MS },
      { key: `${scope}-source:${source}`, max: ATTEMPTS_PER_SOURCE, windowMs: TRACKING_WINDOW_MS }
    );
  } else {
    limits.push({ key: `${scope}:${trackingCode}`, max: ATTEMPTS_PER_CODE_AND_SOURCE, windowMs: TRACKING_WINDOW_MS });
  }
  return limits;
}

// Review-link attempts. The token has 256 bits of entropy, so guessing is pointless and
// there is deliberately no per-code ceiling (it would only give strangers a way to block
// the owner). They still get their own budget, separate from passcode attempts, so
// opening a review link never eats into passcode tries.
export function reviewTokenAttemptLimits(trackingCode: string, source: string | null): LimitSpec[] {
  if (source) {
    return [
      { key: `review-token:${trackingCode}:${source}`, max: ATTEMPTS_PER_CODE_AND_SOURCE, windowMs: TRACKING_WINDOW_MS },
      { key: `review-token-source:${source}`, max: ATTEMPTS_PER_SOURCE, windowMs: TRACKING_WINDOW_MS }
    ];
  }
  return [{ key: `review-token:${trackingCode}`, max: ATTEMPTS_PER_CODE_AND_SOURCE, windowMs: TRACKING_WINDOW_MS }];
}
