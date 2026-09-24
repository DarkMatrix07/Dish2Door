# Source security audit — Dish2Door

Date: 24 September 2026. Source commit: `391dc63c6a4cf981a809c8ba7248f7ce94638b66`.

**Result: material security and payment-integrity issues exist. Do not describe this version as secure or challenge a researcher to attack it.** No production compromise has been established. The researcher's specific claim cannot be validated without their technical report.

This is a source and dependency audit, with isolated behavior probes. It is not a production penetration test or a guarantee that every vulnerability has been found. Application code and dependencies were not changed. Only these audit artifacts were added.

## Scope and evidence

- Inspected all 32 API route files, custom staff authentication, customer identity and reward flows, order/pricing/payment logic, tracking, delivery authorization, Prisma schema, upload handling, notification integrations, Telegram controls, deployment workflow, and relevant server/client serialization and HTML rendering paths.
- Reviewed the lockfile and installed Next.js/Sharp versions; ran `npm audit --omit=dev --json`. Raw output is in `security/npm-audit-production.json`.
- `npm test`: 29 passed. `npm run typecheck`: passed before and after audit artifacts were added.
- `npx tsx security/audit-probes.ts`: four behavior probes passed against the actual imported application functions with an in-memory Prisma double. No database connections, real payments, email, WhatsApp, or student records were used. These probes intentionally demonstrate current vulnerable behavior; they are evidence scripts, not regression tests expecting secure behavior.
- No production host, account, TLS configuration, firewall, database privileges, logs, backups, payment dashboard settings, or deployed revision was inspected. No production credentials were tested. Git history was not exhaustively scanned for secrets; `.env` is ignored and `.env.example` is tracked.
- Severity is an assessment of impact and prerequisites, not a claim that exploitation has happened. “Source-confirmed” means the relevant code path exists; only explicitly named probes were executed.

## Prioritized findings

| ID | Severity | Finding | Evidence status |
|---|---|---|---|
| S01 | Critical if applicable | Installed framework/image dependencies have critical advisories | Version match confirmed; deployment reachability conditional |
| S02 | Critical if unchanged in production | Seed creates fixed administrator credentials | Source-confirmed; production account state unknown |
| S03 | High | Customer phone number is treated as proof of ownership | Source-confirmed; identify/forfeit/profile probes reproduced |
| S04 | High | One-use coupon can discount multiple paid orders | Source-confirmed; isolated sequential probe reproduced |
| S05 | High | Staff login has no application rate limit | Source-confirmed; edge protections unknown |
| S06 | High risk, needs HTTP validation | Admin page data relies on layout-only authorization | Missing local checks confirmed; production RSC disclosure not tested |
| S07 | Medium | Delivery clients receive tracking passcode hashes | Source-confirmed serialization |
| S08 | High financial integrity | Pending payment records are deleted after five minutes | Source-confirmed; late payment scenario not exercised against Razorpay |
| S09 | High if capture is delayed/fails | Checkout signature is treated as proof of captured payment | Source-confirmed; gateway settings unknown |
| S10 | Medium | Public APIs permit resource/queue abuse; limiter retains arbitrary keys | Source-confirmed; no load test performed |
| S11 | Medium if campuses require isolation | Delivery assignment is by hostel block, not campus | Source-confirmed; intended staff boundaries need confirmation |
| S12 | Medium | Order transitions use non-atomic check-then-write | Source-confirmed; concurrent database test pending |
| S13 | Medium | Deployment trusts an unverified SSH host key | Source-confirmed; requires network interception |
| S14 | Low | Public error responses can expose internal exception details | Source-confirmed |

### S01 — Vulnerable dependency versions

Evidence: `package-lock.json` pins Next.js **16.2.9** and Sharp **0.34.5**, also present in `node_modules`. The production-filtered npm report flags **16 vulnerable package entries: 1 critical, 10 high, 5 moderate**. These counts include transitive/propagated entries, not 16 independently reachable vulnerabilities.

The Next.js maintainer lists Windows-hosted remote code execution for affected releases before 16.3.3. This workstation uses Windows, but the deployment guide specifies Ubuntu: the Windows-specific advisory must not be asserted to affect that Ubuntu deployment. A second maintainer advisory concerns AVIF image optimization through Sharp/libheif. Remote image sources are allowlisted and the upload route rejects AVIF; attacker-controlled AVIF reachability has not been demonstrated. The installed affected packages nevertheless require urgent upgrading. See [Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) and [AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).

