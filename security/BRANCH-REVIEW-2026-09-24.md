# Remediation branch review — changes required

**Historical review: changes requested.** Review date: 24 September 2026. Follow-up implementation and validation are recorded in `REMEDIATION-RESULTS.md`; the findings below preserve the original evidence.

The checkout is on `codex/security-remediation`, but that branch and `main` both still point to `391dc63c6a4cf981a809c8ba7248f7ce94638b66`. The submitted implementation is uncommitted (53 modified tracked files, plus new helpers, scripts, migration and security artifacts at review start). There are no remediation commits to merge yet. The user's implementation changes were preserved; this review only added evidence and this report.

The submitted `REMEDIATION-RESULTS.md` explicitly marks most tasks In progress or Not started. This is not a completed implementation of the handoff. The deliberate no-phone-verification decision remains in force; residual phone ownership risk alone is not being treated as an unexpected regression.

## Blocking findings

### 1. [P1] Expired checkouts still bypass one-use coupon capacity

**Locations:** `lib/orders.ts:391`, `lib/orders.ts:510`.

Cleanup marks an order EXPIRED and releases its held coupon capacity. The already-created Razorpay order is still payable. A second checkout can consume that freed capacity; if the first payment is then captured, the RELEASED branch unconditionally increments usedCount and fulfills the old order. The submitted reservation mechanism therefore still permits a maxUses=1 coupon to reach usedCount=2.

**Evidence:** `npx tsx security/branch-review-probes.ts` reproduced cleanup, reuse of the freed capacity and late confirmation using the actual service functions with synthetic Prisma doubles.

**Required correction:** retain capacity until the provider attempt is conclusively unpayable/reconciled, or implement a defined late-payment compensation workflow. Do not fulfill a recycled reservation by blindly incrementing usage. Cover creation failure, abandoned checkout, late capture and cancellation in real PostgreSQL/provider test-mode scenarios.

### 2. [P1] Existing pending coupon orders are omitted from redemption accounting

**Locations:** `lib/orders.ts:497–519`; `prisma/migrations/20260924183000_security_remediation/migration.sql`.

Confirmation now increments coupon usage only when a CouponReservation exists. The migration creates an empty reservation table and does not backfill already-pending orders. A pending discounted order created before deployment can be paid after deployment without incrementing coupon usage or redeeming its spin reward. The old implementation did account for these orders.

**Evidence:** the isolated probe confirmed a synthetic pre-migration pending order as PAID_ONLINE while coupon usedCount remained 0.

**Required correction:** implement a documented legacy transition/backfill or explicit atomic confirmation path for these orders. Coordinate rollout and reservation capacity rather than assuming all pending payments expire harmlessly in five minutes. Test a database containing pending discounted orders before applying the migration.

### 3. [P1] Login failure limits do not stop password guessing

**Location:** `app/api/session/login/route.ts:31–47`.

The route looks up the user and checks bcrypt before recording account/per-account-source failures. An over-limit incorrect guess gets 429, but the next guess is still evaluated; a correct guess creates a session before consulting those failure limits. With TRUST_PROXY unset or 0 (the example default), there is no pre-verification source limit either.

**Evidence:** 82 synthetic attempts all reached password comparison, including after the 80-attempt account threshold. The probe stubs bcrypt's result to avoid CPU load; ordering is the actual route implementation.

**Required correction:** enforce applicable limits before password verification/session creation, including when a trusted source address is unavailable. Apply a deliberate account/global budget and recovery design without making spoofed forwarding headers authoritative. Test that denied attempts perform no password comparison or session creation, across workers/restarts.

### 4. [P1] Pending-payment guard permits a second checkout

**Location:** `components/customer/CartPageClient.tsx:334–351`.

The new awaitingCapture branch returns `toast.message(...)`. Sonner returns a nonzero notification ID, not false. Both callers use truthiness, so the guard opens the confirmation dialog and then permits another create-payment request after telling the customer not to pay again. The existing busy flag also resets as soon as the modal opens, and checkout idempotency has not been implemented.

**Evidence:** the installed Sonner implementation returned a truthy number for `toast.message`; source inspection confirms both call sites continue for truthy results.

**Required correction:** make validation return an explicit boolean and show toasts as side effects. Guard checkout itself and pending/modal lifecycle, and implement attempt idempotency for retry/multi-tab safety. Restore the removed ordering-window validation. Browser-test pending capture, repeat clicks, network failure and modal dismissal.

