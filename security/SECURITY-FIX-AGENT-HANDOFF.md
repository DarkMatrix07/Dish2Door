# Security remediation handoff for the implementing agent

Prepared: 24 September 2026.

## Your assignment

Fix the security, privacy, payment and cart issues recorded in the two audits below. Preserve legitimate customer ordering, staff operations, delivery assignments and notifications. Work from evidence; do not describe a deployment-dependent risk as an already-proven production exploit.

This document is an implementation specification, not evidence that any fix has been completed. All tasks below start **not started**. Creating this document does not deploy changes, rotate live credentials, send messages or execute real refunds. Follow the user's current authorization when this handoff is assigned for implementation.

**User decision: no phone verification.** Do not add SMS/WhatsApp OTPs, a phone-verification screen, or a mandatory customer login gate for checkout or rewards. Preserve the guest flow. R03 is now a mitigation task: the phone-based ownership weakness cannot be declared fully fixed while a supplied phone remains sufficient to access personal rewards. Do not silently replace phone verification with another mandatory verification flow or disable rewards. Historical audits retain their original recommendations; this decision overrides those recommendations for implementation scope.

Read these before editing:

- [Source audit](./SECURITY-AUDIT-2026-09-24.md): findings S01–S14 and additional observations.
- [Data/payment/cart audit](./DATA-PAYMENT-CART-AUDIT-2026-09-24.md): focused response, checkout and browser-storage findings.
- [Baseline probes](./audit-probes.ts) and [focused probes](./data-payment-cart-probes.ts): isolated demonstrations of existing behavior.
- [Dependency evidence](./npm-audit-production.json): historical scan; rerun before selecting upgrades.

The original audited commit was `391dc63c6a4cf981a809c8ba7248f7ce94638b66`. Recheck the current source and working tree first. File paths below are repository-relative and identify starting points, not the entire allowed edit scope.

## Working rules

1. Read applicable repository instructions, inspect current changes, and preserve other people's work. Do not rerun seeds or migrations against an unidentified database.
2. Use a disposable PostgreSQL database and provider test mode for integration tests. Never run audit mutation probes against real student records. Stub outbound notifications in tests.
3. Keep backend authorization and pricing authoritative. Hiding UI, changing TypeScript types, obfuscating IDs or adding client-only checks does not fix a security boundary.
4. Use migrations for schema changes. Preserve existing order/payment references and document backfill and compatibility requirements. Do not silently grant verified identity, cross-campus access or broader staff privileges during migration.
5. Preserve the controls already working: signed payment-to-order binding, webhook authentication, database pricing, staff API roles, escaped output, raster upload validation and session revocation.
6. Existing audit probes deliberately assert vulnerable behavior. Their old assertions should fail after successful fixes. Convert each relevant scenario into a regression test expecting the secure result; do not weaken the assertions or mock away the protection being tested.
7. Mocked tests cannot establish real transaction isolation, cookie/CSRF behavior, RSC safety or gateway settlement. Use the relevant integration/browser/provider checks described below.
8. Do not print credentials, tracking tokens or real customer data in logs, reports or fixtures. Server-only credential modules must not enter client bundles.
9. Resolve routine implementation choices yourself and record them. If a required product/provider decision is unavailable, complete independent work and state exactly what remains blocked. A phone-format check, browser cookie or payment alone does not establish ownership of a supplied phone number. Respect the no-phone-verification decision above.
10. Do not mark an issue closed until its acceptance checks pass. Distinguish code complete, staging verified and production verified. Do not promise that the website has no remaining vulnerabilities.

## Work order and coverage