Fix: upgrade Next.js to a supported patched version (the cited advisories identify 16.3.3), align eslint-config-next, update Sharp to a patched release (npm reports 0.35.4), regenerate the lockfile, build, and retest checkout, images, authentication and deployment. Do not blindly run `npm audit fix --force`: the report proposes a Prisma major-version downgrade for some chains.

Other matches include Better Auth 1.6.18, Axios 1.17.0, and Next.js's nested PostCSS 8.4.31. Better Auth's reported magic-link/email-OTP issue is not demonstrated reachable because neither plugin is configured here. Prisma development-tool/MySQL-related matches are not evidence of an exposed MySQL service; the application uses PostgreSQL. Triage every entry using its exact package path and feature prerequisites.

### S02 — Fixed credentials created by the production setup sequence

Evidence: `prisma/seed.ts:20` and `:31` create administrator and delivery accounts with fixed, source-visible passwords. `DEPLOYMENT.md` instructs operators to run this seed. There is no production refusal or forced password change. Existing rows are not overwritten because the upserts have empty updates.

Impact: if the seeded administrator account still has its default password, an outsider can acquire administrator access and read customer records or modify operations. This is conditional, not a verified live account takeover.

Fix: prohibit demo accounts in production, bootstrap administrators using one-time random credentials or an explicit secure setup flow, and verify/delete or rotate any deployed demo accounts. Revoke their existing sessions. Do not rely only on the documentation's reminder to change passwords.

Validation: a production-mode seed should refuse to create demo credentials; old credentials must fail in a controlled deployment test.

### S03 — Unverified phone numbers allow customer impersonation

Evidence: `app/api/customer/identify/route.ts:29`, `app/api/customer/spin/route.ts:47`, `app/api/customer/spin/forfeit/route.ts:19`, `lib/orders.ts:71`, and `app/api/coupons/validate/route.ts:11`.

All these paths trust a phone supplied in the request. A correctly formatted phone number is not proof that the caller owns it.

- Identify returns reviewed/unrated activity, spin usage, and an outstanding coupon code without authentication. It does not return the victim's complete order history, so that stronger claim is not made.
- Spin can consume an eligible victim's daily spin and return their reward. In everyone-mode, arbitrary distinct numbers can also be used to obtain more chances; uniqueness constraints only protect each claimed number.
- Forfeit can consume another person's daily chance and reset their loyalty baseline when they have no outstanding reward. It does not require them to be currently eligible.
- Pending online checkout and WhatsApp checkout update a shared customer's name/email before payment or confirmation. Supplying someone else's phone poisons their customer profile. Existing orders retain their own contact snapshots; this is not demonstrated to redirect past-order notifications.
- Reward phone binding at coupon validation/checkout is bypassable by supplying the same unverified phone. The attacker still has to pay the discounted order total.

The isolated probes reproduced activity/reward disclosure, forfeiture, and profile replacement without cookies.

Fix: verify phone ownership, create a signed server-side customer session, and derive ownership from that session. Keep guest contact snapshots separate from verified customer profiles. Bind rewards to a verified customer ID and apply issuance limits against both identity and abuse signals.

Validation: an anonymous caller and customer A must not read or mutate customer B's rewards/profile, even when A knows B's phone and coupon code.

### S04 — Coupon usage limits are checked too early

Evidence: `lib/orders.ts:239` reads coupon eligibility while creating a pending checkout; `:262` checks `usedCount < maxUses`; `:390` increments usage only after payment. Confirmation does not atomically enforce the coupon cap.

Reproduction: create two pending orders while a `maxUses=1` coupon has `usedCount=0`, then pay each order. Both already contain the discount. Confirmation increments usage to 2. No simultaneous requests are required; opening two checkouts before completing either is sufficient. The isolated probe reproduced both confirmations with synthetic payment inputs.

Impact: promotional discounts can exceed their intended budget, including one-use spin rewards. Atomic per-order payment confirmation prevents duplicate confirmation of one order but does not protect a coupon shared across different orders.

Fix: reserve coupon capacity atomically before creating the priced gateway order, with reservation expiry/reconciliation. Redeem that reservation idempotently on capture. Do not merely reject after taking the customer's money.

Validation: two checkouts contending for the last use must not both acquire discounted payment orders; abandoned reservations must be safely released.

### S05 — Staff password guessing and costly bcrypt calls are unthrottled

