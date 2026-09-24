# Security remediation results

Implementation branch: `codex/security-remediation`. Validated for the user-authorized local merge into main. Not pushed or deployed.

GPT-6 Sol independently reviewed the six branch-review blockers and the coupon/payment follow-up changes. Its two additional findings (cancelled coupon holds and shared-account provider metadata) were corrected and re-reviewed with no remaining blocker in that scope. GPT-6 Sol agents also completed checkout recovery and dependency work.

This closes the six blockers in `BRANCH-REVIEW-2026-09-24.md`, plus the related contact-storage, error-disclosure, spin-profile and dependency findings. It is **not** a claim that every task in the original 25-task security roadmap is complete. Remaining broader work is explicitly listed below. No OTP or mandatory customer login was added.

Statuses below are source-level. None are staging verified or production verified. A passing unit test does not close an issue.

| Task | Status | Notes |
|---|---|---|
| R01 | Code complete, compatibility verified offline | Next.js 16.3.6, Better Auth 1.7.5, Prisma 7.10.0, Sharp 0.35.4, and aligned direct dependency ranges are installed. Patched transitive `mysql2` 3.24.4 and `deepmerge-ts` 8.0.2 are pinned by npm overrides. Full and production `npm audit` report zero advisories. Prisma config/schema validation, client generation, and an offline schema diff succeeded. The `deepmerge-ts` override crosses a major version and should be checked again when Prisma publishes a native fix. |
| R02 | Code complete | Production seed refuses demo users. `scripts/bootstrap-admin.ts` and `scripts/reset-staff-password.ts` added. Existing live accounts are unchanged until an operator runs the reset. |
| R03 | Mitigation complete; ownership risk accepted | Guest checkout and spin no longer overwrite an existing customer profile. Identify omits historical counts. Phone-only reward impersonation remains under the no-OTP decision. |
| R04 | Review blockers fixed | Atomic coupon reservation, capacity-aware legacy backfill, expiry retains payable holds, explicit cancellation releases under the order lock, late cancelled/exhausted capture requests refund without fulfillment. Duplicate capture is idempotent. SQL migration and service regression tests pass; no multi-worker gateway test. |
| R05 | Review blocker fixed | Shared account/global/source budgets enforced before lookup/bcrypt/session, including without trusted proxy. Tests cover denial of correct guesses beyond budget, source/global limits, and window recovery. |
| R06 | Code complete | Admin and delivery pages call `requireRole` before queries. Pizza orders page no longer deletes during render. HTTP/RSC payloads were not inspected in a browser. |
| R07 | Review blocker fixed | Explicit allowlists for tracking, delivery/admin lists, initial client props and mutation responses; recursive credential contract test. Manual staff creation intentionally returns its one-time PIN. |
| R08 | Review blockers fixed | Retained payment evidence, row-locked capture/cancel, durable inbox retries, provider metadata mapping recovery, cancelled capture refund request and no resurrection. See payment runbook for manual refund and abandoned-hold procedures. |
| R09 | Code complete, provider validation pending | Browser verifies provider captured amount/currency; signed webhook persists an inbox event and retries after failures/restarts. Tests cover recovery, amount mismatch, duplicate and shared-account events. No live Razorpay test-mode run. |
| R10 | In progress | `RateLimitBucket` replaces the in-memory map. Tracking failures are uniform 401. Owner recovery without phone verification is not built, so a known tracking code can still be throttled. |
| R11 | Not started | DeliveryAssignment is schema-only and is not consulted by current access checks. Delivery authorization still uses block-only assignments, so cross-campus isolation remains open. Production campus mappings and enforcement need a separate rollout. |
| R12 | Partially improved | Delivery/admin transitions compare status in writes; payment capture and cancellation share an order lock. Broader WhatsApp transition work remains. |
| R13 | Code complete, verification pending | Deploy workflow requires `VPS_SSH_HOST_KEY` and does not `ssh-keyscan`. No fingerprint was invented. A substituted host cannot be proven until the secret is set and a drill is run. |
| R14 | Reviewed paths fixed | Typed PublicError allowlist replaces message-keyword filtering; payment/order/delivery mutation paths use stable public errors. Test rejects Prisma/provider messages even when they contain domain keywords. Broader route audit remains. |
| R15 | In progress | PINs use `crypto.randomInt`. Review-PIN fallback no longer unlocks tracking. Separate expiring review tokens are in the schema only; links still use the order PIN. |
| R16 | Code complete | Explicit remember/forget controls wired in Cart and Pizza checkout; versioned expiring contact storage tested. Checkout capabilities are separate opaque data, never identity. |
| R17 | In progress | Production startup rejects a missing or placeholder Better Auth secret. Email/password sign-up is disabled in config. Custom staff login remains the staff authority. |
| R18 | In progress | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, and a report-only CSP were added in Next config. Cookie CSRF origin checks are not implemented. HSTS was not enabled. |
| R19 | Not started | Notification retry can still omit the only PIN. |
| R20 | Accounting corrected; refunds manual | Capture on cancelled/exhausted quotes requests refund. Admin cancellation requests review instead of falsely marking REFUNDED. Capture replay preserves completed refunds. Operator must issue and verify provider refunds. |
| R21 | Review blocker fixed | Unique capability-bound checkout attempt, atomic local order link, same-request retry returns existing gateway order; ambiguous creation never creates a second order automatically. Browser guards and payment-status recovery added. |
| R22 | Code complete | Explicit unknown or inactive campuses throw. Omitted code uses only an active `VIT_AP`. No database test was run. |
| R23 | In progress | Duplicate menu/combo lines are merged and quantities above 20 are rejected. Quote confirmation UI is not added. |
| R24 | Not started | Transport rules and deployment docs were not rewritten. |
| R25 | Not started | `AuditEvent` table exists. Writers and restaurant-deletion changes are not in place. |