| Task | Covers | Priority | Dependencies |
|---|---|---|---|
| R01 | S01 dependency advisories | Immediate | None |
| R02 | S02 seeded credentials | Immediate | None |
| R03 | S03 mitigations; phone ownership gap remains open | High | R10 abuse controls; no phone-verification work |
| R04 | S04 coupon over-redemption | High | Design together with R08, R09, R21 |
| R05 | S05 staff login abuse | High | Shared limiter from R10 |
| R06 | S06 layout-only authorization | High | None |
| R07 | S07 hash exposure and tracking over-disclosure | High | None |
| R08 | S08 destructive pending-payment cleanup | High | Coordinate with R04, R09, R21 |
| R09 | S09 capture verification and HMAC hardening | High | R08 durable payment model |
| R10 | S10 abuse, limiter memory, tracking lockout/oracle | High | None |
| R11 | S11 campus delivery authorization | Medium/conditional | Confirm intended staff boundary |
| R12 | S12 order-transition races | High | R08/R09 state model |
| R13 | S13 deployment SSH authenticity | Medium | Trusted host fingerprint for deployment |
| R14 | S14 internal error disclosure | Medium | None |
| R15 | Review credential scope/expiry; PIN randomness | High | R07; coordinate R19 recovery |
| R16 | Contact/cart persistence on shared devices | Medium | Preserve guest identity behavior |
| R17 | Secondary auth surface and unsafe configuration | High | Consumer inventory |
| R18 | CSRF and browser security headers | Medium | R17 auth architecture |
| R19 | Notification credential recovery and retry reliability | Medium | R12 event delivery; R15 token model |
| R20 | Refund bookkeeping | High integrity | R08/R09 payment model |
| R21 | Duplicate payable checkouts/idempotency | High integrity | Design with R04, R08, R09 |
| R22 | Inactive campus fallback | Medium | None |
| R23 | Cart bounds, duplicate quantities and stale quote | Medium | R04/R21 quote lifecycle |
| R24 | Integration transport/config drift | Medium | Deployment configuration inventory |
| R25 | Audit trail, retention, destructive deletion and secret checks | Medium | R08 retained payment records |

Start with R01/R02 verification and the independent R06/R07/R10/R14/R22 fixes. Establish the identity and payment designs before editing their shared flows. Separate reviewable commits by concern; do not split a migration from code required to use it safely.

## R01 — Upgrade vulnerable dependencies

**Start:** `package.json`, `package-lock.json`, `next.config.ts`, image upload route, deployment/build scripts.

**Implement:**

- Rerun the dependency audit and inspect exact installed/transitive paths. Verify current maintainer advisories and choose supported patched versions; do not assume the versions named in the September audit are still the correct targets.
- Upgrade Next.js and aligned tooling, Sharp and affected reachable runtime dependencies. Regenerate the lockfile through the package manager. Do not use a forced Prisma downgrade to cosmetically remove audit findings.
- Document applicability: the Windows-specific advisory is conditional on a Windows host; AVIF exploitation requires the relevant input path. Keep image allowlists and upload re-encoding intact.
- Record each remaining advisory's path, prerequisite, exposure assessment and follow-up. Do not equate dependency counts with independently exploitable bugs.

**Acceptance:** clean install, typecheck, tests and production build pass; menu images/uploads, login and checkout work. A fresh audit has no unaddressed applicable critical/high runtime issue. Any residual conditional/tooling issue has evidence and an explicit disposition.

## R02 — Remove production demo credentials

**Start:** `prisma/seed.ts`, `DEPLOYMENT.md`, `DATABASE_SETUP.md`, staff provisioning and session helpers.

**Implement:**

- Separate demo data/account creation from production bootstrap. Make demo credentials impossible to create accidentally in production, even if an operator follows the seed instructions.
- Provide an explicit administrator bootstrap/credential-reset command with secure input and no password logging. It must not silently overwrite existing accounts.
- Provide an operational procedure to identify seeded accounts, rotate or deactivate affected accounts, and revoke both custom and secondary sessions. Preserve delivered-order history when deactivating users.

**Acceptance:** production seed refuses demo credentials; secure bootstrap creates the intended role once; reset invalidates old sessions. Verify the live account remediation separately when authorized; a changed seed does not fix already-created accounts.

## R03 — Mitigate phone-based abuse without phone verification

**Start:** `app/api/customer/**`, `app/api/coupons/validate/route.ts`, both customer checkout routes, `lib/customer-identity.ts`, `lib/orders.ts`, cart/pizza/spin components, Prisma schema.

**Implement:**

- Do not implement OTP delivery, phone challenges or a mandatory customer authentication step. Keep the current guest ordering and reward entry flow.
- Stop unpaid guest checkout from overwriting an existing customer's shared name/email. Store submitted contacts on that order; treat any phone-linked profile as unverified. Apply the same rule to WhatsApp checkout and spin mutations.
- Minimize identify/reward responses to what the existing UI actually requires. Remove unnecessary historical activity fields, but do not pretend that a still-public personal reward code is protected by reducing other fields.
- Add shared source/global abuse budgets through R10, canonical phone normalization, atomic reward limits and coupon reservations. These reduce abuse; they do not authenticate the person supplying a phone.
- Forfeit must validate eligibility and applicable reward state and be idempotent. Where an existing action can be bound to a server-issued browser attempt, use that binding to prevent arbitrary replay; an anonymous attempt still does not prove phone ownership.
- Keep legacy customers/orders/rewards explicitly unverified. Do not label a browser session, paid order or matching phone as ownership verification, and do not silently migrate existing phone-bound rewards into a purported verified account.
- Document the residual ability to impersonate a phone for any personal reward operation that remains phone-only. Any stronger ownership mechanism requires a separate product decision; do not introduce one as an unrequested substitute.