Evidence: `app/api/session/login/route.ts:12` performs a database lookup and bcrypt comparison without rate limits, backoff or abuse controls. The Better Auth library's controls do not cover this separate custom login route. Existing-user failures incur bcrypt; nonexistent-user failures return earlier, also creating a potential timing-based enumeration signal.

Impact: password spraying/guessing against admin and delivery users, and CPU pressure through repeated attempts. Fixed demo credentials make this much worse. A reverse proxy could mitigate this, but the provided Nginx example does not configure limits.

Fix: shared per-account and trusted-source limits, progressive delay, generic failures with comparable work, monitoring, and strong administrator authentication. Avoid a permanent account lockout that outsiders can trigger to deny staff access.

Validation: a bounded test should produce 429/backoff after the configured failures, including across multiple application workers.

### S06 — Sensitive server pages rely on layout-only authorization

Evidence: `app/(admin)/admin/layout.tsx:7` checks the role, but pages such as `app/(admin)/admin/customers/page.tsx:21`, `app/(admin)/admin/customers/[phone]/page.tsx:18`, and `app/(admin)/admin/orders/page.tsx:15` query sensitive data without a page/data-layer authorization check. Some page renders also run stale-order cleanup. The delivery page reads an optional user rather than requiring the delivery role before querying.

Next.js documents that layouts do not control execution of all route segments and recommends checking authorization near the data source. That supports flagging this architecture, but a data leak through this exact deployed version's RSC/streaming responses was not reproduced. See [Next.js authorization guidance](https://nextjs.org/docs/app/guides/authentication#layouts-and-auth-checks).

Fix: require the appropriate role before every protected page fetch/mutation or centralize these queries behind an authorized data-access layer. Keep layouts for navigation and presentation.

Validation: inspect full HTML and RSC responses with no session, a delivery session and an expired session. They must contain no customer/order data, not merely show a redirect in the browser.

### S07 — Tracking passcode hashes leave the server

Evidence: `app/api/delivery/orders/route.ts:17` fetches full Order scalars with `orderInclude` and returns them at `:49`; `app/(delivery)/delivery/page.tsx:43` passes the same full orders to a client component. Delivery mutation responses also return full orders. Prisma `include` adds relations; it does not exclude scalar fields such as `trackingPasscodeHash`.

Impact: a delivery user can obtain bcrypt hashes for their accessible orders and attempt the 9,000 possible generated PINs offline, bypassing the API's guessing limit. This can enable customer impersonation/rating submission and continued tracking access. Their role already legitimately sees some contact details, so this is not an anonymous bulk PII leak.

Fix: use explicit response/select allowlists for each role and never serialize credential verifiers to clients. Minimize customer-tracking fields too; its endpoint strips the hash but still returns the broad internal order shape.

Validation: recursively inspect delivery API responses and RSC props; no passcode hashes or unnecessary internal fields should appear.

### S08 — Five-minute cleanup destroys payment reconciliation records

Evidence: `lib/orders.ts:314–326` deletes pending orders older than five minutes; the Prisma schema cascades their Payment rows. `instrumentation.ts` runs cleanup every minute. `confirmOnlineOrderByRazorpayOrderId` subsequently cannot match a payment, and `app/api/webhooks/razorpay/route.ts` acknowledges unmatched events.

Impact: a customer who completes an older payment popup, or whose captured-payment webhook is delayed, can be charged after the local record is deleted. The app loses its mapping and acknowledges the event without fulfillment or an automatic refund. This is a payment integrity bug, not proof of payment-signature forgery.

Fix: retain orders and gateway mappings, mark abandoned checkouts expired, reconcile gateway state and late capture, and route unreconcilable paid events to an alert/refund workflow. Apply retention only after reconciliation.

Validation: simulate capture arriving after the local timeout and after a transient webhook failure; the payment must remain attributable and receive an explicit fulfillment/refund decision.

### S09 — Signature verification does not establish capture

Evidence: `app/api/orders/verify-payment/route.ts:18–29` accepts a valid checkout signature and immediately invokes confirmation; `lib/orders.ts:363–366` marks the order `PAID_ONLINE`. No server-side fetch verifies captured status, amount and currency on this browser path. The webhook path correctly limits itself to captured/paid events.

Impact: when capture is delayed, disabled or fails, a legitimately authorized payment may release fulfillment before money is captured. A valid signature is required; arbitrary unsigned requests cannot mark orders paid. Razorpay explicitly says to deliver only after capture: [integration documentation](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).

Fix: confirm capture from the gateway server-to-server or wait for a verified capture webhook. Match order ID, payment ID, currency and full expected amount; share one idempotent confirmation path.