### 5. [P1] Delivery mutation responses still disclose tracking credential hashes

**Locations:** `app/api/delivery/orders/[id]/reached/route.ts:11–12`; `app/api/delivery/orders/[id]/delivered/route.ts:22–23`; affected services in `lib/orders.ts`.

The patch strips trackingPasscodeHash from the list endpoint and initial page props, but reached/delivered handlers still serialize the complete service result containing the hash. Staff can obtain the same verifier by performing a normal permitted transition. This leaves the original privacy finding open despite the list fix. Admin client payloads also remain broad, as the agent's own report acknowledges.

**Required correction:** apply appropriate allowlisted serializers to every order-returning route and server-to-client prop, including mutation results. Add response-contract tests that reject credential fields recursively.

### 6. [P1] Captured events can be durably stored but never reconciled

**Location:** `app/api/webhooks/razorpay/route.ts:57–78`; `instrumentation.ts`.

The webhook inserts PaymentEvent, calls confirmation, ignores a null match and acknowledges 200. No code consumes unprocessed events, updates processedAt/matched or retries them after the provider mapping becomes available. If capture arrives after provider order creation but before the local mapping is saved, a stored event can remain unhandled forever when the browser callback is absent. A failed mapping write has the same risk. Adding the table alone does not implement R08 reconciliation.

**Required correction:** add an idempotent durable worker/retry process with mapping recovery and explicit unmatched-event triage. Test webhook-before-mapping, failed mapping persistence, crash/restart and eventual confirmation. Keep shared-account unrelated events distinguishable without dropping known paid attempts.

## Other actionable issues and incomplete scope

- **[P2] Remembered-contact feature is disconnected.** `lib/customer-identity.ts:97` removes saved identity unless called with `{ remember: true }`. Both existing call sites pass only the identity and there is no opt-in/forget UI. All returning-user prefill is effectively disabled. Complete the caller/UI integration and shared-device tests; do not accidentally treat this as preservation of the previous flow.
- **[P2] Internal-error sanitization is bypassable.** `app/api/orders/create-payment/route.ts:87` forwards any exception containing words such as “coupon”, “campus” or “restaurant”. Prisma messages can contain precisely these model/field names plus internal details. Use typed/explicit domain errors with stable public messages, not keyword classification. Browser verification and several other handlers still return raw error.message.
- **Profile poisoning remains through spin.** Checkout no longer overwrites a shared customer, but `app/api/customer/spin/route.ts:98–101` still updates name/email based on an unverified supplied phone. This mitigation was required even under the no-OTP scope.
- **Critical dependency work is unchanged.** Neither package.json nor the lockfile changed. R01 remains Not started; the old dependency audit cannot be called remediated. A fresh advisory scan and applicable runtime upgrades are still required before security sign-off.
- **Schema-only work is not a feature.** DeliveryAssignment, ReviewToken, CheckoutAttempt, OutboxEvent and AuditEvent do not have their proposed enforcement/consumer flows implemented. Campus access, checkout idempotency, atomic state transitions, notification credential recovery and auditability remain incomplete.
- **Rollout requirements remain open.** The migration needs disposable-DB testing with legacy data and duplicate gateway IDs. Production requires the migration and the new trusted SSH host-key secret. No production environment was touched or verified in this review.

## Validation performed

- `npm test`: all 29 existing tests passed. No regression-test changes under tests/ were submitted; these tests do not cover the above security boundaries.
- `npm run typecheck`: passed, including after adding the isolated review probe.
- `npx tsx security/branch-review-probes.ts`: three blocking behaviors reproduced against actual service/route code with in-memory doubles, no .env loading, no real database, no payments and no messaging.
- Installed Sonner return value checked locally: toast.message returns a truthy number, confirming the guard's control-flow problem.
- Reviewed all submitted diff areas and the new migration/helper/provisioning scripts. No production build, live-service testing, real PostgreSQL concurrency, provider test-mode validation or HTTP/RSC penetration test was performed. Local probes are not substitutes for those checks.

## Merge decision and next handoff

Request changes. Correct the six blocking findings, complete or explicitly rescope the documented unfinished requirements, and add meaningful regression tests. Re-review payment migration/rollout and the resulting diff before committing and merging. Preserve the user's no-phone-verification decision and explicitly document its residual risk.

At the end of this review, `main` and the remediation branch ref remain unchanged, and the implementation is still in the working tree. Nothing was merged, pushed or deployed. The only review additions are this report and `branch-review-probes.ts`.