**Acceptance:** guest checkout, cart and rewards introduce no verification prompt. An order or spin cannot overwrite another phone-linked customer's shared profile; unnecessary activity fields are removed, rate limits work, and duplicate reward mutations are controlled. Explicitly test and report which phone-only impersonation scenarios remain possible. Mark implemented mitigations complete separately; keep S03's ownership gap open rather than claiming a complete fix.

## R04 — Reserve coupon capacity atomically

**Start:** `lib/orders.ts`, coupon validation, Prisma Coupon/SpinReward/Payment models and migrations.

**Implement:**

- Introduce durable coupon reservations tied to a checkout attempt and authoritative quote, preserving existing reward-binding rules. Phone binding is not verified ownership under the current guest design. Enforce capacity with conditional database operations/locking or serializable transactions with bounded retries; a read followed by an increment is insufficient.
- Ensure committed redemptions plus applicable held capacity cannot exceed the configured limit under concurrency. Bind spin rewards to the same reservation lifecycle.
- Acquire capacity before creating a discounted provider order. Confirmation must consume the reservation once, including when browser confirmation and webhooks race.
- Plan expiry with R08/R21. A local reservation timeout does not prove an already-issued provider order is unpayable. Reconcile/cancel that provider attempt where supported, or retain liability and define compensation for a late payment before recycling capacity.
- Do not take a valid discounted payment and simply reject it because the last coupon use was consumed elsewhere. Preserve an auditable fulfillment/refund decision.

**Acceptance:** sequential and concurrent attempts for a one-use coupon cannot both obtain independently redeemable discount capacity. Duplicate confirmation cannot increment usage twice. Test provider timeouts, late capture after expiry, cancellation, reward restoration and concurrent last-use requests against real disposable PostgreSQL.

## R05 — Protect staff login

**Start:** `app/api/session/login/route.ts`, `lib/auth.ts`, shared rate limiter.

**Implement:**

- Apply distributed per-account, per-source and aggregate budgets before expensive password work. Normalize login identifiers consistently. Trust forwarded addresses only from configured trusted proxies.
- Use generic failures and a precomputed dummy bcrypt hash for nonexistent accounts to reduce timing differences. Apply bounded delays/backoff without sleeping indefinitely in request workers or permanently locking an account because of an outsider's requests.
- Bound password/request length without silently truncating accepted passwords; choose and document a policy compatible with bcrypt's byte limit. Tighten new staff-password policy and add redacted authentication events. Add administrator MFA if supported by the chosen auth design; otherwise record it as a separate remaining control.

**Acceptance:** bounded failures cause throttling across two workers; restart does not reset shared limits; spoofed forwarding headers do not evade policy. Correct credentials work after the allowed recovery interval; generic responses do not reveal account existence.

## R06 — Authorize at protected data access

**Start:** every `app/(admin)/**/page.tsx`, delivery page/layout, privileged query helpers.

**Implement:**

- Add a fail-closed role check before privileged reads and mutations, preferably through reusable server-only data-access functions. Cover all protected pages, including analytics, customers, rewards, notifications, settings, pizza and order views.
- Do not rely on the layout or optional `user?.id` filters. An absent user must never become an omitted database constraint. Preserve API-level role checks.
- Remove request-render side effects that are inappropriate before authorization; move cleanup into the reconciler defined by R08 where appropriate.

**Acceptance:** unauthenticated, expired, inactive and wrong-role requests perform no privileged query/mutation. Inspect complete HTTP HTML and RSC navigation/prefetch responses; there must be no fixture PII in payloads, even when the visible page redirects. Report this as a repaired boundary, not proof that a prior production leak occurred.

## R07 — Replace full model serialization with role-specific responses

**Start:** `lib/order-select.ts`, tracking verify, delivery list/mutations/page, admin client props and order types.

**Implement:**