Validation: a correctly signed but merely authorized payment must remain unfulfilled until capture.

### S10 — Public endpoint abuse and unbounded limiter storage

Evidence: `app/api/orders/create-payment/route.ts:44` has no application throttle and creates database/payment-provider work. Customer identify/spin/forfeit also lack request throttles. `app/api/orders/whatsapp/route.ts:60` limits only the unverified submitted phone, so changing the number evades the cap. Checkout arrays have no overall line-count cap, and several strings have no maximum length. `lib/rate-limit.ts:4–13` never removes expired keys unless that exact key is revisited; tracking routes create buckets for attacker-chosen tracking codes before checking existence.

Impact: database growth, fake confirmation-queue entries, payment-provider/API load, and gradual process-memory growth. Unauthenticated forfeiture also creates customer/usage rows that pending-order cleanup does not remove. No attack rate or production resource exhaustion was measured.

Fix: shared expiring limits with bounded storage, trusted proxy/IP handling, verified-identity limits, body/field/cart caps and abuse monitoring. Validate tracking-code syntax and bound invalid-code traffic. Keep separate limits for guessing versus successful polling; the current per-order limiter can also be used to temporarily lock a known order's owner out.

Validation: rotating claimed phone numbers must not bypass a source/global abuse budget; expired keys must be evicted and oversized requests rejected before expensive processing.

### S11 — Delivery assignments do not distinguish campuses

Evidence: `User.assignedHostelBlocks` in `prisma/schema.prisma` has no campus assignment; `app/api/delivery/orders/route.ts:19–24`, `app/(delivery)/delivery/page.tsx`, and `lib/orders.ts:633–680` scope access/mutations by block and release status only.

Impact: a worker assigned a shared block label can read/advance released orders for that block at any campus. This is a privacy/authorization issue if staff are intended to be campus-specific; it is not a defect if all workers are intentionally trusted across campuses.

Fix if isolation is required: model assignments as campus-plus-block and enforce both on list, reached and delivered paths.

Validation: a worker for campus A must be denied read/write access to the same-named block at campus B.

### S12 — Order status changes race with each other

Evidence: `lib/orders.ts:559` (WhatsApp confirmation), `:633` (delivery reached), `:660` (delivered), `:698` (admin reached), `:716` (admin delivered), and `:740` (cancel) read status and subsequently update by ID without carrying the expected status into the write. A default transaction alone does not guarantee that check-then-write remains valid.

Impact: competing staff requests can overwrite a cancellation/delivery decision, regenerate a WhatsApp order's passcode, or dispatch duplicate notifications. This requires authenticated operations/races; it is not a public administrator bypass.

Fix: conditional state-transition updates and idempotent side effects/outbox events. Return a conflict when another transition won.

Validation: race confirm against reject and cancel against deliver in an isolated real database; exactly one allowed transition and corresponding notification should win.

### S13 — CI accepts whichever SSH key the network presents

Evidence: `.github/workflows/deploy.yml:26` runs `ssh-keyscan` and immediately trusts the resulting key for deployment, without comparing it to an independently pinned fingerprint.

Impact: an attacker able to intercept the initial SSH connection can impersonate the deployment host. This does not by itself disclose the client's SSH private key; it undermines host authenticity and reliable deployment.

Fix: pin the known host key/fingerprint through a trusted channel and enforce strict host-key checking. Review the server-side `/var/www/dish2door.store/deploy.sh`, which is not included in the repository, before declaring deployment audited.

### S14 — Raw internal errors returned by public routes

Evidence: `app/api/orders/create-payment/route.ts:86`, `app/api/orders/whatsapp/route.ts:120`, payment verification and webhook handlers return `error.message` to callers. Some malformed-request paths also lack consistent validation handling.

Impact: database/provider exceptions may expose implementation, schema or submitted-value details. No live secret disclosure was observed. This is not a claim that every exception contains a secret.

Fix: distinguish expected validation/business errors from internal failures, return stable public messages, and log redacted diagnostics with a correlation ID.

Validation: synthetic database/provider failures must not expose stack traces, connection details, queries or sensitive provider responses.

## Additional hardening and correctness observations