## Migration

`prisma/migrations/20260924183000_security_remediation/migration.sql`

The complete migration chain passed on disposable PostgreSQL WASM with legacy data and duplicate gateway-ID rollback. Before deployment, repeat on the deployment PostgreSQL version with a backup and a maintenance window (stop old writers while applying the reservation backfill). It does not delete orders. It copies hostel blocks into `DeliveryAssignment` with `campusId` null. Those rows grant nothing until R11 is enforced and an admin sets campuses.

Payment gateway IDs get unique indexes. Duplicate IDs cause the entire transactional migration to roll back; reconcile duplicates before rollout. Pending legacy discounts are reserved in oldest-first order up to remaining capacity. Excess legacy quotes enter refund review if captured. Unpaid abandoned holds can be reclaimed using admin cancellation as documented in PAYMENT-RECONCILIATION-RUNBOOK.md.

## Residual risks that remain by decision or incomplete work

- Anyone who knows a phone number can still read and mutate that phone's spin reward. This is the open S03 ownership gap.
- Remembered browser details and checkout capabilities are not proof of phone ownership.
- Demo accounts already in production are not rotated by this branch.
- Dependency audit reports zero advisories. The Prisma config loader uses an npm override for `deepmerge-ts` 8; retain it until Prisma updates its exact 7.x pin. Prisma CLI commands were checked offline, but no database migration was run.
- SSH host pinning is unverified until `VPS_SSH_HOST_KEY` is provided.
- Capture, refunds, and idempotency were not exercised against Razorpay test mode or two app workers.

## Validation this session

Final validation (25 September 2026):

- `npm test`: 53/53 passed after the final orphan-checkout recovery fix.
- `npm run typecheck`: passed.
- `npm run build`: passed with isolated database/provider environment overrides. Better Auth emitted a base-URL configuration warning; set BETTER_AUTH_URL during deployment.
- `git diff --check`: passed.

Additional evidence:

- Coupon service regression: expiry, late capture, legacy no-reservation accounting, duplicate capture, exhausted-capacity compensation, explicit cancellation, completed-refund replay.
- Payment inbox regression: missing mapping recovery, worker retry, duplicate event, amount mismatch, unrelated order and foreign-app receipt collision, legacy metadata.
- Login, recursive response contracts, public-error contracts, checkout idempotency/capabilities, and contact opt-in tests.
- Full migration chain on disposable PostgreSQL WASM: legacy pending data, capacity backfill, duplicate gateway-ID transaction rollback, payment retention.
- Full and production npm audit: zero advisories. Prisma validation and offline schema diff pass.
- GPT-6 Sol independent scoped re-review: no remaining blocker in the six reviewed paths.

No deployed database, live payment, outbound customer message, production migration, or deployment was performed. Browser/provider end-to-end and multi-worker PostgreSQL concurrency remain rollout checks. Original R11/R15/R18/R19/R24/R25 work is not silently claimed complete by this merge.