- Define explicit database selects and response serializers for customer tracking, delivery tasks and administrative views. Do not spread a full Order object and remove a single field.
- Keep password hashes, passcode verifiers, session tokens, provider signatures and internal secrets server-only for every role, including admin browser payloads.
- Tracking should contain only rendered/required status, item, total and delivery context. Exclude internal session data, worker personal phone, receiver name and handover notes unless a documented product requirement justifies specific fields.
- Delivery responses should include the minimum contacts/fulfillment fields staff need, not the customer's tracking credential verifier. Update client types and components to the new contracts.

**Acceptance:** recursively inspect API JSON and serialized RSC props for forbidden fields and sensitive fixture values. Verify list and mutation responses, not just GET. Customer tracking and delivery UI must still work. A TypeScript-only omission is not sufficient.

## R08 — Retain and reconcile payment attempts

**Start:** `cleanupStalePendingOrders` in `lib/orders.ts`, `instrumentation.ts`, admin cleanup callers, webhook handler and Prisma payment relations.

**Implement:**

- Replace timed hard deletion of pending orders with explicit checkout expiry/abandonment state. Preserve provider-to-local mappings, amount/currency snapshots and reconciliation history.
- Introduce durable processing of verified payment events and a reconciliation worker with retries. Acknowledge after durable acceptance; retryable persistence failure must not receive a false success acknowledgement.
- Keep unmatched captured events for reconciliation/triage without unnecessarily retaining full customer/provider payloads. Distinguish a shared-account unrelated payment from a late known attempt using retained references; do not rely on a deleted record's absence.
- Define handling of capture after expiry, cancellation or coupon release: fulfill under the saved quote when permitted, otherwise initiate a tracked compensation/refund workflow. Never silently lose money or resurrect a cancelled order.
- Enforce appropriate uniqueness for gateway identifiers after checking for legacy duplicates. Schedule retention only after financial reconciliation.

**Acceptance:** late capture after five minutes, delayed webhook, webhook-before-browser, restart, retry and transient DB failure all leave money attributable to an order/attempt. Test unknown events without losing evidence or repeatedly processing side effects.

## R09 — Fulfill only captured, matched payments

**Start:** `lib/razorpay.ts`, browser verification route, webhook handler and order confirmation service.

**Implement:**

- Preserve server-secret signature verification and map the order from the signed provider order ID. Never accept the client's application order ID as authority.
- Verify capture through authenticated server-to-server provider data or a verified captured/paid event with all required fields. Match expected amount, currency, order and payment identity to the immutable attempt. An authenticated but incomplete event should trigger a fetch/reconciliation, not invented defaults.
- Use one idempotent confirmation service for browser and webhook paths. Model authorized/pending/captured/failed/refunded distinctly. Respond with a pending/reconciling result when capture is not established; update the client accordingly.
- Validate HMAC format/length and use a constant-time comparison on equal-length buffers. Reject malformed encodings cleanly rather than throwing.

**Acceptance:** forged signatures and cross-order substitutions fail. Authorized-only, wrong-amount/currency and failed payments never release fulfillment. Duplicate/out-of-order events cannot double-redeem a coupon or notify twice. Run actual authorized-to-captured scenarios in provider test mode; local signatures alone do not test settlement.

## R10 — Bound abuse without creating easy owner lockout

**Start:** `lib/rate-limit.ts`, login/customer/coupon/checkout/tracking endpoints, deployment proxy settings.

**Implement:**

- Replace unbounded per-process Maps with shared, atomic, expiring counters. A DB-backed design or dedicated store is acceptable; document cleanup, capacity, failure mode and multi-worker behavior.
- Apply endpoint-appropriate source, guest-attempt and global budgets, plus authenticated staff limits where relevant; changing an unverified phone must not reset the only abuse boundary. Bound input before allocating attacker-controlled keys or performing expensive work.
- Validate tracking-code/PIN syntax. Avoid distinguishable outward failures exposing whether an order exists, while retaining redacted internal reasons.
- Combine guessing controls with a verified-owner recovery/access path so eight outsider guesses do not reliably lock out the owner. Do not solve lockout by removing the guessing limit from a four-digit credential.
- Bound JSON/multipart request bodies before full parsing where feasible, at the application and configured proxy. Document trusted client-IP extraction and behavior during limiter outages. Do not add customer challenge-delivery endpoints.