- **Secondary auth surface:** `lib/better-auth.ts:11` falls back to a fixed development secret and enables email/password endpoints although application staff auth uses AppSession and passwordHash. Remove the unused surface or integrate it intentionally, disable public staff registration, and reject missing/placeholder production secrets. No Better Auth-to-admin escalation was demonstrated; the required custom passwordHash column and separate sessions matter.
- **CSRF:** custom cookie-authenticated mutations do not check Origin or CSRF tokens. Explicit SameSite=Lax blocks ordinary unrelated-site POST attacks, so this is not reported as an unconditional cross-site bypass. Same-site hostile sibling origins remain a concern, particularly because JSON parsing does not require an application/json content type. Verify allowed origin and request type, or use CSRF tokens.
- **Security headers:** no CSP/frame-ancestors or X-Frame-Options is configured in the repository. Inspect the reverse proxy before calling this a live clickjacking issue. Add a tested policy compatible with Razorpay, plus transport/content-type protections at the appropriate layer.
- **Tracking credentials:** `lib/order-codes.ts:17` uses Math.random for four-digit PINs. Use a cryptographic generator and consider a high-entropy, expiring tracking credential. The separate review PIN is deterministic and does not expire; it is accepted for full delivered-order tracking. Scope review tokens narrowly and give them an expiry. Constant-time Razorpay HMAC comparison is also preferable; no practical timing exploit was established.
- **Refund bookkeeping:** `cancelOrder(refund=true)` only marks database rows REFUNDED; it never calls Razorpay. The UI says “Mark it as refunded,” so this may deliberately record an external refund. Make that workflow explicit, require a gateway refund reference, and reconcile it; do not tell a customer a refund was issued solely from this flag.
- **Notification retries:** retrying ORDER_CREATED omits the original passcode (`lib/notifications.ts:130`), because only its hash was retained. If initial delivery fails and the webhook won confirmation, customers may never receive their code. Implement secure recovery/reissue rather than storing plaintext indefinitely.
- **Transport/config drift:** deployment instructions recommend a raw HTTP WhatsApp sender URL and still describe SMTP while code uses a mailer HTTP service. Use HTTPS or a private loopback/tunnel for secrets and student data; verify the actual configuration. The example environment omits RAZORPAY_WEBHOOK_SECRET although the webhook requires it.
- **Auditability and retention:** notification logs do not provide an administrator/security audit trail. Restaurant deletion explicitly cascades through order history. Define retention, export/deletion controls and attributable administrative events, and protect backups. No specific legal compliance conclusion is made.

## Controls already present

- Every inspected admin API handler checks ADMIN; delivery API handlers check DELIVERY. Delivery-user mutations restrict targets to the delivery role, and password reset revokes existing sessions.
- Custom sessions use 32 random bytes, store only token hashes, set HttpOnly/SameSite cookies, enforce expiry and check active users. Secure cookies default on in production, although an environment override can disable them.
- Server-side menu/campus values determine pricing. Checkout does not trust a submitted total. Shop mode, availability and campus restrictions are checked.
- Browser payment confirmation resolves the order from the signed Razorpay order ID rather than trusting the optional client application order ID. Webhooks authenticate their raw body; per-order paid confirmation is conditional/idempotent.
- Uploads require administrator access, inspect raster signatures and re-encode to WebP under generated filenames. No public arbitrary file upload was identified.
- Tracking requires a passcode and applies a per-order guessing limit. Telegram control handlers check an admin allowlist. Reviewed email/print templates escape user text; no direct SQL-string construction or unescaped user HTML execution was identified in the inspected application paths.

## Remediation and retest sequence

1. Verify deployed revision/OS and dependency exposure; update affected runtime dependencies. Check seeded account status and rotate/revoke where necessary. Retain logs if suspicious activity exists.
2. Add verified customer ownership; close reward/profile impersonation; add staff login and public endpoint abuse controls.
3. Add data-layer authorization and response allowlists; decide and enforce campus delivery boundaries.
4. Implement coupon reservations, durable payment reconciliation and captured-payment confirmation. Make order transitions atomic.
5. Pin deployment host keys, improve errors/configuration/headers, and finish notification/refund/audit workflows.
6. Retest with a disposable database and Razorpay test mode: anonymous vs staff vs customer access, HTML/RSC payloads, concurrent coupon/transition requests, delayed capture/webhooks, expired sessions, rate limits, malformed uploads and response field exposure. Then verify the deployed server configuration and dependency scan.

Ask the reporter privately for the affected URL, reproducible steps, expected versus actual behavior, and redacted evidence. Ask them to avoid accessing other students' records. A source audit cannot establish what they actually found, and patching these findings cannot justify a claim that no vulnerabilities remain.