**Acceptance:** expired keys are evicted; unique garbage codes cannot grow memory without bound; rotating phones and spoofed headers do not evade limits. Test two workers and restart. Wrong PIN responses reveal no order fields, and the authenticated recovery path remains usable without enabling unlimited PIN guesses.

## R11 — Scope delivery access by campus and block

**Start:** User assignment schema, delivery-user management, delivery queries/mutations, Telegram release controls.

**Implement:**

- Verify the intended staff policy. If workers are campus-specific, add explicit campus-plus-block assignments and use them in every read and transition predicate.
- Migrate legacy block-only assignments without guessing that they imply all campuses. Prepare a mapping for review; unresolved assignments must not silently acquire wider access.
- If all delivery workers are deliberately trusted across campuses, document that decision and the accepted exposure instead of calling the source behavior an unconditionally exploitable bug.

**Acceptance:** worker A cannot read or modify same-named blocks at campus B without an explicit assignment. Test list, initial page data, reached and delivered routes with crafted order IDs. Admin workflows must remain functional.

## R12 — Make state transitions and event creation atomic

**Start:** reached/delivered/cancel/WhatsApp-confirm functions in `lib/orders.ts`, admin/delivery routes and notifications.

**Implement:**

- Define allowed order transitions and payment prerequisites centrally. Include expected state, release status and applicable assignment constraints in conditional writes, not merely in a preceding read.
- Handle zero affected rows as an idempotent already-completed result or conflict, according to the transition. Do not regenerate credentials on duplicate confirmation.
- Commit one durable event/outbox entry with the successful state mutation. Enforce event uniqueness and worker claiming so retries do not duplicate business side effects. Account for provider send-timeout ambiguity rather than claiming absolute exactly-once delivery.
- Coordinate coupon restoration and refunds with R04/R20 so cancellation races cannot restore the same benefit twice.

**Acceptance:** real-DB concurrent confirm/reject, cancel/deliver, duplicate-deliver and worker retries produce one allowed outcome and one logical event. A losing transition cannot overwrite the winner's receiver, passcode or timestamps.

## R13 — Pin the deployment SSH host

**Start:** `.github/workflows/deploy.yml`, deployment documentation.

**Implement:** replace runtime trust-on-first-use `ssh-keyscan` with a host key/fingerprint obtained through a trusted administrative channel. Store and use a pinned known_hosts entry, strict host-key checking and a minimally privileged deploy credential. Document legitimate host-key rotation. Review the server-side deployment script when available; it was outside the source audit.

**Acceptance:** correct host succeeds; a substituted/unexpected host key fails. Do not invent a fingerprint or leave a fallback that accepts any key. If the trusted value is unavailable, finish the workflow/documentation and clearly leave deployment verification pending.

## R14 — Return safe errors and useful redacted logs

**Start:** public checkout, verification/webhook, tracking, coupon and session routes; shared API error handling.

**Implement:** distinguish validation/domain failures from unexpected exceptions; return stable public codes/messages and correlation IDs. Normalize malformed JSON handling. Keep provider bodies, Prisma diagnostics, stack traces and credentials out of client responses and redact them from logs. Preserve retryable webhook failure semantics.

**Acceptance:** inject synthetic DB/provider errors containing sentinel secrets; none appear in HTTP responses or unredacted logs. Client errors remain understandable; internal diagnostics can be correlated without logging whole requests or raw tokens.

## R15 — Scope and expire tracking/review credentials

**Start:** `lib/order-codes.ts`, tracking verify/rating routes, review reminder generation, notification templates and TrackingClient.

**Implement:**

- Replace Math.random for security credentials with cryptographic generation. Prefer high-entropy server-verifiable tokens where practical. If a short tracking PIN remains, retain strong online limits and an expiry/recovery design.
- Separate review authority from full order tracking. Store hashed opaque review tokens with order, purpose, expiry and revocation/use state, or use an equivalently revocable server-validated design. Use a separate purpose/key if signing credentials.
- Remove the deterministic review-PIN fallback from full tracking. Restrict review tokens to minimal review context and rating submission; consume them atomically with the rating when appropriate.
- Plan retirement of already-issued review PINs and migration of active tracking credentials. Do not secretly keep the old unlimited fallback for compatibility. Show an actionable expired-link/reissue path.
- Keep tokens out of analytics/referrers/access logs. If links contain tokens, apply redaction and a deliberate exchange/URL-cleanup flow.

**Acceptance:** review credentials cannot fetch full tracking details; expired, revoked, replayed and wrong-order tokens fail. The 2020 fixture no longer unlocks through its review PIN. Active customers can securely recover access. Malformed Unicode/length inputs return a controlled error rather than a crypto-buffer exception.

## R16 — Make remembered customer details deliberate and removable

**Start:** `lib/customer-identity.ts`, `lib/cart.ts`, cart/pizza identity UI, customer logout/switch flow.

**Implement:** add explicit opt-in remembering with a versioned expiry, validate stored data shape and safely discard corrupt/legacy values. Provide a visible “Forget my details”/switch-customer action that clears saved identity, active reward state, relevant temporary credentials and server customer session as appropriate. Clearly separate clearing a cart from clearing an identity. Do not store authentication tokens in localStorage.

**Acceptance:** without opt-in, a later shared-device visit does not restore PII; expired/corrupt data is removed safely. Forget/switch clears the previous customer's identity and coupons and does not automatically query their rewards. With opt-in and unexpired remembered details, the intended returning-user flow works without phone verification; remembered details are not treated as authenticated ownership.

## R17 — Resolve the secondary authentication surface and fail closed on configuration

**Start:** `lib/better-auth.ts`, `app/api/better-auth/[...all]/route.ts`, `lib/auth.ts`, `lib/env.ts`, auth schemas/dependencies.

**Implement:** inventory consumers of Better Auth before deciding whether to remove unused public handlers or integrate them intentionally. Do not enable open staff registration or map a customer session to ADMIN/DELIVERY by default. Reject missing/placeholder/weak production secrets and insecure cookie overrides; retain explicit isolated development configuration. Keep DB auth models until safe migration/consumer analysis permits removal.

**Acceptance:** there is one documented authority for each staff/customer session type; no unintended sign-up/reset endpoint can provision staff access. Production startup fails safely with bad secrets/configuration without printing values. Custom staff login and session revocation still work.

## R18 — Add CSRF and browser protections

**Start:** custom authenticated mutation routes, staff session endpoints, guest-attempt endpoints where used, `next.config.ts`, Nginx/deployment settings.

**Implement:** enforce a deliberate trusted-origin/CSRF policy for browser-cookie mutations; handle login CSRF too. Require appropriate request content types. Keep provider webhooks on signature authentication rather than applying browser-Origin rules to them. Preserve SameSite and secure cookies. Add tested frame restrictions and content-type protections; roll out a CSP compatible with Next.js and Razorpay, using report-only evaluation where appropriate. Configure HSTS only with verified HTTPS/subdomain readiness.

**Acceptance:** legitimate same-origin forms/uploads work; unrelated and hostile sibling-origin browser mutations fail; signatures still authenticate provider webhooks. Framing is blocked as intended, checkout loads, and CSP reporting does not leak tokens. Verify actual response headers through the deployment proxy separately.

## R19 — Recover notification credentials securely

**Start:** `lib/notifications.ts`, `lib/review-reminders.ts`, mail/WhatsApp helpers, R12 outbox and R15 token model.

**Implement:** replace the current retry that silently omits the only tracking credential with a secure recovery/reissue flow delivered to a verified destination or available to an authenticated owner. Do not expose a code through public retry endpoints or persist plaintext PINs indefinitely. If a delivery outbox temporarily needs recoverable credential material, encrypt it with a dedicated server key, tightly restrict access, expire/purge it and document why. Ensure email/WhatsApp retries do not race to invalidate each other's newly issued credentials. Bound timeouts, retries and worker concurrency.

**Acceptance:** initial notification failure followed by retry/recovery gives the legitimate owner usable access; browser/webhook races do not strand them. Old revoked credentials fail. Repeated jobs do not create contradictory active credentials or unbounded notification volume.

## R20 — Distinguish refund requests from completed refunds

**Start:** cancellation service, admin order actions/UI, payment schema, gateway refund events/reconciliation.

**Implement:** choose and document the actual workflow: integrated provider refund or explicit recording of an already-issued external refund. Do not silently turn a bookkeeping checkbox into a live-money action. Model requested/pending/succeeded/failed and partial refunds where supported; store provider reference, amount and audit actor. Use idempotency/unique operation keys and provider confirmation before marking a refund completed. Separate order cancellation from financial settlement.

**Acceptance:** repeated requests cannot refund twice; timeout/failure leaves an honest pending/failed status. Verified external references are matched to the right payment/amount. Partial refunds cannot become a false full REFUNDED flag. Test in gateway test mode; document any remaining manual process.

## R21 — Make checkout creation idempotent

**Start:** both customer checkout routes, CartPageClient/PizzaStorefront, order/payment attempt schema and gateway calls.

**Implement:**

- Introduce a stable per-attempt idempotency key bound to a high-entropy guest attempt capability (or an existing authenticated session where applicable). Do not add a mandatory customer login/phone-verification step. Knowing an order ID or phone must not be sufficient to resume someone else's checkout/contact details.
- Canonicalize/hash the intended cart, campus, fulfillment and quote. Repeating the same key/input resumes one attempt; reusing a key with different content returns conflict. A new intentional purchase gets a new key.
- Use a unique DB constraint and atomic attempt acquisition. Do not hold database locks open while awaiting network calls. Persist provider linkage and recover ambiguous provider-create timeouts using supported lookup/idempotency mechanisms; do not assume an arbitrary header is honored by Razorpay.
- Coordinate the attempt with coupon reservations and quote expiry. Keep checkout busy through modal lifecycle and handle dismissal, network failure and pending capture without falsely showing success. Add equivalent request idempotency to WhatsApp order creation so retries do not duplicate its queue.

**Acceptance:** concurrent retries with one key yield one local attempt and one reconciled provider order, or a safe explicit pending state during ambiguity. Changed payload conflicts; another customer cannot retrieve the attempt. New intentional orders remain possible. Test double-click, refresh, multiple tabs and crash between provider creation and local persistence.

## R22 — Reject inactive or unknown campuses

**Start:** `lib/campus.ts`, all order-creation paths and campus UI.

**Implement:** reject an explicitly unknown/inactive campus. If an omitted code must support legacy clients, use only a documented active default; do not silently choose an arbitrary cheaper/other campus. Require confirmation when an old client lacks a usable selection. Apply the invariant to online, WhatsApp and manual orders, with any administrative override explicit and audited.

**Acceptance:** inactive default, inactive non-default and unknown explicit codes cannot create payable orders. Valid campuses retain their own authoritative fees and delivery rules. No record or provider order is created on rejection.

## R23 — Canonicalize carts and confirm the server quote

**Start:** checkout Zod schemas, shared item resolution/pricing, cart and pizza checkout UI.

**Implement:**

- Validate exactly one menu/combo ID per line. Canonicalize duplicate IDs before applying per-item/per-order quantity limits. Share bounded field/array/request limits across applicable paths and reject totals beyond supported database/provider ranges.
- Document limits as product configuration. The existing 20 limit is per line; do not claim a 20-per-order business policy was already established. Preserve rejection of negative, zero, fractional and oversized quantities.
- Keep prices, discounts, fees and tax server-derived. Return an authoritative itemized quote and expiry/version. When it differs from the cart, present the change for customer confirmation before opening a payable provider attempt.
- Bind the accepted quote to R21's attempt and R04's reservation. Do not silently drop an invalid/expired coupon and proceed to a higher amount without acknowledgement. Prevent price changes between acceptance and provider creation from producing an unreviewed amount.

**Acceptance:** duplicate lines cannot evade configured aggregate limits; huge carts fail before expensive work. Manipulated client prices still have no authority. Changed menu price/expired coupon/inactive item requires an updated quote or rejection. Combo contents, tax/fees and gateway amount match the saved accepted quote.

## R24 — Secure integration transport and repair deployment guidance

**Start:** `lib/env.ts`, `lib/mail.ts`, `lib/whatsapp.ts`, Telegram configuration, `.env.example`, `DEPLOYMENT.md`.

**Implement:** require authenticated HTTPS for external services; allow HTTP only under an explicitly documented local/private transport design. Validate destinations so service secrets cannot be redirected to an arbitrary endpoint through user input. Add appropriate network timeouts, bounded error-body handling and redaction. Align deployment instructions with the actual mailer service rather than obsolete SMTP variables; document the required Razorpay webhook secret and separate test/live configuration. Document what contact/order data each integration receives and who can access it.

**Acceptance:** invalid/insecure production configurations fail with useful non-secret errors; webhook verification is configured; service failure is bounded and retryable. Staging notifications reach intended synthetic recipients only. Confirm live transport and service access separately.

## R25 — Preserve auditability and verify secret/retention boundaries

**Start:** Prisma audit/event models, staff mutations, restaurant deletion, customer exports/deletion, deploy/backup docs, public build assets.

**Implement:**

- Add attributable security/business audit events for staff sign-in outcomes, credential resets, assignment changes, order transitions, refunds, destructive actions and relevant authorization failures. Record actor, target, timestamp, outcome and safe changed fields; never raw credentials, payment proofs or unnecessary PII.
- Replace routine restaurant deletion that cascades through financial history with archival/deactivation, or a separately authorized controlled retention workflow. Preserve records needed by R08 reconciliation.
- Define retention for profiles, order/contact snapshots, notifications, events, tokens and backups with the owner. Do not invent a legal retention period or delete historical financial data to achieve a cleaner UI.
- Review notification exports, Telegram group membership/access and `wa.me` message/history exposure. Minimize data while preserving the intentional flow; do not label all third-party processing as an attacker leak.
- Run a secret scan of a fresh production build and tracked source/history using redacted output. The existing exact-value scanner is only a supplemental check; zero matches in old assets is not proof of safety. Inspect actual public-serving configuration for unintended files/backups.

**Acceptance:** mutations can be traced to an actor without leaking tokens; unauthorized users cannot read audit events. Archiving a restaurant preserves payment mappings/order history. Retention is documented and tested on disposable data. Fresh browser assets contain no private fixture secrets, and any real exposure found gets an explicit rotation/revocation plan.

## Regression suite and release gates

Create tests around external behavior, not textual matches to implementation. Maintain a traceability table from R01–R25 to test names and evidence. At minimum cover:

- Identity matrix: anonymous, distinct guest browsers/attempts A/B, delivery A/B, admin, inactive user, expired/revoked staff session. Test the documented residual phone-only reward impersonation risk separately.
- HTTP and RSC: protected page/API reads, all mutation replies, prefetch/navigation, forbidden nested response fields, CSRF and secure cookies.
- Checkout: tampered prices, bad quantities, duplicate IDs, bounds, wrong campus/shop, expired coupon/quote, same-key replay and cross-owner resume.
- Real database concurrency: last coupon capacity, checkout acquisition, order transitions, outbox/reconciler claims and reward restoration.
- Provider test mode: authorized-only vs captured, mismatched amount/currency, duplicate/out-of-order webhooks, late capture, deleted/unknown references, create timeout, cancellation and refund retries.
- Availability/recovery: multi-worker throttling, bounded storage, owner recovery during guessing, notification failure/reissue and restarts.
- Configuration/build: bad production secrets rejected, no demo accounts, pinned SSH host, fresh dependency audit, typecheck/tests/build, and redacted public-asset secret scan.

Use existing package scripts after inspecting their current definitions. The audit baseline used `npm test` and `npm run typecheck`; do not assume a script name guarantees a valid security test. Keep a concise result for each required check and record unavailable staging/provider/host checks as pending.

### Migration and rollout requirements

1. Inventory legacy records and unresolved duplicates without exporting real PII into the repository. Prepare backward-compatible schema additions and explicit backfills before changing readers/writers.
2. Deploy compatible code/migrations in a documented sequence. Drain or make old workers compatible where their old coupon/payment/cleanup logic could violate the new invariants. Do not let an old cleanup worker keep deleting payment records.
3. State the treatment of in-flight provider orders, active coupon holds, old tracking/review credentials, customer sessions and legacy delivery assignments. Provide recovery UX and operational reconciliation where needed.
4. Validate on staging with realistic synthetic data, take required protected backups under the deployment procedure, and verify post-deploy health and invariants. Do not automatically execute live transactions or notifications as smoke tests.
5. Rollback must preserve payment mappings, existing access boundaries and coupon invariants. Prefer fixing forward over restoring vulnerable behavior or dropping newly written data; any operational disabling of customer features must follow the current user authorization.

## Completion report required from the implementing agent

Update a checklist using `Not started`, `In progress`, `Code complete`, `Staging verified`, `Production verified`, or `Not applicable (evidence)` for each R task. Where progress is blocked, record the exact missing dependency alongside the current status.

For every task provide: files/migrations changed; security invariant enforced; tests and result; legacy-data handling; operational actions still required; and remaining uncertainty. Link to relevant code and test evidence. Keep the historical audits intact and add a separate remediation-results file rather than rewriting old findings as if they never existed.

Finish by listing which deployed risks remain. Passing tests or applying all source patches alone does not establish that production credentials, provider settings, network exposure and historical data leaks have been resolved.
